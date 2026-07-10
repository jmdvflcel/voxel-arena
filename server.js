"use strict";

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const EC2_AZ = process.env.EC2_AZ || "local";
const INSTANCE_ID = process.env.INSTANCE_ID || "local";

const MAX_HEALTH = 100;
const ATTACK_DAMAGE = 25;
const ATTACK_RANGE = 3.1;
const ATTACK_ARC_COS = Math.cos(Math.PI / 3);
const ATTACK_COOLDOWN_MS = 650;
const RESPAWN_DELAY_MS = 2200;
const SPAWN_INVULNERABILITY_MS = 1800;

const SPAWNS = [
  { x: -12, y: 6, z: -12 },
  { x: 12, y: 6, z: -12 },
  { x: -12, y: 6, z: 12 },
  { x: 12, y: 6, z: 12 },
  { x: 0, y: 6, z: -16 },
  { x: 0, y: 6, z: 16 }
];

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "5m"
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Map();

app.get("/api/status", (_req, res) => {
  res.json({
    status: "online",
    app: "Voxel Blade Arena",
    players: clients.size,
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exceptId = null) {
  for (const [id, client] of clients) {
    if (id !== exceptId) {
      send(client.ws, payload);
    }
  }
}

function cleanName(value) {
  const name = String(value || "")
    .replace(/[^\w\- ]/g, "")
    .trim()
    .slice(0, 18);
  return name || "Fighter";
}

function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)} 72% 56%)`;
}

function randomSpawn() {
  const spawn = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  return {
    x: spawn.x + (Math.random() - 0.5) * 2,
    y: spawn.y,
    z: spawn.z + (Math.random() - 0.5) * 2
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    health: player.health,
    kills: player.kills,
    deaths: player.deaths,
    alive: player.alive
  };
}

function allPlayers() {
  return Array.from(clients.values(), (client) => publicPlayer(client.player));
}

function broadcastPlayer(player) {
  broadcast({ type: "player_update", player: publicPlayer(player) });
}

function validPosition(message) {
  return ["x", "y", "z", "yaw", "pitch"].every((key) => Number.isFinite(message[key])) &&
    message.x >= -45 && message.x <= 45 &&
    message.y >= -20 && message.y <= 50 &&
    message.z >= -45 && message.z <= 45;
}

function respawnPlayer(player) {
  const spawn = randomSpawn();
  Object.assign(player, spawn, {
    health: MAX_HEALTH,
    alive: true,
    invulnerableUntil: Date.now() + SPAWN_INVULNERABILITY_MS
  });

  broadcast({
    type: "respawn",
    player: publicPlayer(player)
  });
}

function performAttack(attacker) {
  const now = Date.now();

  if (!attacker.alive || now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) {
    return;
  }

  attacker.lastAttackAt = now;

  const forwardX = -Math.sin(attacker.yaw);
  const forwardZ = -Math.cos(attacker.yaw);

  let bestTarget = null;
  let bestDistance = Infinity;

  for (const client of clients.values()) {
    const target = client.player;

    if (target.id === attacker.id || !target.alive) continue;
    if (target.invulnerableUntil > now) continue;

    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const dy = Math.abs(target.y - attacker.y);
    const distance = Math.hypot(dx, dz);

    if (distance > ATTACK_RANGE || dy > 2.4 || distance === 0) continue;

    const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;

    if (dot < ATTACK_ARC_COS) continue;

    if (distance < bestDistance) {
      bestTarget = target;
      bestDistance = distance;
    }
  }

  broadcast({
    type: "swing",
    attackerId: attacker.id
  });

  if (!bestTarget) return;

  bestTarget.health = Math.max(0, bestTarget.health - ATTACK_DAMAGE);

  broadcast({
    type: "hit",
    attackerId: attacker.id,
    targetId: bestTarget.id,
    damage: ATTACK_DAMAGE,
    health: bestTarget.health
  });

  if (bestTarget.health > 0) {
    broadcastPlayer(bestTarget);
    return;
  }

  bestTarget.alive = false;
  bestTarget.deaths += 1;
  attacker.kills += 1;

  broadcast({
    type: "kill",
    attacker: publicPlayer(attacker),
    victim: publicPlayer(bestTarget)
  });

  broadcastPlayer(attacker);
  broadcastPlayer(bestTarget);

  setTimeout(() => {
    const current = clients.get(bestTarget.id);
    if (current) {
      respawnPlayer(current.player);
    }
  }, RESPAWN_DELAY_MS);
}

wss.on("connection", (ws) => {
  const id = crypto.randomUUID().slice(0, 8);
  const spawn = randomSpawn();

  const player = {
    id,
    name: `Fighter-${id.slice(0, 4)}`,
    color: randomColor(),
    ...spawn,
    yaw: 0,
    pitch: 0,
    health: MAX_HEALTH,
    kills: 0,
    deaths: 0,
    alive: true,
    lastAttackAt: 0,
    invulnerableUntil: Date.now() + SPAWN_INVULNERABILITY_MS
  };

  clients.set(id, {
    ws,
    player,
    lastStateAt: 0
  });

  send(ws, {
    type: "init",
    id,
    az: EC2_AZ,
    instanceId: INSTANCE_ID,
    players: allPlayers(),
    maxHealth: MAX_HEALTH
  });

  broadcast({
    type: "player_join",
    player: publicPlayer(player)
  }, id);

  broadcast({
    type: "system",
    text: `${player.name} joined the arena`
  });

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
      const oldName = client.player.name;
      client.player.name = cleanName(message.name);

      broadcastPlayer(client.player);

      if (oldName !== client.player.name) {
        broadcast({
          type: "system",
          text: `${oldName} is now ${client.player.name}`
        });
      }
      return;
    }

    if (message.type === "state") {
      const now = Date.now();

      if (now - client.lastStateAt < 30 || !client.player.alive) return;
      if (!validPosition(message)) return;

      client.lastStateAt = now;

      Object.assign(client.player, {
        x: message.x,
        y: message.y,
        z: message.z,
        yaw: message.yaw,
        pitch: message.pitch
      });

      broadcast({
        type: "state",
        player: publicPlayer(client.player)
      }, id);
      return;
    }

    if (message.type === "attack") {
      performAttack(client.player);
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
    const disconnected = clients.get(id);
    clients.delete(id);

    broadcast({
      type: "player_leave",
      id
    });

    if (disconnected) {
      broadcast({
        type: "system",
        text: `${disconnected.player.name} left the arena`
      });
    }
  });

  ws.on("error", () => {
    clients.delete(id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Voxel Blade Arena listening on port ${PORT}`);
});
