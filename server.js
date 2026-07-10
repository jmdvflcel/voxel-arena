"use strict";

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const EC2_AZ = process.env.EC2_AZ || "local";
const INSTANCE_ID = process.env.INSTANCE_ID || "local";

const TICK_RATE = 30;
const SNAPSHOT_RATE = 15;
const TICK_MS = 1000 / TICK_RATE;
const SNAPSHOT_EVERY = TICK_RATE / SNAPSHOT_RATE;
const INTEREST_RADIUS = 64;
const MATCH_LENGTH_MS = 5 * 60 * 1000;
const ROUND_BREAK_MS = 9000;
const SCORE_LIMIT = 30;
const RESPAWN_MS = 3000;
const SPAWN_PROTECTION_MS = 1600;
const PLAYER_RADIUS = 0.33;
const STAND_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.25;
const GRAVITY = 22;
const WALK_SPEED = 5.25;
const SPRINT_SPEED = 8.15;
const CROUCH_SPEED = 3.05;
const SLIDE_SPEED = 10.8;
const MOVE_ACCEL = 38;
const AIR_ACCEL = 10;
const GROUND_FRICTION = 13.5;
const AIR_FRICTION = 1.05;
const JUMP_SPEED = 7.75;
const ARENA_RADIUS = 29;
const DASH_SPEED = 18;
const DASH_DURATION_MS = 165;
const DASH_COOLDOWN_MS = 1600;
const POWER_SPEED_MULTIPLIER = 1.35;
const POWER_RAPID_MULTIPLIER = 0.70;
const POWER_DAMAGE_MULTIPLIER = 1.25;
const POWER_JUMP_MULTIPLIER = 1.28;
const OVERSHIELD_CAP = 200;
const REGEN_PER_SECOND = 12;
const REGEN_DELAY_MS = 2200;

const WEAPONS = {
  sword: {
    type: "melee",
    cooldown: 390,
    comboReset: 850,
    ranges: [2.75, 2.9, 3.1],
    damages: [27, 31, 40],
    arcs: [0.48, 0.42, 0.34]
  },
  pistol: {
    type: "hitscan", damage: 28, headMultiplier: 1.65, cooldown: 280,
    magazine: 12, reserve: 72, reload: 1350, range: 76, spread: 0.007, pellets: 1
  },
  smg: {
    type: "hitscan", damage: 9, headMultiplier: 1.35, cooldown: 68,
    magazine: 36, reserve: 180, reload: 1750, range: 58, spread: 0.026, pellets: 1
  },
  rifle: {
    type: "hitscan", damage: 14, headMultiplier: 1.48, cooldown: 94,
    magazine: 30, reserve: 150, reload: 2000, range: 88, spread: 0.016, pellets: 1
  },
  burst: {
    type: "hitscan", damage: 13, headMultiplier: 1.48, cooldown: 390,
    magazine: 27, reserve: 135, reload: 2050, range: 92, spread: 0.012, pellets: 3,
    ammoPerShot: 3
  },
  shotgun: {
    type: "hitscan", damage: 10, headMultiplier: 1.18, cooldown: 820,
    magazine: 6, reserve: 42, reload: 2350, range: 36, spread: 0.082, pellets: 10
  },
  lmg: {
    type: "hitscan", damage: 17, headMultiplier: 1.34, cooldown: 118,
    magazine: 60, reserve: 240, reload: 3200, range: 90, spread: 0.024, pellets: 1
  },
  marksman: {
    type: "hitscan", damage: 62, headMultiplier: 1.72, cooldown: 900,
    magazine: 5, reserve: 30, reload: 2250, range: 125, spread: 0.0025, pellets: 1
  },
  railgun: {
    type: "hitscan", damage: 88, headMultiplier: 1.45, cooldown: 1450,
    magazine: 3, reserve: 15, reload: 2850, range: 145, spread: 0.0005, pellets: 1
  }
};

const POWERUPS = {
  speed: { duration: 12000 },
  dash: { duration: 18000 },
  overshield: { duration: 0 },
  rapid: { duration: 11000 },
  damage: { duration: 10000 },
  regen: { duration: 14000 },
  jump: { duration: 14000 }
};

const COLLIDERS = [
  { minX: -4, maxX: 4, minY: 0, maxY: 2, minZ: -4, maxZ: 4 },
  { minX: -16, maxX: -12, minY: 0, maxY: 3, minZ: -2, maxZ: 2 },
  { minX: 12, maxX: 16, minY: 0, maxY: 3, minZ: -2, maxZ: 2 },
  { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: -16, maxZ: -12 },
  { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: 12, maxZ: 16 },
  { minX: -12, maxX: -8, minY: 0, maxY: 1.2, minZ: -12, maxZ: -8 },
  { minX: 8, maxX: 12, minY: 0, maxY: 1.2, minZ: -12, maxZ: -8 },
  { minX: -12, maxX: -8, minY: 0, maxY: 1.2, minZ: 8, maxZ: 12 },
  { minX: 8, maxX: 12, minY: 0, maxY: 1.2, minZ: 8, maxZ: 12 },
  { minX: -20, maxX: -17, minY: 0, maxY: 2, minZ: -9, maxZ: -5 },
  { minX: 17, maxX: 20, minY: 0, maxY: 2, minZ: 5, maxZ: 9 },
  { minX: -9, maxX: -5, minY: 0, maxY: 2, minZ: 17, maxZ: 20 },
  { minX: 5, maxX: 9, minY: 0, maxY: 2, minZ: -20, maxZ: -17 },
  { minX: -7, maxX: -5, minY: 0, maxY: 1, minZ: -1, maxZ: 5 },
  { minX: 5, maxX: 7, minY: 0, maxY: 1, minZ: -5, maxZ: 1 },
  { minX: -1, maxX: 5, minY: 0, maxY: 1, minZ: 5, maxZ: 7 },
  { minX: -5, maxX: 1, minY: 0, maxY: 1, minZ: -7, maxZ: -5 }
];

