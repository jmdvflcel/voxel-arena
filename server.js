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
const MAX_ARMOR = 50;
const RESPAWN_DELAY_MS = 2600;
const SPAWN_PROTECTION_MS = 1800;

const WEAPONS = Object.freeze({
  sword: {
    label: "Arc Blade",
    type: "melee",
    damage: 40,
    cooldown: 560,
    range: 3.3,
    arcCos: Math.cos((88 * Math.PI) / 180)
  },
  pistol: {
    label: "Pulse Pistol",
    type: "hitscan",
    damage: 27,
    cooldown: 250,
    range: 72,
    spread: 0.008,
    magazine: 12,
    reserve: 48,
    reload: 1350,
    pellets: 1
  },
  rifle: {
    label: "Vector Rifle",
    type: "hitscan",
    damage: 15,
    cooldown: 105,
    range: 92,
    spread: 0.015,
    magazine: 30,
    reserve: 120,
    reload: 1850,
    pellets: 1
  },
  shotgun: {
    label: "Scatter Cannon",
    type: "hitscan",
    damage: 9,
    cooldown: 820,
    range: 44,
    spread: 0.115,
    magazine: 6,
    reserve: 30,
    reload: 2200,
    pellets: 8
  }
});

const SPAWNS = [
  { x: -15, y: 6, z: -15 },
  { x: 15, y: 6, z: -15 },
  { x: -15, y: 6, z: 15 },
  { x: 15, y: 6, z: 15 },
  { x: 0, y: 6, z: -19 },
  { x: 0, y: 6, z: 19 },
  { x: -19, y: 6, z: 0 },
  { x: 19, y: 6, z: 0 }
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
const arenaSolids = new Set();

function solidKey(x, y, z) {
  return `${x},${y},${z}`;
}

function addArenaSolid(x, y, z) {
  arenaSolids.add(solidKey(x, y, z));
}

function buildArenaSolids() {
  const radius = 25;
  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) {
      if (Math.hypot(x, z) <= radius) {
        addArenaSolid(x, 0, z);
        addArenaSolid(x, -1, z);
        addArenaSolid(x, -2, z);
      }
    }
  }
  for (let angle = 0; angle < Math.PI * 2; angle += 0.065) {
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    for (let y = 1; y <= 6; y++) addArenaSolid(x, y, z);
  }
  const pillars = [[-12,-12],[12,-12],[-12,12],[12,12],[0,-16],[0,16],[-16,0],[16,0]];
  for (const [x, z] of pillars) for (let y = 1; y <= 6; y++) addArenaSolid(x, y, z);
  const wall = (x1,z1,x2,z2,y1,y2) => {
    const steps = Math.max(Math.abs(x2-x1), Math.abs(z2-z1));
    for (let i=0;i<=steps;i++) {
      const t = steps ? i/steps : 0;
      const x = Math.round(x1 + (x2-x1)*t);
      const z = Math.round(z1 + (z2-z1)*t);
      for (let y=y1;y<=y2;y++) addArenaSolid(x,y,z);
    }
  };
  wall(-6,-5,6,-5,1,2); wall(-6,5,6,5,1,2); wall(-5,-4,-5,4,1,2); wall(5,-4,5,4,1,2);
  for (let x=-2;x<=2;x++) for (let z=-2;z<=2;z++) addArenaSolid(x,1,z);
  addArenaSolid(0,2,0);
  for (let y=1;y<=4;y++) { addArenaSolid(-20,y,0); addArenaSolid(20,y,0); }
  const ramps=[[-10,0,1],[10,0,-1],[0,-10,1],[0,10,-1]];
  for (const [x,z,direction] of ramps) {
    for (let i=0;i<4;i++) {
      const rx=x===0?x:x+direction*i;
      const rz=z===0?z:z+direction*i;
      for (let w=-1;w<=1;w++) addArenaSolid(rx+(x===0?w:0),i+1,rz+(z===0?w:0));
    }
  }
}

function rayBlocked(origin, direction, distance) {
  for (let t = 0.35; t < distance - 0.45; t += 0.28) {
    const x = Math.round(origin.x + direction.x * t);
    const y = Math.round(origin.y + direction.y * t);
    const z = Math.round(origin.z + direction.z * t);
    if (arenaSolids.has(solidKey(x, y, z))) return true;
  }
  return false;
}

