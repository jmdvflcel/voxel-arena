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

    const openSocket = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

      this.socket.addEventListener("open", () => {
        this.connected = true;
        this.reconnectAttempt = 0;
        this.emit("connected");
        this.startPinging();
      });

      this.socket.addEventListener("close", () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.stopPinging();
        if (wasConnected) this.emit("disconnected");
        if (!this.closedIntentionally) this.scheduleReconnect();
      });

      this.socket.addEventListener("error", () => this.emit("error"));

      this.socket.addEventListener("message", (event) => {
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

        this.emit(message.type, message);
        this.emit("*", message);
      });
    };

    if (immediate) openSocket();
    else openSocket();
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
    clearTimeout(this.reconnectTimer);
    this.stopPinging();
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }
}