const SPAWNS = {
  red: [
    { x: -22, y: 0, z: -8 },
    { x: -22, y: 0, z: 0 },
    { x: -22, y: 0, z: 8 }
  ],
  blue: [
    { x: 22, y: 0, z: -8 },
    { x: 22, y: 0, z: 0 },
    { x: 22, y: 0, z: 8 }
  ]
};

const PICKUP_TEMPLATES = [
  { id: "smg-west", type: "weapon", weapon: "smg", x: -11, y: 1.5, z: 8, respawn: 15000 },
  { id: "burst-east", type: "weapon", weapon: "burst", x: 11, y: 1.5, z: -8, respawn: 18000 },
  { id: "shotgun-center", type: "weapon", weapon: "shotgun", x: 0, y: 2.7, z: 0, respawn: 22000 },
  { id: "lmg-south", type: "weapon", weapon: "lmg", x: 0, y: 1.4, z: -20, respawn: 24000 },
  { id: "marksman-north", type: "weapon", weapon: "marksman", x: 0, y: 3.7, z: 14, respawn: 26000 },
  { id: "railgun-top", type: "weapon", weapon: "railgun", x: 0, y: 3.7, z: -14, respawn: 32000 },
  { id: "armor-red", type: "armor", amount: 55, x: -14, y: 3.6, z: 0, respawn: 18000 },
  { id: "armor-blue", type: "armor", amount: 55, x: 14, y: 3.6, z: 0, respawn: 18000 },
  { id: "health-northwest", type: "health", amount: 45, x: -8, y: 1.5, z: 14, respawn: 16000 },
  { id: "health-southeast", type: "health", amount: 45, x: 8, y: 1.5, z: -14, respawn: 16000 },
  { id: "ammo-northeast", type: "ammo", amount: 0.5, x: 16, y: 1.3, z: 10, respawn: 14000 },
  { id: "ammo-southwest", type: "ammo", amount: 0.5, x: -16, y: 1.3, z: -10, respawn: 14000 },
  { id: "power-speed", type: "power", power: "speed", x: -19, y: 1.4, z: 0, respawn: 24000 },
  { id: "power-dash", type: "power", power: "dash", x: 19, y: 1.4, z: 0, respawn: 24000 },
  { id: "power-shield", type: "power", power: "overshield", x: 0, y: 3.5, z: 0, respawn: 28000 },
  { id: "power-rapid", type: "power", power: "rapid", x: -10, y: 1.5, z: -15, respawn: 26000 },
  { id: "power-damage", type: "power", power: "damage", x: 10, y: 1.5, z: 15, respawn: 26000 },
  { id: "power-regen", type: "power", power: "regen", x: -10, y: 1.5, z: 15, respawn: 26000 },
  { id: "power-jump", type: "power", power: "jump", x: 10, y: 1.5, z: -15, respawn: 26000 }
];

const app = express();
app.disable("x-powered-by");
app.use("/vendor", express.static(path.join(__dirname, "node_modules", "three", "build"), {
  etag: true,
  maxAge: "30d"
}));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "10m"
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", perMessageDeflate: false });

const clients = new Map();
let tickNumber = 0;
let round = createRound();
let pickups = createPickups();

app.get("/api/status", (_req, res) => {
  res.json({
    status: "online",
    app: "Voxel Combat Arena",
    version: "5.0.0",
    players: clients.size,
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    tickRate: TICK_RATE,
    round: {
      status: round.status,
      red: round.score.red,
      blue: round.score.blue,
      remainingSeconds: Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000))
    },
    uptimeSeconds: Math.floor(process.uptime())
  });
});

function createRound() {
  return {
    status: "playing",
    startedAt: Date.now(),
    endsAt: Date.now() + MATCH_LENGTH_MS,
    restartAt: 0,
    score: { red: 0, blue: 0 },
    winner: null
  };
}

