export class NetworkClient {
  constructor() {
    this.socket = null;
    this.latency = 0;
    this.jitter = 0;
    this.connected = false;
    this.callbacks = new Map();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.lastPingAt = 0;
    this.reconnectAttempt = 0;
    this.closedIntentionally = false;
    this.lastSnapshotSequence = null;
    this.receivedSnapshots = 0;
    this.missedSnapshots = 0;
    this.loss = 0;
    this.interpolationDelay = 110;
    this.connectionGeneration = 0;

    window.addEventListener("online", () => {
      if (!this.connected && !this.closedIntentionally) this.connect(true);
    });
    document.addEventListener("visibilitychange", () => {
      if (this.connected) this.startPinging();
    });
  }

  on(type, callback) {
    if (!this.callbacks.has(type)) this.callbacks.set(type, []);
    this.callbacks.get(type).push(callback);
  }

  emit(type, payload) {
    const list = this.callbacks.get(type) || [];
    for (const callback of list) callback(payload);
  }

  connect(immediate = false) {
    clearTimeout(this.reconnectTimer);
    this.closedIntentionally = false;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const generation = ++this.connectionGeneration;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;

    const isCurrent = () => generation === this.connectionGeneration && this.socket === socket;

    socket.addEventListener("open", () => {
      if (!isCurrent()) {
        socket.close();
        return;
      }
      this.connected = true;
      this.reconnectAttempt = 0;
      this.lastSnapshotSequence = null;
      this.receivedSnapshots = 0;
      this.missedSnapshots = 0;
      this.emit("connected");
      this.startPinging();
    });

    socket.addEventListener("close", () => {
      if (!isCurrent()) return;
      const wasConnected = this.connected;
      this.socket = null;
      this.connected = false;
      this.stopPinging();
      if (wasConnected) this.emit("disconnected");
      if (!this.closedIntentionally) this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (isCurrent()) this.emit("error");
    });

    socket.addEventListener("message", (event) => {
      if (!isCurrent()) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "pong") {
        const now = performance.now();
        const rtt = Math.max(0, now - Number(message.clientTime || now));
        const previous = this.latency || rtt;
        this.latency += (rtt - this.latency) * 0.22;
        this.jitter += (Math.abs(rtt - previous) - this.jitter) * 0.18;
        this.emit("latency", this.latency);
        return;
      }

      if (message.type === "snapshot" && Number.isFinite(message.sequence)) {
        if (this.lastSnapshotSequence !== null) {
          const gap = Math.max(0, Math.round(message.sequence - this.lastSnapshotSequence - 1));
          this.missedSnapshots += gap;
        }
        this.lastSnapshotSequence = message.sequence;
        this.receivedSnapshots++;
        if (this.receivedSnapshots >= 20) {
          const total = this.receivedSnapshots + this.missedSnapshots;
          const sampleLoss = total > 0 ? this.missedSnapshots / total : 0;
          this.loss += (sampleLoss - this.loss) * 0.3;
          this.interpolationDelay = Math.max(90, Math.min(220, 90 + this.jitter * 1.8 + this.loss * 180));
          this.emit("quality", { loss: this.loss, jitter: this.jitter, interpolationDelay: this.interpolationDelay });
          this.receivedSnapshots = 0;
          this.missedSnapshots = 0;
        }
      }
      this.emit(message.type, message);
      this.emit("*", message);
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const base = Math.min(8000, 650 * 2 ** Math.min(4, this.reconnectAttempt++));
    const delay = base * (0.8 + Math.random() * 0.4);
    this.reconnectTimer = setTimeout(() => this.connect(true), delay);
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;

    // Movement and ping data are disposable. Dropping them under severe backpressure
    // prevents an overloaded connection from delaying fire/reload/ability commands.
    if (this.socket.bufferedAmount > 256 * 1024 && (type === "input" || type === "ping")) {
      return false;
    }

    try {
      this.socket.send(JSON.stringify({ type, ...payload }));
      return true;
    } catch {
      return false;
    }
  }

  startPinging() {
    this.stopPinging();
    const interval = document.hidden ? 3000 : 1200;
    const ping = () => {
      this.lastPingAt = performance.now();
      this.send("ping", { clientTime: this.lastPingAt });
    };
    ping();
    this.pingTimer = setInterval(ping, interval);
  }

  stopPinging() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  disconnect() {
    this.closedIntentionally = true;
    this.connectionGeneration++;
    clearTimeout(this.reconnectTimer);
    this.stopPinging();
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}