buildArenaSolids();

app.get("/api/status", (_req, res) => {
  res.json({
    status: "online",
    app: "Voxel Combat Arena",
    players: clients.size,
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.floor(process.uptime()),
    weapons: Object.keys(WEAPONS)
  });
});

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
  const cleaned = String(value || "")
    .replace(/[^\w\- ]/g, "")
    .trim()
    .slice(0, 18);
  return cleaned || "Fighter";
}

function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)} 72% 56%)`;
}

function randomSpawn() {
  const base = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  return {
    x: base.x + (Math.random() - 0.5) * 1.8,
    y: base.y,
    z: base.z + (Math.random() - 0.5) * 1.8
  };
}

function initialAmmo() {
  const ammo = {};
  for (const [name, weapon] of Object.entries(WEAPONS)) {
    if (weapon.type === "hitscan") {
      ammo[name] = { mag: weapon.magazine, reserve: weapon.reserve };
    }
  }
  return ammo;
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
    armor: player.armor,
    kills: player.kills,
    deaths: player.deaths,
    alive: player.alive,
    weapon: player.weapon
  };
}

function allPlayers() {
  return Array.from(clients.values(), (client) => publicPlayer(client.player));
}

function weaponState(player) {
  return {
    type: "weapon_state",
    weapon: player.weapon,
    ammo: player.ammo,
    reloading: player.reloadUntil > Date.now(),
    reloadEndsAt: player.reloadUntil
  };
}

function broadcastPlayer(player) {
  broadcast({ type: "player_update", player: publicPlayer(player) });
}

function validPosition(message) {
  return ["x", "y", "z", "yaw", "pitch"].every((key) => Number.isFinite(message[key])) &&
    message.x >= -50 && message.x <= 50 &&
    message.y >= -20 && message.y <= 50 &&
    message.z >= -50 && message.z <= 50;
}

function directionFromAngles(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function addSpread(direction, spread) {
  if (!spread) return direction;
  return normalize({
    x: direction.x + (Math.random() - 0.5) * spread,
    y: direction.y + (Math.random() - 0.5) * spread,
    z: direction.z + (Math.random() - 0.5) * spread
  });
}

function nearestRayTarget(attacker, direction, maxRange) {
  const origin = { x: attacker.x, y: attacker.y - 0.18, z: attacker.z };
  let best = null;
  let bestDistance = Infinity;

  for (const client of clients.values()) {
    const target = client.player;
    if (target.id === attacker.id || !target.alive) continue;
    if (target.invulnerableUntil > Date.now()) continue;

    const center = { x: target.x, y: target.y - 0.85, z: target.z };
    const relative = {
      x: center.x - origin.x,
      y: center.y - origin.y,
      z: center.z - origin.z
    };

    const projection = relative.x * direction.x + relative.y * direction.y + relative.z * direction.z;
    if (projection <= 0 || projection > maxRange) continue;

    const closest = {
      x: origin.x + direction.x * projection,
      y: origin.y + direction.y * projection,
      z: origin.z + direction.z * projection
    };

    const missDistance = Math.hypot(
      center.x - closest.x,
      center.y - closest.y,
      center.z - closest.z
    );

    if (missDistance <= 0.72 && projection < bestDistance && !rayBlocked(origin, direction, projection)) {
      best = target;
      bestDistance = projection;
    }
  }

  return best ? { target: best, distance: bestDistance } : null;
}

function applyDamage(attacker, target, amount, weaponName) {
  if (!target.alive || target.invulnerableUntil > Date.now()) return;

  let remaining = amount;
  const armorDamage = Math.min(target.armor, Math.ceil(remaining * 0.65));
  target.armor -= armorDamage;
  remaining -= armorDamage;
  target.health = Math.max(0, target.health - remaining);

  broadcast({
    type: "damage",
    attackerId: attacker.id,
    targetId: target.id,
    weapon: weaponName,
    damage: amount,
    health: target.health,
    armor: target.armor
  });

  if (target.health > 0) {
    broadcastPlayer(target);
    return;
  }

  target.alive = false;
  target.deaths += 1;
  attacker.kills += 1;

  broadcast({
    type: "kill",
    attacker: publicPlayer(attacker),
    victim: publicPlayer(target),
    weapon: weaponName
  });

  broadcastPlayer(attacker);
  broadcastPlayer(target);

  setTimeout(() => {
    const current = clients.get(target.id);
    if (current) respawnPlayer(current.player);
  }, RESPAWN_DELAY_MS);
}

function respawnPlayer(player) {
  const spawn = randomSpawn();
  Object.assign(player, spawn, {
    health: MAX_HEALTH,
    armor: MAX_ARMOR,
    alive: true,
    weapon: "sword",
    ammo: initialAmmo(),
    reloadUntil: 0,
    invulnerableUntil: Date.now() + SPAWN_PROTECTION_MS
  });

  const client = clients.get(player.id);
  if (client) send(client.ws, weaponState(player));
  broadcast({ type: "respawn", player: publicPlayer(player) });
}

function performMelee(attacker, weaponName, weapon) {
  const now = Date.now();
  const forward = directionFromAngles(attacker.yaw, 0);
  let best = null;
  let bestDistance = Infinity;

  for (const client of clients.values()) {
    const target = client.player;
    if (target.id === attacker.id || !target.alive) continue;
    if (target.invulnerableUntil > now) continue;

    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const dy = Math.abs(target.y - attacker.y);
    const distance = Math.hypot(dx, dz);
    if (distance <= 0 || distance > weapon.range || dy > 2.5) continue;

    const dot = (dx / distance) * forward.x + (dz / distance) * forward.z;
    if (dot < weapon.arcCos) continue;

    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }

  broadcast({
    type: "weapon_fire",
    attackerId: attacker.id,
    weapon: weaponName,
    origin: { x: attacker.x, y: attacker.y - 0.25, z: attacker.z },
    direction: directionFromAngles(attacker.yaw, attacker.pitch)
  });

  if (best) applyDamage(attacker, best, weapon.damage, weaponName);
}

function performHitscan(attacker, weaponName, weapon) {
  const ammo = attacker.ammo[weaponName];
  if (!ammo || ammo.mag <= 0) {
    const client = clients.get(attacker.id);
    if (client) send(client.ws, { type: "dry_fire", weapon: weaponName });
    return;
  }

  ammo.mag -= 1;
  const baseDirection = directionFromAngles(attacker.yaw, attacker.pitch);
  const damageByTarget = new Map();
  const rays = [];

  for (let i = 0; i < weapon.pellets; i++) {
    const direction = addSpread(baseDirection, weapon.spread);
    rays.push(direction);
    const hit = nearestRayTarget(attacker, direction, weapon.range);
    if (hit) {
      damageByTarget.set(
        hit.target.id,
        (damageByTarget.get(hit.target.id) || 0) + weapon.damage
      );
    }
  }

  broadcast({
    type: "weapon_fire",
    attackerId: attacker.id,
    weapon: weaponName,
    origin: { x: attacker.x, y: attacker.y - 0.18, z: attacker.z },
    direction: baseDirection,
    rays
  });

  for (const [targetId, damage] of damageByTarget) {
    const client = clients.get(targetId);
    if (client) applyDamage(attacker, client.player, damage, weaponName);
  }

  const client = clients.get(attacker.id);
  if (client) send(client.ws, weaponState(attacker));
}

function performAttack(player) {
  const weaponName = player.weapon;
  const weapon = WEAPONS[weaponName];
  const now = Date.now();

  if (!weapon || !player.alive) return;
  if (player.reloadUntil > now) return;
  if (now - player.lastFireAt < weapon.cooldown) return;

  player.lastFireAt = now;

  if (weapon.type === "melee") {
    performMelee(player, weaponName, weapon);
  } else {
    performHitscan(player, weaponName, weapon);
  }
}

function selectWeapon(player, weaponName) {
  if (!WEAPONS[weaponName] || !player.alive) return;
  player.weapon = weaponName;
  player.reloadUntil = 0;
  const client = clients.get(player.id);
  if (client) send(client.ws, weaponState(player));
  broadcastPlayer(player);
}

function startReload(player) {
  const weaponName = player.weapon;
  const weapon = WEAPONS[weaponName];
  if (!weapon || weapon.type !== "hitscan" || !player.alive) return;

  const ammo = player.ammo[weaponName];
  if (!ammo || ammo.mag >= weapon.magazine || ammo.reserve <= 0) return;
  if (player.reloadUntil > Date.now()) return;

  player.reloadUntil = Date.now() + weapon.reload;
  const client = clients.get(player.id);
  if (client) send(client.ws, weaponState(player));
  broadcast({ type: "reload_start", playerId: player.id, weapon: weaponName });

  setTimeout(() => {
    const current = clients.get(player.id);
    if (!current) return;
    const currentPlayer = current.player;
    if (!currentPlayer.alive || currentPlayer.weapon !== weaponName) return;
    if (currentPlayer.reloadUntil === 0 || Date.now() + 30 < currentPlayer.reloadUntil) return;

    const currentAmmo = currentPlayer.ammo[weaponName];
    const needed = weapon.magazine - currentAmmo.mag;
    const moved = Math.min(needed, currentAmmo.reserve);
    currentAmmo.mag += moved;
    currentAmmo.reserve -= moved;
    currentPlayer.reloadUntil = 0;

    send(current.ws, weaponState(currentPlayer));
    broadcast({ type: "reload_end", playerId: player.id, weapon: weaponName });
  }, weapon.reload + 20);
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
    armor: MAX_ARMOR,
    kills: 0,
    deaths: 0,
    alive: true,
    weapon: "sword",
    ammo: initialAmmo(),
    lastFireAt: 0,
    reloadUntil: 0,
    invulnerableUntil: Date.now() + SPAWN_PROTECTION_MS
  };

  clients.set(id, { ws, player, lastStateAt: 0 });

  send(ws, {
    type: "init",
    id,
    az: EC2_AZ,
    instanceId: INSTANCE_ID,
    players: allPlayers(),
    weapons: WEAPONS,
    maxHealth: MAX_HEALTH,
    maxArmor: MAX_ARMOR
  });
  send(ws, weaponState(player));

  broadcast({ type: "player_join", player: publicPlayer(player) }, id);
  broadcast({ type: "system", text: `${player.name} joined the arena` });

  ws.on("message", (buffer) => {
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return;
    }

    const client = clients.get(id);
    if (!client || !message || typeof message.type !== "string") return;

    if (message.type === "ping") {
      send(ws, { type: "pong", sentAt: Number(message.sentAt) || Date.now() });
      return;
    }

    if (message.type === "hello") {
      const oldName = client.player.name;
      client.player.name = cleanName(message.name);
      broadcastPlayer(client.player);
      if (oldName !== client.player.name) {
        broadcast({ type: "system", text: `${oldName} is now ${client.player.name}` });
      }
      return;
    }

    if (message.type === "state") {
      const now = Date.now();
      if (now - client.lastStateAt < 28 || !client.player.alive) return;
      if (!validPosition(message)) return;
      client.lastStateAt = now;
      Object.assign(client.player, {
        x: message.x,
        y: message.y,
        z: message.z,
        yaw: message.yaw,
        pitch: message.pitch
      });
      broadcast({ type: "state", player: publicPlayer(client.player) }, id);
      return;
    }

    if (message.type === "attack") {
      performAttack(client.player);
      return;
    }

    if (message.type === "select_weapon") {
      selectWeapon(client.player, String(message.weapon || ""));
      return;
    }

    if (message.type === "reload") {
      startReload(client.player);
      return;
    }

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 120);
      if (!text) return;
      broadcast({ type: "chat", name: client.player.name, text });
    }
  });

  ws.on("close", () => {
    const disconnected = clients.get(id);
    clients.delete(id);
    broadcast({ type: "player_leave", id });
    if (disconnected) {
      broadcast({ type: "system", text: `${disconnected.player.name} left the arena` });
    }
  });

  ws.on("error", () => {
    clients.delete(id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Voxel Combat Arena listening on port ${PORT}`);
});