function createPickups() {
  return PICKUP_TEMPLATES.map((pickup) => ({
    ...pickup,
    active: true,
    respawnAt: 0
  }));
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exceptId = null) {
  const encoded = JSON.stringify(payload);
  for (const [id, client] of clients) {
    if (id !== exceptId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function cleanName(value) {
  const result = String(value || "")
    .replace(/[^\w\- ]/g, "")
    .trim()
    .slice(0, 18);
  return result || "Fighter";
}

function chooseTeam() {
  let red = 0;
  let blue = 0;
  for (const client of clients.values()) {
    if (client.player.team === "red") red++;
    if (client.player.team === "blue") blue++;
  }
  return red <= blue ? "red" : "blue";
}

function teamColor(team) {
  return team === "red" ? "#ff5968" : "#5aa9ff";
}

function randomSpawn(team) {
  const options = SPAWNS[team];
  const spawn = options[Math.floor(Math.random() * options.length)];
  return {
    x: spawn.x + (Math.random() - 0.5) * 1.8,
    y: spawn.y,
    z: spawn.z + (Math.random() - 0.5) * 1.8
  };
}

function makeAmmo() {
  const result = {};
  for (const [name, weapon] of Object.entries(WEAPONS)) {
    if (weapon.type === "hitscan") {
      result[name] = {
        magazine: weapon.magazine,
        reserve: weapon.reserve
      };
    }
  }
  return result;
}

function makePowers() {
  return {
    speed: 0,
    dash: 0,
    rapid: 0,
    damage: 0,
    regen: 0,
    jump: 0
  };
}

function activePower(player, name, now = Date.now()) {
  return Number(player.powers?.[name] || 0) > now;
}

function publicPowers(player) {
  return {
    speed: player.powers.speed,
    dash: player.powers.dash,
    rapid: player.powers.rapid,
    damage: player.powers.damage,
    regen: player.powers.regen,
    jump: player.powers.jump,
    dashReadyAt: player.dashReadyAt
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    color: player.color,
    x: player.x,
    y: player.y,
    z: player.z,
    vx: player.vx,
    vy: player.vy,
    vz: player.vz,
    yaw: player.yaw,
    pitch: player.pitch,
    health: player.health,
    armor: player.armor,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    alive: player.alive,
    weapon: player.weapon,
    owned: Array.from(player.owned),
    blocking: player.blocking,
    sliding: Date.now() < player.slideUntil,
    crouching: player.input.crouch,
    reloading: player.reload ? player.reload.weapon : null,
    powers: publicPowers(player),
    ack: player.lastInputSeq
  };
}

function pickupPublic(pickup) {
  return {
    id: pickup.id,
    type: pickup.type,
    weapon: pickup.weapon || null,
    power: pickup.power || null,
    amount: pickup.amount || 0,
    x: pickup.x,
    y: pickup.y,
    z: pickup.z,
    active: pickup.active
  };
}

function roundPublic() {
  return {
    status: round.status,
    score: round.score,
    winner: round.winner,
    endsAt: round.endsAt,
    restartAt: round.restartAt,
    serverNow: Date.now()
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circleAabbOverlap(x, z, radius, box) {
  const closestX = clamp(x, box.minX, box.maxX);
  const closestZ = clamp(z, box.minZ, box.maxZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

function collidingBox(player, x, y, z) {
  const height = player.input.crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  for (const box of COLLIDERS) {
    if (y < box.maxY &&
        y + height > box.minY &&
        circleAabbOverlap(x, z, PLAYER_RADIUS, box)) {
      return box;
    }
  }
  return null;
}

function supportHeight(x, z, currentY) {
  let support = 0;
  for (const box of COLLIDERS) {
    if (currentY + 1.3 >= box.maxY &&
        circleAabbOverlap(x, z, PLAYER_RADIUS * 0.8, box)) {
      support = Math.max(support, box.maxY);
    }
  }
  return support;
}

function vectorLength(x, z) {
  return Math.hypot(x, z);
}

function applyFriction(value, friction, dt) {
  const factor = Math.max(0, 1 - friction * dt);
  return value * factor;
}

function simulateMovement(player, dt, now) {
  if (!player.alive || round.status !== "playing") return;

  const input = player.input;
  const stunned = now < player.stunnedUntil;
  const height = input.crouch ? CROUCH_HEIGHT : STAND_HEIGHT;
  const support = supportHeight(player.x, player.z, player.y);
  const grounded = player.y <= support + 0.04 && player.vy <= 0.3;
  if (grounded) player.lastGroundedAt = now;
  if (input.jump && !player.previousJump) player.jumpRequestedAt = now;

  const jumpBuffered = now - player.jumpRequestedAt <= 130;
  const coyoteGrounded = now - player.lastGroundedAt <= 110;
  if (jumpBuffered && coyoteGrounded && !stunned) {
    player.vy = JUMP_SPEED * (activePower(player, "jump", now) ? POWER_JUMP_MULTIPLIER : 1);
    player.jumpRequestedAt = -Infinity;
    player.lastGroundedAt = -Infinity;
  }

  const currentHorizontalSpeed = vectorLength(player.vx, player.vz);

  if (input.crouch &&
      !player.previousCrouch &&
      input.sprint &&
      grounded &&
      currentHorizontalSpeed > 5.2 &&
      !stunned) {
    player.slideUntil = now + 720;
  }

  player.previousJump = input.jump;
  player.previousCrouch = input.crouch;

  const sliding = now < player.slideUntil;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);

  // Standard camera-relative WASD movement:
  // W moves in the direction the camera faces, S moves backward,
  // A strafes left, and D strafes right.
  let rightAmount = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let forwardAmount = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const inputLength = Math.hypot(rightAmount, forwardAmount);

  if (inputLength > 0) {
    rightAmount /= inputLength;
    forwardAmount /= inputLength;
  }

  const worldX = rightAmount * cos - forwardAmount * sin;
  const worldZ = -rightAmount * sin - forwardAmount * cos;

  let maxSpeed = WALK_SPEED;
  if (input.crouch) maxSpeed = CROUCH_SPEED;
  if (input.sprint && !input.crouch) maxSpeed = SPRINT_SPEED;
  if (activePower(player, "speed", now)) maxSpeed *= POWER_SPEED_MULTIPLIER;
  if (player.blocking) maxSpeed *= 0.55;
  if (stunned) maxSpeed = 0;

  const accel = (grounded ? MOVE_ACCEL : AIR_ACCEL) * (activePower(player, "jump", now) ? 1.18 : 1);

  if (now < player.dashUntil) {
    player.vx = player.dashDirection.x * DASH_SPEED;
    player.vz = player.dashDirection.z * DASH_SPEED;
  } else if (sliding) {
    const slideLength = Math.hypot(player.vx, player.vz) || 1;
    player.vx = player.vx / slideLength * Math.max(SLIDE_SPEED * 0.72, currentHorizontalSpeed);
    player.vz = player.vz / slideLength * Math.max(SLIDE_SPEED * 0.72, currentHorizontalSpeed);
  } else {
    const targetVx = worldX * maxSpeed;
    const targetVz = worldZ * maxSpeed;
    const blend = Math.min(1, accel * dt / Math.max(maxSpeed, 1));
    player.vx += (targetVx - player.vx) * blend;
    player.vz += (targetVz - player.vz) * blend;

    if (inputLength === 0) {
      const friction = grounded ? GROUND_FRICTION : AIR_FRICTION;
      player.vx = applyFriction(player.vx, friction, dt);
      player.vz = applyFriction(player.vz, friction, dt);
    }
  }

  const tryMoveAxis = (axis, amount) => {
    if (Math.abs(amount) < 0.00001) return;

    const nextX = axis === "x" ? player.x + amount : player.x;
    const nextZ = axis === "z" ? player.z + amount : player.z;
    const collision = collidingBox(player, nextX, player.y, nextZ);

    if (!collision) {
      if (axis === "x") player.x = nextX;
      else player.z = nextZ;
      return;
    }

    const canMantle = (input.jump || input.forward) &&
      collision.maxY > player.y + 0.15 &&
      collision.maxY <= player.y + 1.15 &&
      player.vy <= 1.5;

    if (canMantle) {
      player.y = collision.maxY + 0.02;
      if (axis === "x") player.x = nextX;
      else player.z = nextZ;
      player.vy = Math.max(player.vy, 2.1);
      return;
    }

    if (axis === "x") player.vx = 0;
    else player.vz = 0;
  };

  const moveX = player.vx * dt;
  const moveZ = player.vz * dt;
  const substeps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) / 0.22));
  for (let step = 0; step < substeps; step++) {
    tryMoveAxis("x", moveX / substeps);
    tryMoveAxis("z", moveZ / substeps);
  }

  const distance = Math.hypot(player.x, player.z);
  const boundary = ARENA_RADIUS - PLAYER_RADIUS;

  if (distance > boundary) {
    const scale = boundary / distance;
    player.x *= scale;
    player.z *= scale;
    player.vx *= 0.4;
    player.vz *= 0.4;
  }

  player.vy -= GRAVITY * dt;
  player.y += player.vy * dt;

  const newSupport = supportHeight(player.x, player.z, player.y);

  if (player.y < newSupport) {
    player.y = newSupport;
    player.vy = 0;
  }

  if (player.y < -8) {
    respawnPlayer(player, true);
  }

  player.history.push({
    t: now,
    x: player.x,
    y: player.y,
    z: player.z,
    crouching: player.input.crouch
  });

  while (player.history.length && now - player.history[0].t > 1200) {
    player.history.shift();
  }

  if (player.reload && now >= player.reload.endsAt) {
    finishReload(player);
  }
}

function finishReload(player) {
  const weaponName = player.reload.weapon;
  const weapon = WEAPONS[weaponName];
  const ammo = player.ammo[weaponName];

  if (weapon && ammo) {
    const needed = weapon.magazine - ammo.magazine;
    const moved = Math.min(needed, ammo.reserve);
    ammo.magazine += moved;
    ammo.reserve -= moved;
  }

  player.reload = null;

  send(player.ws, {
    type: "ammo",
    weapon: weaponName,
    ammo: player.ammo[weaponName],
    reloading: false
  });

  broadcast({
    type: "reload_state",
    id: player.id,
    weapon: weaponName,
    reloading: false
  }, player.id);
}

function raySphere(origin, direction, center, radius) {
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;

  const b = ox * direction.x + oy * direction.y + oz * direction.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const discriminant = b * b - c;

  if (discriminant < 0) return Infinity;

  const t = -b - Math.sqrt(discriminant);
  return t >= 0 ? t : Infinity;
}

function rayAabb(origin, direction, box) {
  let tMin = 0;
  let tMax = Infinity;

  for (const axis of ["x", "y", "z"]) {
    const o = origin[axis];
    const d = direction[axis];
    const min = box["min" + axis.toUpperCase()];
    const max = box["max" + axis.toUpperCase()];

    if (Math.abs(d) < 0.000001) {
      if (o < min || o > max) return Infinity;
      continue;
    }

    let t1 = (min - o) / d;
    let t2 = (max - o) / d;

    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) return Infinity;
  }

  return tMin >= 0 ? tMin : tMax >= 0 ? 0 : Infinity;
}

function nearestWallDistance(origin, direction, maxRange) {
  let nearest = maxRange;

  for (const box of COLLIDERS) {
    const distance = rayAabb(origin, direction, box);
    if (distance < nearest) nearest = distance;
  }

  return nearest;
}

function historyPosition(player, targetTime) {
  if (!player.history.length) {
    return { x: player.x, y: player.y, z: player.z, crouching: player.input.crouch };
  }

  if (targetTime <= player.history[0].t) return player.history[0];
  const last = player.history[player.history.length - 1];
  if (targetTime >= last.t) return last;

  for (let index = 0; index < player.history.length - 1; index++) {
    const older = player.history[index];
    const newer = player.history[index + 1];
    if (older.t <= targetTime && newer.t >= targetTime) {
      const span = Math.max(1, newer.t - older.t);
      const alpha = clamp((targetTime - older.t) / span, 0, 1);
      return {
        x: older.x + (newer.x - older.x) * alpha,
        y: older.y + (newer.y - older.y) * alpha,
        z: older.z + (newer.z - older.z) * alpha,
        crouching: alpha < 0.5 ? older.crouching : newer.crouching
      };
    }
  }

  return last;
}

function playerHitZones(player, position) {
  const crouching = Boolean(position.crouching);
  const baseY = position.y;
  const headBottom = baseY + (crouching ? 0.95 : 1.42);
  const headTop = baseY + (crouching ? 1.38 : 1.88);
  const torsoTop = baseY + (crouching ? 1.02 : 1.45);

  return [
    {
      zone: "head",
      multiplier: null,
      box: {
        minX: position.x - 0.245, maxX: position.x + 0.245,
        minY: headBottom, maxY: headTop,
        minZ: position.z - 0.245, maxZ: position.z + 0.245
      }
    },
    {
      zone: "torso",
      multiplier: 1,
      box: {
        minX: position.x - 0.34, maxX: position.x + 0.34,
        minY: baseY + 0.55, maxY: torsoTop,
        minZ: position.z - 0.25, maxZ: position.z + 0.25
      }
    },
    {
      zone: "legs",
      multiplier: 0.78,
      box: {
        minX: position.x - 0.29, maxX: position.x + 0.29,
        minY: baseY + 0.02, maxY: baseY + 0.65,
        minZ: position.z - 0.24, maxZ: position.z + 0.24
      }
    }
  ];
}

function nearestPlayerHit(origin, direction, target, position, weapon, limit) {
  let nearest = null;
  for (const zone of playerHitZones(target, position)) {
    const distance = rayAabb(origin, direction, zone.box);
    if (distance >= limit || (nearest && distance >= nearest.distance)) continue;
    nearest = {
      distance,
      zone: zone.zone,
      multiplier: zone.zone === "head" ? weapon.headMultiplier : zone.multiplier
    };
  }
  return nearest;
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
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function spreadDirection(baseDirection, spread) {
  if (spread <= 0) return baseDirection;

  const jitter = {
    x: baseDirection.x + (Math.random() - 0.5) * spread,
    y: baseDirection.y + (Math.random() - 0.5) * spread,
    z: baseDirection.z + (Math.random() - 0.5) * spread
  };

  return normalize(jitter);
}

function sameTeam(a, b) {
  return a.team === b.team;
}

function validTarget(attacker, target, now) {
  return target.id !== attacker.id &&
    target.alive &&
    !sameTeam(attacker, target) &&
    now >= target.invulnerableUntil;
}

function applyDamage(attacker, target, amount, meta = {}) {
  const now = Date.now();

  if (!validTarget(attacker, target, now)) return null;

  if (meta.kind === "melee" && target.blocking) {
    const toAttackerX = attacker.x - target.x;
    const toAttackerZ = attacker.z - target.z;
    const length = Math.hypot(toAttackerX, toAttackerZ) || 1;
    const directionToAttackerX = toAttackerX / length;
    const directionToAttackerZ = toAttackerZ / length;
    const targetForwardX = -Math.sin(target.yaw);
    const targetForwardZ = -Math.cos(target.yaw);
    const facing = directionToAttackerX * targetForwardX + directionToAttackerZ * targetForwardZ;

    if (facing > 0.25) {
      if (now - target.blockStartedAt <= 240) {
        attacker.stunnedUntil = now + 760;
        broadcast({
          type: "parry",
          defenderId: target.id,
          attackerId: attacker.id
        });
        return { parried: true };
      }

      amount *= 0.32;
    }
  }

  if (activePower(attacker, "damage", now)) {
    amount *= POWER_DAMAGE_MULTIPLIER;
  }

  target.lastDamagedAt = now;
  const armorAbsorb = Math.min(target.armor, amount * 0.65);
  target.armor -= armorAbsorb;
  const healthDamage = amount - armorAbsorb;
  target.health = Math.max(0, target.health - healthDamage);

  target.damageContributors.set(attacker.id, now);

  send(target.ws, {
    type: "damaged",
    attackerId: attacker.id,
    amount: Math.round(healthDamage),
    armorAmount: Math.round(armorAbsorb),
    health: Math.round(target.health),
    armor: Math.round(target.armor),
    direction: {
      x: attacker.x - target.x,
      z: attacker.z - target.z
    }
  });

  send(attacker.ws, {
    type: "hit_confirm",
    targetId: target.id,
    damage: Math.round(healthDamage),
    armorDamage: Math.round(armorAbsorb),
    headshot: Boolean(meta.headshot),
    killed: target.health <= 0
  });

  broadcast({
    type: "player_update",
    player: publicPlayer(target)
  });

  if (target.health <= 0) {
    eliminatePlayer(attacker, target, meta);
  }

  return {
    parried: false,
    healthDamage,
    armorDamage: armorAbsorb
  };
}

function eliminatePlayer(attacker, target, meta) {
  if (!target.alive) return;

  const now = Date.now();

  target.alive = false;
  target.deaths += 1;
  target.respawnAt = now + RESPAWN_MS;
  target.blocking = false;
  target.reload = null;
  attacker.kills += 1;
  round.score[attacker.team] += 1;

  const assists = [];

  for (const [contributorId, timestamp] of target.damageContributors) {
    if (contributorId === attacker.id || now - timestamp > 8000) continue;
    const contributor = clients.get(contributorId)?.player;
    if (contributor && contributor.team === attacker.team) {
      contributor.assists += 1;
      assists.push(contributor.id);
      send(contributor.ws, { type: "assist" });
    }
  }

  target.damageContributors.clear();

  broadcast({
    type: "kill",
    killer: publicPlayer(attacker),
    victim: publicPlayer(target),
    weapon: meta.weapon || "unknown",
    headshot: Boolean(meta.headshot),
    assists,
    round: roundPublic()
  });

  if (round.score[attacker.team] >= SCORE_LIMIT) {
    endRound(attacker.team);
  }
}

function respawnPlayer(player, immediate = false) {
  const spawn = randomSpawn(player.team);

  Object.assign(player, spawn, {
    vx: 0,
    vy: 0,
    vz: 0,
    health: 100,
    armor: 25,
    alive: true,
    respawnAt: 0,
    invulnerableUntil: Date.now() + SPAWN_PROTECTION_MS,
    blocking: false,
    reload: null,
    slideUntil: 0,
    stunnedUntil: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirection: { x: 0, z: 0 },
    powers: makePowers(),
    lastDamagedAt: 0,
    lastGroundedAt: Date.now(),
    jumpRequestedAt: -Infinity
  });

  player.weapon = "rifle";
  player.owned = new Set(["sword", "pistol", "smg", "rifle"]);
  player.ammo = makeAmmo();
  player.history = [{ t: Date.now(), x: player.x, y: player.y, z: player.z, crouching: false }];

  broadcast({
    type: "respawn",
    player: publicPlayer(player),
    ammo: player.ammo,
    immediate
  });
}

function endRound(winner) {
  if (round.status !== "playing") return;

  round.status = "ended";
  round.winner = winner;
  round.restartAt = Date.now() + ROUND_BREAK_MS;

  broadcast({
    type: "round_end",
    round: roundPublic()
  });
}

function resetRound() {
  round = createRound();
  pickups = createPickups();

  for (const client of clients.values()) {
    const player = client.player;
    player.kills = 0;
    player.deaths = 0;
    player.assists = 0;
    respawnPlayer(player, true);
  }

  broadcast({
    type: "round_start",
    round: roundPublic(),
    pickups: pickups.map(pickupPublic)
  });
}

function checkRound(now) {
  if (round.status === "playing" && now >= round.endsAt) {
    const winner = round.score.red === round.score.blue
      ? "draw"
      : round.score.red > round.score.blue ? "red" : "blue";
    endRound(winner);
  }

  if (round.status === "ended" && now >= round.restartAt) {
    resetRound();
  }
}

function startReload(player) {
  if (!player.alive || player.reload || player.stunnedUntil > Date.now()) return;

  const weaponName = player.weapon;
  const weapon = WEAPONS[weaponName];
  const ammo = player.ammo[weaponName];

  if (!weapon || weapon.type !== "hitscan" || !ammo) return;
  if (ammo.magazine >= weapon.magazine || ammo.reserve <= 0) return;

  player.reload = {
    weapon: weaponName,
    endsAt: Date.now() + weapon.reload
  };

  send(player.ws, {
    type: "ammo",
    weapon: weaponName,
    ammo,
    reloading: true,
    reloadEndsAt: player.reload.endsAt
  });

  broadcast({
    type: "reload_state",
    id: player.id,
    weapon: weaponName,
    reloading: true
  }, player.id);
}

function handleHitscan(attacker, weaponName, message) {
  const now = Date.now();
  const weapon = WEAPONS[weaponName];

  if (!weapon || weapon.type !== "hitscan") return;
  if (!attacker.alive || round.status !== "playing") return;
  if (attacker.stunnedUntil > now || attacker.blocking) return;
  if (attacker.weapon !== weaponName || !attacker.owned.has(weaponName)) return;
  if (attacker.reload) return;
  if (now < attacker.nextAttackAt) return;

  const ammo = attacker.ammo[weaponName];

  if (!ammo || ammo.magazine <= 0) {
    send(attacker.ws, { type: "empty", weapon: weaponName });
    return;
  }

  const ammoCost = weapon.ammoPerShot || 1;
  if (ammo.magazine < ammoCost) {
    send(attacker.ws, { type: "empty", weapon: weaponName });
    return;
  }
  ammo.magazine -= ammoCost;
  const cooldownMultiplier = activePower(attacker, "rapid", now) ? POWER_RAPID_MULTIPLIER : 1;
  attacker.nextAttackAt = now + weapon.cooldown * cooldownMultiplier;

  const latency = clamp(Number(message.latency) || 0, 0, 240);
  const rewindTime = now - latency * 0.5;

  const baseDirection = directionFromAngles(attacker.yaw, attacker.pitch);
  const origin = {
    x: attacker.x,
    y: attacker.y + 1.57,
    z: attacker.z
  };

  const damageByTarget = new Map();
  const impacts = [];

  for (let pellet = 0; pellet < weapon.pellets; pellet++) {
    const direction = spreadDirection(baseDirection, weapon.spread);
    const wallDistance = nearestWallDistance(origin, direction, weapon.range);

    let nearestHit = null;
    let nearestDistance = wallDistance;
    let headshot = false;
    let zoneMultiplier = 1;

    for (const client of clients.values()) {
      const target = client.player;
      if (!validTarget(attacker, target, now)) continue;

      const position = historyPosition(target, rewindTime);
      const hit = nearestPlayerHit(origin, direction, target, position, weapon, nearestDistance);

      if (hit) {
        nearestHit = target;
        nearestDistance = hit.distance;
        headshot = hit.zone === "head";
        zoneMultiplier = hit.multiplier;
      }
    }

    const end = {
      x: origin.x + direction.x * nearestDistance,
      y: origin.y + direction.y * nearestDistance,
      z: origin.z + direction.z * nearestDistance
    };

    impacts.push(end);

    if (nearestHit) {
      const existing = damageByTarget.get(nearestHit.id) || {
        target: nearestHit,
        damage: 0,
        headshot: false
      };

      existing.damage += weapon.damage * zoneMultiplier;
      existing.headshot = existing.headshot || headshot;
      damageByTarget.set(nearestHit.id, existing);
    }
  }

  broadcast({
    type: "fire",
    id: attacker.id,
    weapon: weaponName,
    origin,
    direction: baseDirection,
    impacts,
    seed: Math.floor(Math.random() * 1000000)
  });

  for (const entry of damageByTarget.values()) {
    applyDamage(attacker, entry.target, entry.damage, {
      kind: "hitscan",
      weapon: weaponName,
      headshot: entry.headshot
    });
  }

  send(attacker.ws, {
    type: "ammo",
    weapon: weaponName,
    ammo,
    reloading: false
  });
}

function handleMelee(attacker, message) {
  const now = Date.now();
  const weapon = WEAPONS.sword;

  if (!attacker.alive || round.status !== "playing") return;
  if (attacker.weapon !== "sword" || !attacker.owned.has("sword")) return;
  if (attacker.stunnedUntil > now || attacker.blocking) return;
  if (now < attacker.nextAttackAt) return;

  if (now - attacker.lastComboAt > weapon.comboReset) {
    attacker.combo = 0;
  } else {
    attacker.combo = (attacker.combo + 1) % 3;
  }

  attacker.lastComboAt = now;
  attacker.nextAttackAt = now + weapon.cooldown + attacker.combo * 45;

  const combo = attacker.combo;
  const range = weapon.ranges[combo];
  const minimumDot = weapon.arcs[combo];
  const forwardX = -Math.sin(attacker.yaw);
  const forwardZ = -Math.cos(attacker.yaw);

  broadcast({
    type: "melee",
    id: attacker.id,
    combo
  });

  let bestTarget = null;
  let bestDistance = Infinity;

  for (const client of clients.values()) {
    const target = client.player;
    if (!validTarget(attacker, target, now)) continue;

    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    const dy = Math.abs(target.y - attacker.y);
    const distance = Math.hypot(dx, dz);

    if (distance <= 0 || distance > range || dy > 2.2) continue;

    const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;
    if (dot < minimumDot) continue;

    const origin = { x: attacker.x, y: attacker.y + 1.1, z: attacker.z };
    const direction = normalize({ x: dx, y: 0, z: dz });
    const wallDistance = nearestWallDistance(origin, direction, distance + 0.1);
    if (wallDistance < distance - 0.1) continue;

    if (distance < bestDistance) {
      bestTarget = target;
      bestDistance = distance;
    }
  }

  if (bestTarget) {
    applyDamage(attacker, bestTarget, weapon.damages[combo], {
      kind: "melee",
      weapon: "sword"
    });
  }
}

function switchWeapon(player, weaponName) {
  if (!player.alive || !player.owned.has(weaponName) || !WEAPONS[weaponName]) return;

  player.weapon = weaponName;
  player.reload = null;
  player.blocking = false;

  send(player.ws, {
    type: "weapon_state",
    weapon: player.weapon,
    owned: Array.from(player.owned),
    ammo: player.ammo
  });

  broadcast({
    type: "weapon_switch",
    id: player.id,
    weapon: weaponName
  }, player.id);
}

function handleBlock(player, active) {
  const now = Date.now();

  if (player.weapon !== "sword" || !player.alive || player.stunnedUntil > now) {
    player.blocking = false;
    return;
  }

  if (active && !player.blocking) {
    player.blockStartedAt = now;
  }

  player.blocking = Boolean(active);

  broadcast({
    type: "block_state",
    id: player.id,
    blocking: player.blocking
  }, player.id);
}

function checkPickups(now) {
  for (const pickup of pickups) {
    if (!pickup.active) {
      if (now >= pickup.respawnAt) {
        pickup.active = true;
        pickup.respawnAt = 0;
        broadcast({ type: "pickup_state", pickup: pickupPublic(pickup) });
      }
      continue;
    }

    for (const client of clients.values()) {
      const player = client.player;
      if (!player.alive) continue;

      const distance = Math.hypot(
        player.x - pickup.x,
        player.y + 0.8 - pickup.y,
        player.z - pickup.z
      );

      if (distance > 1.35) continue;

      let collected = false;

      if (pickup.type === "health" && player.health < 100) {
        player.health = Math.min(100, player.health + pickup.amount);
        collected = true;
      } else if (pickup.type === "armor" && player.armor < 100) {
        player.armor = Math.min(100, player.armor + pickup.amount);
        collected = true;
      } else if (pickup.type === "weapon") {
        player.owned.add(pickup.weapon);
        const ammo = player.ammo[pickup.weapon];
        const weapon = WEAPONS[pickup.weapon];

        if (ammo && weapon) {
          ammo.magazine = weapon.magazine;
          ammo.reserve = Math.max(ammo.reserve, Math.floor(weapon.reserve * 0.6));
        }

        player.weapon = pickup.weapon;
        collected = true;
      } else if (pickup.type === "ammo") {
        for (const [weaponName, ammo] of Object.entries(player.ammo)) {
          const weapon = WEAPONS[weaponName];
          ammo.reserve = Math.min(
            weapon.reserve * 2,
            ammo.reserve + Math.ceil(weapon.reserve * pickup.amount)
          );
        }
        collected = true;
      } else if (pickup.type === "power" && POWERUPS[pickup.power]) {
        if (pickup.power === "overshield") {
          player.armor = Math.min(OVERSHIELD_CAP, player.armor + 100);
        } else {
          player.powers[pickup.power] = now + POWERUPS[pickup.power].duration;
          if (pickup.power === "dash") {
            player.dashReadyAt = now;
          }
        }
        collected = true;
      }

      if (!collected) continue;

      pickup.active = false;
      pickup.respawnAt = now + pickup.respawn;

      send(player.ws, {
        type: "pickup_collected",
        pickup: pickupPublic(pickup),
        player: publicPlayer(player),
        ammo: player.ammo
      });

      broadcast({
        type: "pickup_state",
        pickup: pickupPublic(pickup),
        collectorId: player.id
      });

      break;
    }
  }
}

function updatePowers(now, dt) {
  for (const client of clients.values()) {
    const player = client.player;
    if (!player.alive) continue;

    if (activePower(player, "regen", now) &&
        now - player.lastDamagedAt >= REGEN_DELAY_MS &&
        player.health < 100) {
      const before = player.health;
      player.health = Math.min(100, player.health + REGEN_PER_SECOND * dt);
      if (Math.floor(before) !== Math.floor(player.health)) {
        send(player.ws, {
          type: "vitals",
          health: Math.round(player.health),
          armor: Math.round(player.armor)
        });
      }
    }
  }
}

function handleAbility(player, ability) {
  const now = Date.now();
  if (ability !== "dash" || !player.alive || round.status !== "playing") return;
  if (!activePower(player, "dash", now) || now < player.dashReadyAt || player.stunnedUntil > now) return;

  let x = Number(player.input.right) - Number(player.input.left);
  let z = Number(player.input.forward) - Number(player.input.backward);
  if (Math.hypot(x, z) < 0.1) z = 1;

  const length = Math.hypot(x, z) || 1;
  x /= length;
  z /= length;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const worldX = x * cos - z * sin;
  const worldZ = -x * sin - z * cos;

  player.dashDirection = { x: worldX, z: worldZ };
  player.dashUntil = now + DASH_DURATION_MS;
  player.dashReadyAt = now + DASH_COOLDOWN_MS;
  player.vx = worldX * DASH_SPEED;
  player.vz = worldZ * DASH_SPEED;

  broadcast({
    type: "ability",
    id: player.id,
    ability: "dash",
    x: player.x,
    y: player.y,
    z: player.z,
    direction: player.dashDirection,
    dashReadyAt: player.dashReadyAt
  });
}

function updateRespawns(now) {
  for (const client of clients.values()) {
    const player = client.player;
    if (!player.alive && player.respawnAt && now >= player.respawnAt) {
      respawnPlayer(player);
    }
  }
}

function snapshotFor(player) {
  const visiblePlayers = [];

  for (const client of clients.values()) {
    const target = client.player;
    const distance = Math.hypot(target.x - player.x, target.z - player.z);

    if (target.id === player.id || distance <= INTEREST_RADIUS) {
      visiblePlayers.push(publicPlayer(target));
    }
  }

  return {
    type: "snapshot",
    serverNow: Date.now(),
    players: visiblePlayers,
    round: roundPublic()
  };
}

function runTick() {
  const now = Date.now();
  const dt = 1 / TICK_RATE;
  tickNumber++;

  for (const client of clients.values()) {
    simulateMovement(client.player, dt, now);
  }

  checkPickups(now);
  updatePowers(now, dt);
  updateRespawns(now);
  checkRound(now);

  if (tickNumber % SNAPSHOT_EVERY === 0) {
    for (const client of clients.values()) {
      send(client.ws, snapshotFor(client.player));
    }
  }
}

setInterval(runTick, TICK_MS);

wss.on("connection", (ws) => {
  const id = crypto.randomUUID().slice(0, 8);
  const team = chooseTeam();
  const spawn = randomSpawn(team);

  const player = {
    id,
    ws,
    name: `Fighter-${id.slice(0, 4)}`,
    team,
    color: teamColor(team),
    ...spawn,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: team === "red" ? -Math.PI / 2 : Math.PI / 2,
    pitch: 0,
    health: 100,
    armor: 25,
    kills: 0,
    deaths: 0,
    assists: 0,
    alive: true,
    respawnAt: 0,
    invulnerableUntil: Date.now() + SPAWN_PROTECTION_MS,
    stunnedUntil: 0,
    weapon: "rifle",
    owned: new Set(["sword", "pistol", "smg", "rifle"]),
    ammo: makeAmmo(),
    reload: null,
    nextAttackAt: 0,
    combo: 0,
    lastComboAt: 0,
    blocking: false,
    blockStartedAt: 0,
    slideUntil: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirection: { x: 0, z: 0 },
    powers: makePowers(),
    lastDamagedAt: 0,
    lastGroundedAt: Date.now(),
    jumpRequestedAt: -Infinity,
    lastInputSeq: 0,
    previousJump: false,
    previousCrouch: false,
    input: {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      crouch: false
    },
    history: [{ t: Date.now(), x: spawn.x, y: spawn.y, z: spawn.z, crouching: false }],
    damageContributors: new Map()
  };

  clients.set(id, {
    ws,
    player,
    lastMessageAt: Date.now(),
    lastPingAt: 0
  });

  send(ws, {
    type: "init",
    id,
    player: publicPlayer(player),
    ammo: player.ammo,
    weapons: WEAPONS,
    powerups: POWERUPS,
    pickups: pickups.map(pickupPublic),
    round: roundPublic(),
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    tickRate: TICK_RATE
  });

  broadcast({
    type: "system",
    text: `${player.name} joined ${player.team.toUpperCase()} team`
  });

  ws.on("message", (buffer) => {
    if (buffer.length > 16000) return;

    let message;

    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return;
    }

    const current = clients.get(id);
    if (!current || !message || typeof message.type !== "string") return;

    current.lastMessageAt = Date.now();

    if (message.type === "hello") {
      const previous = player.name;
      player.name = cleanName(message.name);

      broadcast({
        type: "player_update",
        player: publicPlayer(player)
      });

      if (previous !== player.name) {
        broadcast({
          type: "system",
          text: `${previous} is now ${player.name}`
        });
      }
      return;
    }

    if (message.type === "input") {
      const input = message.input || {};
      player.input = {
        forward: Boolean(input.forward),
        backward: Boolean(input.backward),
        left: Boolean(input.left),
        right: Boolean(input.right),
        jump: Boolean(input.jump),
        sprint: Boolean(input.sprint),
        crouch: Boolean(input.crouch)
      };

      if (Number.isFinite(message.yaw)) player.yaw = message.yaw;
      if (Number.isFinite(message.pitch)) player.pitch = clamp(message.pitch, -1.45, 1.45);
      if (Number.isInteger(message.seq)) player.lastInputSeq = message.seq;
      return;
    }

    if (message.type === "fire") {
      handleHitscan(player, message.weapon, message);
      return;
    }

    if (message.type === "melee") {
      handleMelee(player, message);
      return;
    }

    if (message.type === "block") {
      handleBlock(player, message.active);
      return;
    }

    if (message.type === "reload") {
      startReload(player);
      return;
    }

    if (message.type === "ability") {
      handleAbility(player, String(message.ability || ""));
      return;
    }

    if (message.type === "switch_weapon") {
      switchWeapon(player, String(message.weapon || ""));
      return;
    }

    if (message.type === "chat") {
      const text = String(message.text || "").trim().slice(0, 120);
      if (text) {
        broadcast({
          type: "chat",
          name: player.name,
          team: player.team,
          text
        });
      }
      return;
    }

    if (message.type === "ping") {
      send(ws, {
        type: "pong",
        clientTime: Number(message.clientTime) || 0,
        serverTime: Date.now()
      });
      return;
    }
  });

  ws.on("close", () => {
    const disconnected = clients.get(id);
    clients.delete(id);

    if (disconnected) {
      broadcast({
        type: "player_leave",
        id
      });

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
  console.log(`Voxel Combat Arena v5 listening on port ${PORT}`);
  console.log(`EC2 AZ: ${EC2_AZ}`);
  console.log(`Instance: ${INSTANCE_ID}`);
});
