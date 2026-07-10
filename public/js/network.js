export class NetworkClient {
  constructor() {
    this.socket = null;
    this.latency = 0;
    this.connected = false;
    this.callbacks = new Map();
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.lastPingAt = 0;
  }

  on(type, callback) {
    if (!this.callbacks.has(type)) this.callbacks.set(type, []);
    this.callbacks.get(type).push(callback);
  }

  emit(type, payload) {
    const list = this.callbacks.get(type) || [];
    for (const callback of list) {
      callback(payload);
    }
  }

  connect() {
    clearTimeout(this.reconnectTimer);

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.emit("connected");
      this.startPinging();
    });

    this.socket.addEventListener("close", () => {
      this.connected = false;
      this.stopPinging();
      this.emit("disconnected");
      this.reconnectTimer = setTimeout(() => this.connect(), 1500);
    });

    this.socket.addEventListener("error", () => {
      this.emit("error");
    });

    this.socket.addEventListener("message", (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "pong") {
        const now = performance.now();
        const rtt = now - Number(message.clientTime || now);
        this.latency += (rtt - this.latency) * 0.25;
        this.emit("latency", this.latency);
        return;
      }

      this.emit(message.type, message);
      this.emit("*", message);
    });
  }

  send(type, payload = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;

    this.socket.send(JSON.stringify({
      type,
      ...payload
    }));

    return true;
  }

  startPinging() {
    this.stopPinging();

    const ping = () => {
      this.lastPingAt = performance.now();
      this.send("ping", { clientTime: this.lastPingAt });
    };

    ping();
    this.pingTimer = setInterval(ping, 1200);
  }

  stopPinging() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
