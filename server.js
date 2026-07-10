"use strict";

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const EC2_AZ = process.env.EC2_AZ || "local";
const INSTANCE_ID = process.env.INSTANCE_ID || "local";

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "5m"
}));

const clients = new Map();
const worldEdits = new Map();

app.get("/api/status", (_req, res) => {
  res.json({
    status: "online",
    app: "Voxel Arena",
    players: clients.size,
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exceptId = null) {
  for (const [id, client] of clients) {
    if (id !== exceptId) send(client.ws, payload);
  }
}

function cleanName(value) {
  const name = String(value || "")
    .replace(/[^\w\- ]/g, "")
    .trim()
    .slice(0, 18);
  return name || "Player";
}

function validNumber(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validBlockKey(value) {
  if (typeof value !== "string") return false;
  const parts = value.split(",").map(Number);
  return parts.length === 3 &&
    parts.every(Number.isFinite) &&
    Math.abs(parts[0]) <= 80 &&
    parts[1] >= -30 && parts[1] <= 60 &&
    Math.abs(parts[2]) <= 80;
}

function snapshotPlayers() {
  return Array.from(clients.values(), c => c.player);
}

function editsObject() {
  return Object.fromEntries(worldEdits);
}

wss.on("connection", (ws) => {
  const id = crypto.randomUUID().slice(0, 8);
  const player = {
    id,
    name: `Player-${id.slice(0, 4)}`,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 58%)`,
    x: Math.random() * 6 - 3,
    y: 16,
    z: Math.random() * 6 - 3,
    yaw: 0,
    pitch: 0
  };

  clients.set(id, { ws, player, lastStateAt: 0 });

  send(ws, {
    type: "init",
    id,
    az: EC2_AZ,
    instanceId: INSTANCE_ID,
    players: snapshotPlayers(),
    edits: editsObject()
  });

  broadcast({ type: "player_join", player }, id);

  ws.on("message", (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return;
    }

    const client = clients.get(id);
    if (!client || !message || typeof message.type !== "string") return;

    if (message.type === "hello") {
      client.player.name = cleanName(message.name);
      broadcast({ type: "player_update", player: client.player });
      return;
    }

    if (message.type === "state") {
      const now = Date.now();
      if (now - client.lastStateAt < 30) return;
      client.lastStateAt = now;

      const values = ["x", "y", "z", "yaw", "pitch"];
      if (!values.every((key) => Number.isFinite(message[key]))) return;
      if (!validNumber(message.x, -90, 90) ||
          !validNumber(message.y, -40, 80) ||
          !validNumber(message.z, -90, 90)) return;

      Object.assign(client.player, {
        x: message.x,
        y: message.y,
        z: message.z,
        yaw: message.yaw,
        pitch: message.pitch
      });

      broadcast({ type: "state", player: client.player }, id);
      return;
    }

    if (message.type === "block") {
      const allowed = new Set(["grass", "dirt", "stone", "wood", "sand", "leaves", "glass"]);
      if (!validBlockKey(message.key)) return;

      if (message.action === "remove") {
        worldEdits.set(message.key, null);
      } else if (message.action === "add" && allowed.has(message.block)) {
        worldEdits.set(message.key, message.block);
      } else {
        return;
      }

      broadcast({
        type: "block",
        action: message.action,
        key: message.key,
        block: message.block || null
      });
      return;
    }

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 120);
      if (!text) return;
      broadcast({
        type: "chat",
        name: client.player.name,
        text
      });
    }
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast({ type: "player_leave", id });
  });

  ws.on("error", () => {
    clients.delete(id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Voxel Arena listening on port ${PORT}`);
});
