"use strict";

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const EC2_AZ = process.env.EC2_AZ || "local";
const INSTANCE_ID = process.env.INSTANCE_ID || "local";
const BUILD_COMMIT = process.env.BUILD_COMMIT || "development";
const ROOM_CODE = String(process.env.ROOM_CODE || "").trim().slice(0, 24);
const GAME_VERSION = "8.8.0";

const TICK_RATE = 30;
const SNAPSHOT_RATE = 15;
const TICK_MS = 1000 / TICK_RATE;
const SNAPSHOT_EVERY = TICK_RATE / SNAPSHOT_RATE;
const INTEREST_RADIUS = 64;
const MATCH_LENGTH_MS = 5 * 60 * 1000;
const ROUND_BREAK_MS = 9000;
const SCORE_LIMIT = 30;
const RESPAWN_MS = 4700;
const SPAWN_PROTECTION_MS = 1850;
const SPAWN_REUSE_MS = 7200;
const PLAYER_RADIUS = 0.32;
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
const ARENA_RADIUS = 34;
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
const GRAPPLE_RANGE = 46;
const GRAPPLE_COOLDOWN_MS = 1900;
const GRAPPLE_DURATION_MS = 3200;
const GRAPPLE_PULL = 42;
const GRAPPLE_MAX_SPEED = 23;
const GRAPPLE_STOP_DISTANCE = 1.7;
const GRAPPLE_REEL_SPEED = 9.5;
const GRAPPLE_RELEASE_BOOST = 1.08;
const GRAPPLE_RELEASE_UP = 1.25;
const KILLCAM_WINDOW_MS = 2200;
const HISTORY_WINDOW_MS = 3400;
const STAMINA_MAX = 100;
const STAMINA_REGEN = 24;
const SPRINT_STAMINA_DRAIN = 8;
const BLOCK_STAMINA_DRAIN = 19;
const STEADY_STAMINA_DRAIN = 17;
const HEAVY_MELEE_COST = 34;
const KOTH_SCORE_LIMIT = 150;
const KOTH_RADIUS = 5.75;
const KOTH_CAPTURE_RATE = 34;
const GRAPPLE_PROJECTILE_SPEED = 72;
const GAME_MODES = ["tdm", "koth", "ffa"];
const MAP_VARIANTS = ["foundry", "nightfall", "storm"];
const OBJECTIVE_POINTS = [
  { id: "foundry", x: 0, y: 2.15, z: 0, label: "CENTRAL FOUNDRY" },
  { id: "north", x: 0, y: 0.2, z: 18, label: "NORTH CAUSEWAY" },
  { id: "south", x: 0, y: 0.2, z: -18, label: "SOUTH CAUSEWAY" },
  { id: "east", x: 18, y: 0.2, z: 0, label: "EAST PLATFORM" },
  { id: "west", x: -18, y: 0.2, z: 0, label: "WEST PLATFORM" }
];

const WEAPONS = {
  sword: { type: "melee", cooldown: 365, comboReset: 920, ranges: [3.05, 3.25, 3.55], damages: [29, 33, 43], arcs: [0.15, 0.05, -0.08], hitRadii: [0.72, 0.82, 0.96], lunges: [4.2, 4.8, 6.1], cleave: 2 },
  voidblade: { type: "melee", cooldown: 500, comboReset: 980, ranges: [3.35, 3.55, 3.85], damages: [999, 999, 999], arcs: [0.12, 0.02, -0.12], hitRadii: [0.82, 0.92, 1.02], lunges: [4.6, 5.2, 6.5], cleave: 1, instantKill: true },
  pistol: { type: "hitscan", damage: 28, headMultiplier: 1.65, cooldown: 280, magazine: 12, reserve: 72, reload: 1350, range: 82, hipSpread: 0.010, adsSpread: 0.00035, moveSpread: 0.010, airSpread: 0.018, bloomPerShot: 0.0025, maxBloom: 0.014, bloomRecovery: 0.032, pellets: 1 },
  smg: { type: "hitscan", damage: 9, headMultiplier: 1.35, cooldown: 68, magazine: 36, reserve: 180, reload: 1750, range: 62, hipSpread: 0.025, adsSpread: 0.0028, moveSpread: 0.018, airSpread: 0.030, bloomPerShot: 0.0035, maxBloom: 0.034, bloomRecovery: 0.040, pellets: 1 },
  rifle: { type: "hitscan", damage: 14, headMultiplier: 1.48, cooldown: 94, magazine: 30, reserve: 150, reload: 2000, range: 98, hipSpread: 0.016, adsSpread: 0.0012, moveSpread: 0.012, airSpread: 0.026, bloomPerShot: 0.003, maxBloom: 0.027, bloomRecovery: 0.034, pellets: 1 },
  burst: { type: "hitscan", damage: 13, headMultiplier: 1.48, cooldown: 390, magazine: 27, reserve: 135, reload: 2050, range: 102, hipSpread: 0.014, adsSpread: 0.0008, moveSpread: 0.010, airSpread: 0.023, bloomPerShot: 0.002, maxBloom: 0.018, bloomRecovery: 0.036, pellets: 3, ammoPerShot: 3 },
  shotgun: { type: "hitscan", damage: 10, headMultiplier: 1.18, cooldown: 820, magazine: 6, reserve: 42, reload: 2350, range: 38, hipSpread: 0.074, adsSpread: 0.038, moveSpread: 0.012, airSpread: 0.022, bloomPerShot: 0.005, maxBloom: 0.018, bloomRecovery: 0.03, pellets: 10 },
  lmg: { type: "hitscan", damage: 17, headMultiplier: 1.34, cooldown: 118, magazine: 60, reserve: 240, reload: 3200, range: 96, hipSpread: 0.025, adsSpread: 0.0026, moveSpread: 0.016, airSpread: 0.028, bloomPerShot: 0.0038, maxBloom: 0.036, bloomRecovery: 0.026, pellets: 1 },
  marksman: { type: "hitscan", damage: 62, headMultiplier: 1.72, cooldown: 900, magazine: 5, reserve: 30, reload: 2250, range: 145, hipSpread: 0.018, adsSpread: 0.00008, moveSpread: 0.016, airSpread: 0.035, bloomPerShot: 0.006, maxBloom: 0.018, bloomRecovery: 0.032, pellets: 1 },
  railgun: { type: "hitscan", damage: 88, headMultiplier: 1.45, cooldown: 1450, magazine: 3, reserve: 15, reload: 2850, range: 165, hipSpread: 0.021, adsSpread: 0.00004, moveSpread: 0.020, airSpread: 0.040, bloomPerShot: 0.010, maxBloom: 0.024, bloomRecovery: 0.028, pellets: 1 }
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
  { minX: -5, maxX: 1, minY: 0, maxY: 1, minZ: -7, maxZ: -5 },
  { minX: -2, maxX: 2, minY: 0, maxY: 0.55, minZ: 6, maxZ: 7 },
  { minX: -2, maxX: 2, minY: 0, maxY: 1.1, minZ: 5, maxZ: 6 },
  { minX: -2, maxX: 2, minY: 0, maxY: 1.55, minZ: 4, maxZ: 5 },
  { minX: -2, maxX: 2, minY: 0, maxY: 0.55, minZ: -7, maxZ: -6 },
  { minX: -2, maxX: 2, minY: 0, maxY: 1.1, minZ: -6, maxZ: -5 },
  { minX: -2, maxX: 2, minY: 0, maxY: 1.55, minZ: -5, maxZ: -4 },
  { minX: 6, maxX: 7, minY: 0, maxY: 0.55, minZ: -2, maxZ: 2 },
  { minX: 5, maxX: 6, minY: 0, maxY: 1.1, minZ: -2, maxZ: 2 },
  { minX: 4, maxX: 5, minY: 0, maxY: 1.55, minZ: -2, maxZ: 2 },
  { minX: -7, maxX: -6, minY: 0, maxY: 0.55, minZ: -2, maxZ: 2 },
  { minX: -6, maxX: -5, minY: 0, maxY: 1.1, minZ: -2, maxZ: 2 },
  { minX: -5, maxX: -4, minY: 0, maxY: 1.55, minZ: -2, maxZ: 2 },
  { minX: -12, maxX: -10.8, minY: 0, maxY: 2.25, minZ: -1.5, maxZ: 1.5 },
  { minX: -10.8, maxX: -9.6, minY: 0, maxY: 1.5, minZ: -1.5, maxZ: 1.5 },
  { minX: -9.6, maxX: -8.4, minY: 0, maxY: 0.75, minZ: -1.5, maxZ: 1.5 },
  { minX: 10.8, maxX: 12, minY: 0, maxY: 2.25, minZ: -1.5, maxZ: 1.5 },
  { minX: 9.6, maxX: 10.8, minY: 0, maxY: 1.5, minZ: -1.5, maxZ: 1.5 },
  { minX: 8.4, maxX: 9.6, minY: 0, maxY: 0.75, minZ: -1.5, maxZ: 1.5 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 2.25, minZ: -12, maxZ: -10.8 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 1.5, minZ: -10.8, maxZ: -9.6 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 0.75, minZ: -9.6, maxZ: -8.4 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 2.25, minZ: 10.8, maxZ: 12 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 1.5, minZ: 9.6, maxZ: 10.8 },
  { minX: -1.5, maxX: 1.5, minY: 0, maxY: 0.75, minZ: 8.4, maxZ: 9.6 },
  { minX: -28, maxX: -24, minY: 0, maxY: 5, minZ: -28, maxZ: -24 },
  { minX: 24, maxX: 28, minY: 0, maxY: 5, minZ: -28, maxZ: -24 },
  { minX: -28, maxX: -24, minY: 0, maxY: 5, minZ: 24, maxZ: 28 },
  { minX: 24, maxX: 28, minY: 0, maxY: 5, minZ: 24, maxZ: 28 },
  { minX: -2.5, maxX: 2.5, minY: 0, maxY: 4.5, minZ: -28, maxZ: -25 },
  { minX: -2.5, maxX: 2.5, minY: 0, maxY: 4.5, minZ: 25, maxZ: 28 },
  { minX: -28, maxX: -25, minY: 0, maxY: 4.5, minZ: -2.5, maxZ: 2.5 },
  { minX: 25, maxX: 28, minY: 0, maxY: 4.5, minZ: -2.5, maxZ: 2.5 },
  { minX: -0.45, maxX: 0.45, minY: 8, maxY: 8.9, minZ: -23.45, maxZ: -22.55 },
  { minX: -0.45, maxX: 0.45, minY: 8, maxY: 8.9, minZ: 22.55, maxZ: 23.45 },
  { minX: -23.45, maxX: -22.55, minY: 8, maxY: 8.9, minZ: -0.45, maxZ: 0.45 },
  { minX: 22.55, maxX: 23.45, minY: 8, maxY: 8.9, minZ: -0.45, maxZ: 0.45 },
  { minX: -17.45, maxX: -16.55, minY: 7, maxY: 7.9, minZ: -17.45, maxZ: -16.55 },
  { minX: 16.55, maxX: 17.45, minY: 7, maxY: 7.9, minZ: -17.45, maxZ: -16.55 },
  { minX: -17.45, maxX: -16.55, minY: 7, maxY: 7.9, minZ: 16.55, maxZ: 17.45 },
  { minX: -15, maxX: -12.5, minY: 0, maxY: 1.45, minZ: -8, maxZ: -5.5 },
  { minX: -15, maxX: -12.5, minY: 0, maxY: 1.45, minZ: 5.5, maxZ: 8 },
  { minX: 12.5, maxX: 15, minY: 0, maxY: 1.45, minZ: -8, maxZ: -5.5 },
  { minX: 12.5, maxX: 15, minY: 0, maxY: 1.45, minZ: 5.5, maxZ: 8 },
  { minX: -8, maxX: -5.5, minY: 0, maxY: 1.35, minZ: -15, maxZ: -12.5 },
  { minX: 5.5, maxX: 8, minY: 0, maxY: 1.35, minZ: -15, maxZ: -12.5 },
  { minX: -8, maxX: -5.5, minY: 0, maxY: 1.35, minZ: 12.5, maxZ: 15 },
  { minX: 5.5, maxX: 8, minY: 0, maxY: 1.35, minZ: 12.5, maxZ: 15 },
  { minX: -11.5, maxX: -9.5, minY: 0, maxY: 2.1, minZ: -4.5, maxZ: -2.5 },
  { minX: 9.5, maxX: 11.5, minY: 0, maxY: 2.1, minZ: 2.5, maxZ: 4.5 },
  { minX: -4.5, maxX: -2.5, minY: 0, maxY: 2.1, minZ: 9.5, maxZ: 11.5 },
  { minX: 2.5, maxX: 4.5, minY: 0, maxY: 2.1, minZ: -11.5, maxZ: -9.5 },
  { minX: 16.55, maxX: 17.45, minY: 7, maxY: 7.9, minZ: 16.55, maxZ: 17.45 }
];

const SPAWNS = {
  red: [
    { id: "red-lower", x: -22, y: 0, z: -15, yaw: -Math.PI / 2 },
    { id: "red-mid", x: -22, y: 0, z: 0, yaw: -Math.PI / 2 },
    { id: "red-upper", x: -22, y: 0, z: 15, yaw: -Math.PI / 2 },
    { id: "red-south", x: -16, y: 0, z: -23, yaw: -Math.PI / 3 },
    { id: "red-north", x: -16, y: 0, z: 23, yaw: -2 * Math.PI / 3 },
    { id: "red-flank-low", x: -27, y: 0, z: -16, yaw: -Math.PI / 2 },
    { id: "red-flank-high", x: -27, y: 0, z: 16, yaw: -Math.PI / 2 }
  ],
  blue: [
    { id: "blue-lower", x: 22, y: 0, z: -15, yaw: Math.PI / 2 },
    { id: "blue-mid", x: 22, y: 0, z: 0, yaw: Math.PI / 2 },
    { id: "blue-upper", x: 22, y: 0, z: 15, yaw: Math.PI / 2 },
    { id: "blue-south", x: 16, y: 0, z: -23, yaw: Math.PI / 3 },
    { id: "blue-north", x: 16, y: 0, z: 23, yaw: 2 * Math.PI / 3 },
    { id: "blue-flank-low", x: 27, y: 0, z: -16, yaw: Math.PI / 2 },
    { id: "blue-flank-high", x: 27, y: 0, z: 16, yaw: Math.PI / 2 }
  ]
};

const GRAPPLE_ANCHORS = [
  { x: 0, y: 8.45, z: -23 }, { x: 0, y: 8.45, z: 23 },
  { x: -23, y: 8.45, z: 0 }, { x: 23, y: 8.45, z: 0 },
  { x: -17, y: 7.45, z: -17 }, { x: 17, y: 7.45, z: -17 },
  { x: -17, y: 7.45, z: 17 }, { x: 17, y: 7.45, z: 17 }
];

const recentSpawnUse = new Map();

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
  { id: "power-jump", type: "power", power: "jump", x: 10, y: 1.5, z: -15, respawn: 26000 },
  { id: "void-reaper-rare", type: "weapon", weapon: "voidblade", x: 0, y: 5.8, z: 26, respawn: 45000, rare: true, activeWindow: 18000 }
];

const app = express();
app.disable("x-powered-by");
app.use("/vendor", express.static(path.join(__dirname, "node_modules", "three", "build"), {
  etag: true,
  maxAge: "30d"
}));
app.use("/vendor-examples", express.static(path.join(__dirname, "node_modules", "three", "examples", "jsm"), {
  etag: true,
  maxAge: "30d"
}));
app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  maxAge: "10m"
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", perMessageDeflate: false });

// Native WebSocket heartbeats remove half-open browser connections without
// relying on gameplay traffic, protecting memory and snapshot fan-out.
const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
heartbeatTimer.unref();
wss.on("close", () => clearInterval(heartbeatTimer));

const clients = new Map();
let tickNumber = 0;
let round = createRound();
let pickups = createPickups();

app.get("/api/status", (_req, res) => {
  const memory = process.memoryUsage();
  res.json({
    status: "online",
    app: "Voxel Combat Arena",
    version: GAME_VERSION,
    buildCommit: BUILD_COMMIT,
    players: humanPlayerCount(),
    bots: 0,
    availabilityZone: EC2_AZ,
    instanceId: INSTANCE_ID,
    roomProtected: Boolean(ROOM_CODE),
    tickRate: TICK_RATE,
    snapshotRate: SNAPSHOT_RATE,
    round: roundPublic(),
    memoryMb: Math.round(memory.rss / 1024 / 1024),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get("/api/version", (_req, res) => {
  res.json({ version: GAME_VERSION, buildCommit: BUILD_COMMIT, node: process.version });
});

function createRound(mode = GAME_MODES[tickNumber % GAME_MODES.length], map = MAP_VARIANTS[tickNumber % MAP_VARIANTS.length]) {
  const objective = OBJECTIVE_POINTS[Math.floor(Math.random() * OBJECTIVE_POINTS.length)];
  return {
    status: "playing",
    mode: GAME_MODES.includes(mode) ? mode : "tdm",
    map: MAP_VARIANTS.includes(map) ? map : "foundry",
    startedAt: Date.now(),
    endsAt: Date.now() + MATCH_LENGTH_MS,
    restartAt: 0,
    score: { red: 0, blue: 0 },
    winner: null,
    objective: { ...objective, owner: null, capturing: null, progress: 0, nextScoreAt: Date.now() + 1000 },
    modeVotes: { tdm: 0, koth: 0, ffa: 0 },
    mapVotes: { foundry: 0, nightfall: 0, storm: 0 },
    voters: new Set(),
    mapVoters: new Set(),
    highlights: null
  };
}

function createPickups() {
  const now = Date.now();
  return PICKUP_TEMPLATES.map((pickup) => {
    const rareActive = Boolean(pickup.rare && Math.random() < 0.12);
    return {
      ...pickup,
      active: pickup.rare ? rareActive : true,
      respawnAt: pickup.rare && !rareActive ? now + 45000 + Math.random() * 30000 : 0,
      despawnAt: rareActive ? now + pickup.activeWindow : 0
    };
  });
}

function send(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload, exceptId = null) {
  const encoded = JSON.stringify(payload);
  for (const [id, client] of clients) {
    if (id !== exceptId && client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function humanPlayerCount() {
  return clients.size;
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

function capsuleBlockedAt(x, y, z, height = STAND_HEIGHT, radius = PLAYER_RADIUS + 0.08) {
  for (const box of COLLIDERS) {
    if (y < box.maxY && y + height > box.minY && circleAabbOverlap(x, z, radius, box)) {
      return true;
    }
  }
  return false;
}

function hasClearSpawnHeadroom(x, y, z) {
  return !capsuleBlockedAt(x, y + 0.02, z, STAND_HEIGHT, PLAYER_RADIUS + 0.14);
}

function spawnLineOfSight(candidate, enemy) {
  const origin = { x: candidate.x, y: candidate.y + 1.45, z: candidate.z };
  const target = { x: enemy.x, y: enemy.y + 1.2, z: enemy.z };
  const delta = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const distance = Math.hypot(delta.x, delta.y, delta.z) || 1;
  const wallDistance = nearestWallDistance(origin, normalize(delta), distance);
  return wallDistance >= distance - 0.15;
}

function scoreSpawnCandidate(candidate, team, playerId, now) {
  if (Math.hypot(candidate.x, candidate.z) > ARENA_RADIUS - 1.1) return -Infinity;
  if (!hasClearSpawnHeadroom(candidate.x, candidate.y, candidate.z)) return -Infinity;

  let score = Math.random() * 4;
  let nearestEnemy = Infinity;
  let nearestFriendly = Infinity;

  for (const client of clients.values()) {
    const other = client.player;
    if (!other.alive || other.id === playerId) continue;
    const distance = Math.hypot(other.x - candidate.x, other.z - candidate.z);

    if (other.team === team) {
      nearestFriendly = Math.min(nearestFriendly, distance);
      continue;
    }

    nearestEnemy = Math.min(nearestEnemy, distance);
    score += Math.min(distance, 38) * 2.8;

    if (distance < 7.5) score -= 1400;
    else if (distance < 16) score -= (16 - distance) * 34;

    if (distance < 28 && spawnLineOfSight(candidate, other)) {
      score -= (28 - distance) * 13;
    }
  }

  if (Number.isFinite(nearestFriendly)) {
    if (nearestFriendly < 1.8) score -= 240;
    else if (nearestFriendly < 8) score += 10;
  }

  if (Number.isFinite(nearestEnemy) && nearestEnemy > 22) score += 35;

  const lastUsed = recentSpawnUse.get(candidate.id) || 0;
  const age = now - lastUsed;
  if (age < SPAWN_REUSE_MS) score -= (SPAWN_REUSE_MS - age) * 0.08;

  return score;
}

function chooseSafeSpawn(team, playerId = null) {
  const now = Date.now();
  const anchors = SPAWNS[team] || SPAWNS.red;
  const offsets = [
    [0, 0], [0.85, 0], [-0.85, 0], [0, 0.85], [0, -0.85],
    [0.65, 0.65], [-0.65, 0.65], [0.65, -0.65], [-0.65, -0.65]
  ];
  let best = null;
  let bestScore = -Infinity;

  for (const anchor of anchors) {
    for (let index = 0; index < offsets.length; index++) {
      const [ox, oz] = offsets[index];
      const candidate = {
        id: `${anchor.id}:${index}`,
        x: anchor.x + ox,
        y: anchor.y,
        z: anchor.z + oz,
        yaw: anchor.yaw
      };
      const score = scoreSpawnCandidate(candidate, team, playerId, now);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  if (!best) {
    // This grid is deliberately outside the major structures and is only used
    // if future map edits accidentally invalidate all authored spawn anchors.
    const xStart = team === "red" ? -23 : 23;
    const facing = team === "red" ? -Math.PI / 2 : Math.PI / 2;
    for (let z = -20; z <= 20 && !best; z += 2) {
      for (let xOffset = -3; xOffset <= 3; xOffset += 1) {
        const candidate = { id: `fallback:${team}:${xOffset}:${z}`, x: xStart + xOffset, y: 0, z, yaw: facing };
        if (hasClearSpawnHeadroom(candidate.x, candidate.y, candidate.z)) best = candidate;
      }
    }
  }

  best ||= { id: `emergency:${team}`, x: team === "red" ? -20 : 20, y: 0, z: 0, yaw: team === "red" ? -Math.PI / 2 : Math.PI / 2 };
  recentSpawnUse.set(best.id, now);
  return { x: best.x, y: best.y, z: best.z, yaw: best.yaw };
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
    dashReadyAt: player.dashReadyAt,
    grappleReadyAt: player.grappleReadyAt
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
    roundScore: player.roundScore || 0,
    damageDealt: Math.round(player.damageDealt || 0),
    shots: player.shots || 0,
    hits: player.hits || 0,
    streak: player.streak || 0,
    bestStreak: player.bestStreak || 0,
    captures: player.captures || 0,
    stamina: Math.round(player.stamina ?? STAMINA_MAX),
    skin: player.skin || "standard",
    archetype: player.archetype || "assault",
    isBot: Boolean(player.isBot),
    alive: player.alive,
    weapon: player.weapon,
    owned: Array.from(player.owned),
    blocking: player.blocking,
    aiming: Boolean(player.input.aiming),
    steady: Boolean(player.input.steady),
    sliding: Date.now() < player.slideUntil,
    crouching: player.input.crouch,
    reloading: player.reload ? player.reload.weapon : null,
    powers: publicPowers(player),
    grapple: player.grapple ? { target: player.grapple.target, endsAt: player.grapple.endsAt, ropeLength: player.grapple.ropeLength, attachedAt: player.grapple.attachedAt } : null,
    grappleProjectile: player.grappleProjectile ? { target: player.grappleProjectile.target, arrivesAt: player.grappleProjectile.arrivesAt } : null,
    ack: player.lastInputSeq
  };
}

function publicRosterPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    roundScore: player.roundScore || 0,
    alive: player.alive,
    isBot: Boolean(player.isBot)
  };
}

function fullRoster() {
  return Array.from(clients.values(), (client) => publicRosterPlayer(client.player));
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
    active: pickup.active,
    rare: Boolean(pickup.rare)
  };
}

function roundPublic() {
  let leader = null;
  if (round.mode === "ffa") {
    leader = Array.from(clients.values())
      .map((client) => client.player)
      .sort((a, b) => (b.roundScore || 0) - (a.roundScore || 0))[0];
  }
  return {
    status: round.status,
    mode: round.mode,
    map: round.map,
    score: round.score,
    winner: round.winner,
    leader: leader ? { id: leader.id, name: leader.name, score: leader.roundScore || 0 } : null,
    objective: round.objective,
    modeVotes: round.modeVotes,
    mapVotes: round.mapVotes,
    highlights: round.highlights,
    scoreLimit: round.mode === "koth" ? KOTH_SCORE_LIMIT : SCORE_LIMIT,
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
  if (input.sprint && !input.crouch && player.stamina > 0) maxSpeed = SPRINT_SPEED;
  if (activePower(player, "speed", now)) maxSpeed *= POWER_SPEED_MULTIPLIER;
  if (player.blocking) maxSpeed *= 0.55;
  if (stunned) maxSpeed = 0;

  const accel = (grounded ? MOVE_ACCEL : AIR_ACCEL) * (activePower(player, "jump", now) ? 1.18 : 1);
  const currentWeapon = WEAPONS[player.weapon];
  if (currentWeapon?.type === "hitscan") {
    player.weaponBloom = Math.max(0, player.weaponBloom - currentWeapon.bloomRecovery * dt);
  }

  let grappleGravityScale = 1;
  if (player.grapple) {
    if (now >= player.grapple.endsAt) {
      endGrapple(player, "timeout", true);
    } else {
      const eyeY = player.y + (player.input.crouch ? 0.9 : 1.15);
      const dx = player.grapple.target.x - player.x;
      const dy = player.grapple.target.y - eyeY;
      const dz = player.grapple.target.z - player.z;
      const distanceToTarget = Math.hypot(dx, dy, dz) || 1;
      const nx = dx / distanceToTarget;
      const ny = dy / distanceToTarget;
      const nz = dz / distanceToTarget;

      const reelDelta = player.input.backward ? GRAPPLE_REEL_SPEED * 0.72 * dt : -GRAPPLE_REEL_SPEED * dt * (player.input.forward ? 1.3 : 1);
      player.grapple.ropeLength = clamp(
        player.grapple.ropeLength + reelDelta,
        GRAPPLE_STOP_DISTANCE,
        Math.min(GRAPPLE_RANGE, distanceToTarget + 6)
      );

      const ropeOrigin = { x: player.x, y: eyeY, z: player.z };
      const ropeDirection = normalize({ x: dx, y: dy, z: dz });
      const ropeWall = nearestWallDistance(ropeOrigin, ropeDirection, distanceToTarget);
      if (ropeWall < distanceToTarget - 0.75) {
        endGrapple(player, "obstructed", false);
      }

      if (distanceToTarget <= GRAPPLE_STOP_DISTANCE) {
        endGrapple(player, "arrived", false);
      } else {
        const stretch = Math.max(0, distanceToTarget - player.grapple.ropeLength);
        const radialVelocity = player.vx * nx + player.vy * ny + player.vz * nz;
        const springForce = GRAPPLE_PULL + stretch * 22 + Math.max(0, -radialVelocity) * 3.5;
        const pull = Math.min(86, springForce) * dt;
        player.vx += nx * pull;
        player.vy += ny * pull;
        player.vz += nz * pull;

        // Preserve swing momentum by removing only velocity that would extend
        // an already taut rope. Tangential velocity remains untouched.
        if (stretch > 0.08 && radialVelocity < 0) {
          const correction = Math.min(-radialVelocity, stretch * 10) * 0.34;
          player.vx += nx * correction;
          player.vy += ny * correction;
          player.vz += nz * correction;
        }

        const totalSpeed = Math.hypot(player.vx, player.vy, player.vz);
        if (totalSpeed > GRAPPLE_MAX_SPEED) {
          const scale = GRAPPLE_MAX_SPEED / totalSpeed;
          player.vx *= scale; player.vy *= scale; player.vz *= scale;
        }
        grappleGravityScale = 0.48;
      }
    }
  }

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

  player.vy -= GRAVITY * grappleGravityScale * dt;
  player.y += player.vy * dt;

  const newSupport = supportHeight(player.x, player.z, player.y);

  if (player.y < newSupport) {
    player.y = newSupport;
    player.vy = 0;
  }

  if (player.y < -8) {
    respawnPlayer(player, true);
  }

  if (collidingBox(player, player.x, player.y + 0.03, player.z)) {
    player.embeddedTicks = (player.embeddedTicks || 0) + 1;
    if (player.embeddedTicks >= 3) {
      relocateEmbeddedPlayer(player);
      return;
    }
  } else {
    player.embeddedTicks = 0;
  }

  player.history.push({
    t: now,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    weapon: player.weapon,
    crouching: player.input.crouch
  });

  while (player.history.length && now - player.history[0].t > HISTORY_WINDOW_MS) {
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

function cross(a, b) {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function spreadDirection(baseDirection, spread) {
  if (spread <= 0) return baseDirection;
  const reference = Math.abs(baseDirection.y) < 0.94 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const right = normalize(cross(baseDirection, reference));
  const up = normalize(cross(right, baseDirection));
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * spread;
  return normalize({
    x: baseDirection.x + right.x * Math.cos(angle) * radius + up.x * Math.sin(angle) * radius,
    y: baseDirection.y + right.y * Math.cos(angle) * radius + up.y * Math.sin(angle) * radius,
    z: baseDirection.z + right.z * Math.cos(angle) * radius + up.z * Math.sin(angle) * radius
  });
}

function effectiveSpread(player, weapon, aiming, now) {
  const speed = Math.hypot(player.vx, player.vz);
  const grounded = player.y <= supportHeight(player.x, player.z, player.y) + 0.08;
  const precisionOptic = weapon === WEAPONS.marksman || weapon === WEAPONS.railgun;
  let spread = aiming ? weapon.adsSpread : weapon.hipSpread;
  const movementScale = aiming ? (precisionOptic ? 0.16 : 0.42) : 1;
  spread += Math.min(1, speed / Math.max(SPRINT_SPEED, 1)) * weapon.moveSpread * movementScale;
  if (!grounded) spread += weapon.airSpread * (aiming ? (precisionOptic ? 0.28 : 0.72) : 1);
  if (player.input.crouch && grounded) spread *= precisionOptic ? 0.5 : 0.62;
  if (player.input.steady && aiming && grounded && speed < 1.2 && player.stamina > 0) spread *= precisionOptic ? 0.22 : 0.42;
  if (aiming && grounded && speed < 1.15 && now - player.lastShotAt > 300) spread *= precisionOptic ? 0.12 : 0.2;
  // Precision optics should track the red dot almost exactly when settled.
  spread += player.weaponBloom * (aiming ? (precisionOptic ? 0.05 : 0.28) : 1);
  return Math.max(0, spread);
}

function recordAction(player, event) {
  player.actionHistory.push({ t: Date.now(), ...event });
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  while (player.actionHistory.length && player.actionHistory[0].t < cutoff) player.actionHistory.shift();
}

function sameTeam(a, b) {
  return round.mode !== "ffa" && a.team === b.team;
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

      const staminaCost = Math.max(8, amount * (meta.attackType === "heavy" ? 0.95 : 0.58));
      target.stamina = Math.max(0, target.stamina - staminaCost);
      if (target.stamina <= 0 || meta.attackType === "heavy" && target.stamina < 18) {
        target.blocking = false;
        target.stunnedUntil = now + 900;
        broadcast({ type: "guard_break", defenderId: target.id, attackerId: attacker.id });
        amount *= 0.82;
      } else {
        amount *= 0.25;
      }
    }
  }

  if (activePower(attacker, "damage", now)) {
    amount *= POWER_DAMAGE_MULTIPLIER;
  }

  target.lastDamagedAt = now;
  attacker.damageDealt = (attacker.damageDealt || 0) + amount;
  attacker.hits = (attacker.hits || 0) + 1;
  if (target.grapple && amount >= 35) endGrapple(target, "interrupted", false);
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
  if (target.grapple) endGrapple(target, "death");
  attacker.kills += 1;
  attacker.streak = (attacker.streak || 0) + 1;
  attacker.bestStreak = Math.max(attacker.bestStreak || 0, attacker.streak);
  attacker.roundScore = (attacker.roundScore || 0) + 1;
  target.streak = 0;
  if (round.mode === "tdm") round.score[attacker.team] += 1;
  if (round.mode === "koth") round.score[attacker.team] += 0.2;

  if (target.owned.has("voidblade")) {
    target.owned.delete("voidblade");
    const rare = pickups.find((pickup) => pickup.weapon === "voidblade");
    if (rare) {
      Object.assign(rare, { x: target.x, y: Math.max(0.8, target.y + 0.8), z: target.z, active: true, respawnAt: 0, despawnAt: now + 26000 });
      broadcast({ type: "pickup_state", pickup: pickupPublic(rare), dropped: true });
      broadcast({ type: "system", text: "The Void Reaper was dropped — recover it before it destabilizes." });
    }
  }

  const assists = [];

  for (const [contributorId, timestamp] of target.damageContributors) {
    if (contributorId === attacker.id || now - timestamp > 8000) continue;
    const contributor = clients.get(contributorId)?.player;
    if (contributor && (round.mode === "ffa" || contributor.team === attacker.team)) {
      contributor.assists += 1;
      assists.push(contributor.id);
      send(contributor.ws, { type: "assist" });
    }
  }

  target.damageContributors.clear();

  const killcamStart = now - KILLCAM_WINDOW_MS;
  const killerFrames = attacker.history
    .filter((frame) => frame.t >= killcamStart)
    .map((frame) => ({
      t: frame.t,
      x: frame.x, y: frame.y, z: frame.z,
      yaw: frame.yaw ?? attacker.yaw,
      pitch: frame.pitch ?? attacker.pitch,
      weapon: frame.weapon || attacker.weapon,
      crouching: Boolean(frame.crouching)
    }));
  if (!killerFrames.length) {
    killerFrames.push({ t: now, x: attacker.x, y: attacker.y, z: attacker.z, yaw: attacker.yaw, pitch: attacker.pitch, weapon: attacker.weapon, crouching: false });
  }
  send(target.ws, {
    type: "killcam",
    killer: { id: attacker.id, name: attacker.name, team: attacker.team },
    weapon: meta.weapon || attacker.weapon,
    startTime: killcamStart,
    deathTime: now,
    frames: killerFrames,
    events: attacker.actionHistory.filter((event) => event.t >= killcamStart)
  });

  broadcast({
    type: "kill",
    killer: publicPlayer(attacker),
    victim: publicPlayer(target),
    weapon: meta.weapon || "unknown",
    headshot: Boolean(meta.headshot),
    assists,
    round: roundPublic()
  });

  if (round.mode === "tdm" && round.score[attacker.team] >= SCORE_LIMIT) endRound(attacker.team);
  if (round.mode === "ffa" && attacker.roundScore >= SCORE_LIMIT) endRound(attacker.id);
}

function relocateEmbeddedPlayer(player) {
  const spawn = chooseSafeSpawn(player.team, player.id);
  player.x = spawn.x;
  player.y = spawn.y;
  player.z = spawn.z;
  player.yaw = spawn.yaw;
  player.vx = 0;
  player.vy = 0;
  player.vz = 0;
  player.embeddedTicks = 0;
  player.invulnerableUntil = Date.now() + 900;
  player.grapple = null;
  broadcast({ type: "unstuck", player: publicPlayer(player) });
}

function respawnPlayer(player, immediate = false) {
  const spawn = chooseSafeSpawn(player.team, player.id);

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
    grapple: null,
    grappleProjectile: null,
    grappleReadyAt: 0,
    stamina: STAMINA_MAX,
    embeddedTicks: 0,
    weaponBloom: 0,
    lastShotAt: 0,
    powers: makePowers(),
    lastDamagedAt: 0,
    lastGroundedAt: Date.now(),
    jumpRequestedAt: -Infinity
  });

  player.weapon = "rifle";
  player.owned = new Set(["sword", "pistol", "smg", "rifle"]);
  player.ammo = makeAmmo();
  player.history = [{ t: Date.now(), x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch, weapon: player.weapon, crouching: false }];
  player.actionHistory = [];

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
  const players = Array.from(clients.values()).map((client) => client.player);
  const topKills = [...players].sort((a, b) => b.kills - a.kills)[0];
  const topDamage = [...players].sort((a, b) => (b.damageDealt || 0) - (a.damageDealt || 0))[0];
  const topObjective = [...players].sort((a, b) => (b.captures || 0) - (a.captures || 0))[0];
  round.highlights = {
    eliminator: topKills ? { name: topKills.name, value: topKills.kills } : null,
    damage: topDamage ? { name: topDamage.name, value: Math.round(topDamage.damageDealt || 0) } : null,
    objective: topObjective ? { name: topObjective.name, value: topObjective.captures || 0 } : null
  };

  broadcast({
    type: "round_end",
    round: roundPublic()
  });
}

function pickNextMode() {
  const entries = Object.entries(round.modeVotes || {}).sort((a, b) => b[1] - a[1]);
  if (entries[0] && entries[0][1] > 0) return entries[0][0];
  const index = Math.max(0, GAME_MODES.indexOf(round.mode));
  return GAME_MODES[(index + 1) % GAME_MODES.length];
}

function pickNextMap() {
  const entries = Object.entries(round.mapVotes || {}).sort((a, b) => b[1] - a[1]);
  if (entries[0] && entries[0][1] > 0) return entries[0][0];
  const index = Math.max(0, MAP_VARIANTS.indexOf(round.map));
  return MAP_VARIANTS[(index + 1) % MAP_VARIANTS.length];
}

function resetRound() {
  const nextMode = pickNextMode();
  const nextMap = pickNextMap();
  round = createRound(nextMode, nextMap);
  pickups = createPickups();

  for (const client of clients.values()) {
    const player = client.player;
    player.kills = 0;
    player.deaths = 0;
    player.assists = 0;
    player.roundScore = 0;
    player.damageDealt = 0;
    player.shots = 0;
    player.hits = 0;
    player.streak = 0;
    player.captures = 0;
    respawnPlayer(player, true);
  }

  broadcast({ type: "round_start", round: roundPublic(), pickups: pickups.map(pickupPublic) });
}

function checkRound(now) {
  if (round.status === "playing" && now >= round.endsAt) {
    if (round.mode === "ffa") {
      const ordered = Array.from(clients.values()).map((client) => client.player).sort((a, b) => (b.roundScore || 0) - (a.roundScore || 0));
      endRound(ordered.length && (ordered[0].roundScore || 0) !== (ordered[1]?.roundScore || 0) ? ordered[0].id : "draw");
    } else {
      const winner = round.score.red === round.score.blue ? "draw" : round.score.red > round.score.blue ? "red" : "blue";
      endRound(winner);
    }
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
  attacker.shots = (attacker.shots || 0) + Math.max(1, weapon.pellets || 1);
  const cooldownMultiplier = activePower(attacker, "rapid", now) ? POWER_RAPID_MULTIPLIER : 1;
  attacker.nextAttackAt = now + weapon.cooldown * cooldownMultiplier;

  const latency = clamp(Number(message.latency) || 0, 0, 240);
  const rewindTime = now - latency * 0.5;

  const aiming = Boolean(message.aiming || attacker.input.aiming);
  const shotYaw = Number.isFinite(message.yaw) && Math.abs(message.yaw - attacker.yaw) < 0.5 ? message.yaw : attacker.yaw;
  const shotPitch = Number.isFinite(message.pitch) && Math.abs(message.pitch - attacker.pitch) < 0.35 ? clamp(message.pitch, -1.45, 1.45) : attacker.pitch;
  const fallbackDirection = directionFromAngles(shotYaw, shotPitch);
  let baseDirection = fallbackDirection;
  const candidate = message.direction;
  if (candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z)) {
    const normalized = normalize({ x: candidate.x, y: candidate.y, z: candidate.z });
    const angularAgreement = normalized.x * fallbackDirection.x + normalized.y * fallbackDirection.y + normalized.z * fallbackDirection.z;
    if (angularAgreement > 0.985) baseDirection = normalized;
  }
  const shotSpread = effectiveSpread(attacker, weapon, aiming, now);
  attacker.weaponBloom = Math.min(weapon.maxBloom, attacker.weaponBloom + weapon.bloomPerShot);
  attacker.lastShotAt = now;
  const origin = {
    x: attacker.x,
    y: attacker.y + (attacker.input.crouch ? 1.12 : 1.57),
    z: attacker.z
  };

  const damageByTarget = new Map();
  const impacts = [];

  for (let pellet = 0; pellet < weapon.pellets; pellet++) {
    const direction = spreadDirection(baseDirection, shotSpread);
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
    seed: Math.floor(Math.random() * 1000000),
    spread: shotSpread,
    aiming,
    shotId: Number(message.shotId) || 0,
    serverTime: now
  });
  recordAction(attacker, { type: "fire", weapon: weaponName, aiming });

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

function pointSegmentDistance(point, start, end) {
  const abX = end.x - start.x;
  const abY = end.y - start.y;
  const abZ = end.z - start.z;
  const apX = point.x - start.x;
  const apY = point.y - start.y;
  const apZ = point.z - start.z;
  const lengthSq = abX * abX + abY * abY + abZ * abZ || 1;
  const t = clamp((apX * abX + apY * abY + apZ * abZ) / lengthSq, 0, 1);
  const closest = { x: start.x + abX * t, y: start.y + abY * t, z: start.z + abZ * t };
  return {
    distance: Math.hypot(point.x - closest.x, point.y - closest.y, point.z - closest.z),
    t,
    closest
  };
}

function handleMelee(attacker, message) {
  const now = Date.now();
  const weaponName = attacker.weapon;
  const weapon = WEAPONS[weaponName];

  if (!attacker.alive || round.status !== "playing") return;
  if (!weapon || weapon.type !== "melee" || !attacker.owned.has(weaponName)) return;
  if (attacker.stunnedUntil > now || attacker.blocking) return;
  if (now < attacker.nextAttackAt) return;

  const grounded = attacker.y <= supportHeight(attacker.x, attacker.z, attacker.y) + 0.08;
  let attackType = String(message.attackType || "light");
  if (attackType === "aerial" && grounded) attackType = "light";
  if (attackType === "heavy") {
    if (attacker.stamina < HEAVY_MELEE_COST) {
      send(attacker.ws, { type: "ability_denied", ability: "heavy", stamina: attacker.stamina });
      return;
    }
    attacker.stamina -= HEAVY_MELEE_COST;
  }
  if (now - attacker.lastComboAt > weapon.comboReset) attacker.combo = 0;
  else attacker.combo = (attacker.combo + 1) % 3;

  attacker.lastComboAt = now;
  const attackCooldownMultiplier = attackType === "heavy" ? 1.62 : attackType === "aerial" ? 1.25 : 1;
  attacker.nextAttackAt = now + (weapon.cooldown + attacker.combo * 36) * attackCooldownMultiplier;

  const combo = attackType === "heavy" ? 2 : attacker.combo;
  const range = weapon.ranges[combo] * (attackType === "heavy" ? 1.12 : attackType === "aerial" ? 1.08 : 1);
  const minimumDot = weapon.arcs[combo];
  const hitRadius = weapon.hitRadii?.[combo] || 0.8;
  const forwardX = -Math.sin(attacker.yaw);
  const forwardZ = -Math.cos(attacker.yaw);
  const latency = clamp(Number(message.latency) || 0, 0, 220);
  const rewindTime = now - latency * 0.5;
  const origin = { x: attacker.x, y: attacker.y + 1.0, z: attacker.z };
  const sweepEnd = {
    x: origin.x + forwardX * range,
    y: origin.y + clamp(attacker.pitch, -0.55, 0.55) * range * 0.35,
    z: origin.z + forwardZ * range
  };

  const lunge = weapon.lunges?.[combo] || 0;
  if (lunge > 0) {
    attacker.vx += forwardX * lunge;
    attacker.vz += forwardZ * lunge;
  }

  broadcast({
    type: "melee",
    id: attacker.id,
    combo,
    attackType,
    weapon: weaponName,
    origin,
    end: sweepEnd
  });
  recordAction(attacker, { type: "melee", weapon: weaponName, combo, attackType });

  const candidates = [];
  for (const client of clients.values()) {
    const target = client.player;
    if (!validTarget(attacker, target, now)) continue;

    const position = historyPosition(target, rewindTime);
    const targetPoint = {
      x: position.x,
      y: position.y + (position.crouching ? 0.82 : 1.08),
      z: position.z
    };
    const dx = targetPoint.x - origin.x;
    const dz = targetPoint.z - origin.z;
    const horizontalDistance = Math.hypot(dx, dz) || 0.001;
    const facing = (dx / horizontalDistance) * forwardX + (dz / horizontalDistance) * forwardZ;
    if (facing < minimumDot || horizontalDistance > range + hitRadius) continue;

    const sweep = pointSegmentDistance(targetPoint, origin, sweepEnd);
    if (sweep.distance > hitRadius + PLAYER_RADIUS) continue;

    const direction = normalize({ x: targetPoint.x - origin.x, y: targetPoint.y - origin.y, z: targetPoint.z - origin.z });
    const directDistance = Math.hypot(targetPoint.x - origin.x, targetPoint.y - origin.y, targetPoint.z - origin.z);
    const wallDistance = nearestWallDistance(origin, direction, directDistance + 0.25);
    if (wallDistance < directDistance - 0.38) continue;

    candidates.push({ target, sweepDistance: sweep.distance, pathPosition: sweep.t, directDistance });
  }

  candidates.sort((a, b) => a.sweepDistance - b.sweepDistance || a.directDistance - b.directDistance);
  const maxHits = Math.max(1, weapon.cleave || 1);
  let confirmedHits = 0;

  for (const candidate of candidates.slice(0, maxHits)) {
    const typeMultiplier = attackType === "heavy" ? 1.55 : attackType === "aerial" ? 1.28 : 1;
    const result = applyDamage(attacker, candidate.target, weapon.damages[combo] * typeMultiplier * (confirmedHits === 0 ? 1 : 0.82), {
      kind: "melee",
      attackType,
      weapon: weaponName,
      instantKill: Boolean(weapon.instantKill)
    });
    if (result && !result.parried) confirmedHits++;
    if (result?.parried) break;
  }

  send(attacker.ws, {
    type: "melee_result",
    combo,
    attackType,
    weapon: weaponName,
    stamina: Math.round(attacker.stamina),
    hits: confirmedHits
  });
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

  if (WEAPONS[player.weapon]?.type !== "melee" || !player.alive || player.stunnedUntil > now) {
    player.blocking = false;
    return;
  }

  if (active && player.stamina <= 2) {
    player.blocking = false;
    send(player.ws, { type: "ability_denied", ability: "block", reason: "stamina" });
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
        if (pickup.rare && Math.random() > 0.22) {
          pickup.respawnAt = now + 30000 + Math.random() * 30000;
        } else {
          pickup.active = true;
          pickup.respawnAt = 0;
          pickup.despawnAt = pickup.rare ? now + pickup.activeWindow : 0;
          broadcast({ type: "pickup_state", pickup: pickupPublic(pickup) });
          if (pickup.rare) broadcast({ type: "system", text: "The rare Void Reaper has appeared on the north tower." });
        }
      }
      continue;
    }

    if (pickup.rare && pickup.despawnAt && now >= pickup.despawnAt) {
      pickup.active = false;
      pickup.despawnAt = 0;
      pickup.respawnAt = now + 45000 + Math.random() * 45000;
      broadcast({ type: "pickup_state", pickup: pickupPublic(pickup) });
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
      pickup.despawnAt = 0;
      pickup.respawnAt = pickup.rare
        ? now + 70000 + Math.random() * 50000
        : now + pickup.respawn;

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

    const movingFast = player.input.sprint && Math.hypot(player.vx, player.vz) > WALK_SPEED + 0.4;
    const draining = player.blocking || movingFast || player.input.steady;
    let drain = 0;
    if (player.blocking) drain += BLOCK_STAMINA_DRAIN;
    if (movingFast) drain += SPRINT_STAMINA_DRAIN;
    if (player.input.steady) drain += STEADY_STAMINA_DRAIN;
    player.stamina = clamp(player.stamina + (draining ? -drain : STAMINA_REGEN) * dt, 0, STAMINA_MAX);
    if (player.stamina <= 0 && player.blocking) {
      player.blocking = false;
      player.stunnedUntil = now + 620;
      broadcast({ type: "guard_break", defenderId: player.id, attackerId: null });
    }

    if (activePower(player, "regen", now) && now - player.lastDamagedAt >= REGEN_DELAY_MS && player.health < 100) {
      const before = player.health;
      player.health = Math.min(100, player.health + REGEN_PER_SECOND * dt);
      if (Math.floor(before) !== Math.floor(player.health)) send(player.ws, { type: "vitals", health: Math.round(player.health), armor: Math.round(player.armor), stamina: Math.round(player.stamina) });
    }
  }
}

function endGrapple(player, reason = "cancel", applyReleaseBoost = false) {
  if (!player.grapple) return;
  const grapple = player.grapple;
  player.grapple = null;

  if (applyReleaseBoost && Date.now() - grapple.attachedAt > 110) {
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    if (speed > 4) {
      player.vx *= GRAPPLE_RELEASE_BOOST;
      player.vz *= GRAPPLE_RELEASE_BOOST;
    }
    player.vy = clamp(player.vy + GRAPPLE_RELEASE_UP, -GRAPPLE_MAX_SPEED, GRAPPLE_MAX_SPEED);
  }

  broadcast({
    type: "grapple_end",
    id: player.id,
    reason,
    velocity: { x: player.vx, y: player.vy, z: player.vz }
  });
}

function findGrappleTarget(origin, direction) {
  const wallDistance = nearestWallDistance(origin, direction, GRAPPLE_RANGE);
  let best = null;

  if (Number.isFinite(wallDistance) && wallDistance < GRAPPLE_RANGE - 0.05 && wallDistance >= 2.0) {
    const distance = Math.max(0.1, wallDistance - 0.10);
    best = {
      target: {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance
      },
      distance,
      score: 2.2
    };
  }

  // Grapple anchors receive a generous magnetic cone. This makes traversal
  // feel intentional without allowing hooks through walls.
  for (const anchor of GRAPPLE_ANCHORS) {
    const delta = { x: anchor.x - origin.x, y: anchor.y - origin.y, z: anchor.z - origin.z };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance < 2 || distance > GRAPPLE_RANGE) continue;
    const toAnchor = normalize(delta);
    const dot = direction.x * toAnchor.x + direction.y * toAnchor.y + direction.z * toAnchor.z;
    if (dot < 0.965) continue;
    const obstruction = nearestWallDistance(origin, toAnchor, distance);
    if (obstruction < distance - 1.15) continue;
    const score = dot * 5.5 - distance / GRAPPLE_RANGE;
    if (!best || score > best.score) best = { target: { ...anchor }, distance, score };
  }

  return best;
}

function attachGrapple(player, projectile, now) {
  if (!player.alive || !player.grappleProjectile || player.grappleProjectile !== projectile) return;
  player.grappleProjectile = null;
  const ropeLength = clamp(projectile.distance - 3.2, GRAPPLE_STOP_DISTANCE, GRAPPLE_RANGE);
  player.grapple = { target: projectile.target, endsAt: now + GRAPPLE_DURATION_MS, attachedAt: now, ropeLength };
  recordAction(player, { type: "grapple", target: projectile.target });
  broadcast({ type: "grapple_start", id: player.id, origin: projectile.origin, target: projectile.target, ropeLength, attachedAt: now, endsAt: player.grapple.endsAt, readyAt: player.grappleReadyAt });
}

function updateGrappleProjectiles(now) {
  for (const client of clients.values()) {
    const player = client.player;
    if (player.grappleProjectile && now >= player.grappleProjectile.arrivesAt) attachGrapple(player, player.grappleProjectile, now);
  }
}

function handleGrapple(player, message = {}) {
  const now = Date.now();
  if (!player.alive || round.status !== "playing" || player.stunnedUntil > now) return;
  if (player.grappleProjectile) {
    player.grappleProjectile = null;
    broadcast({ type: "grapple_end", id: player.id, reason: "cancel" });
    return;
  }
  if (player.grapple) { endGrapple(player, "cancel", true); return; }
  if (now < player.grappleReadyAt) { send(player.ws, { type: "ability_denied", ability: "grapple", readyAt: player.grappleReadyAt }); return; }

  const yaw = Number.isFinite(message.yaw) ? message.yaw : player.yaw;
  const pitch = Number.isFinite(message.pitch) ? clamp(message.pitch, -1.45, 1.45) : player.pitch;
  const direction = directionFromAngles(yaw, pitch);
  const origin = { x: player.x, y: player.y + (player.input.crouch ? 1.08 : 1.55), z: player.z };
  const hit = findGrappleTarget(origin, direction);
  if (!hit) { player.grappleReadyAt = now + 260; send(player.ws, { type: "grapple_miss", readyAt: player.grappleReadyAt }); return; }

  const projectile = { origin, target: hit.target, distance: hit.distance, launchedAt: now, arrivesAt: now + Math.max(45, hit.distance / GRAPPLE_PROJECTILE_SPEED * 1000) };
  player.grappleProjectile = projectile;
  player.grappleReadyAt = now + GRAPPLE_COOLDOWN_MS;
  broadcast({ type: "grapple_projectile", id: player.id, origin, target: hit.target, launchedAt: now, arrivesAt: projectile.arrivesAt, readyAt: player.grappleReadyAt });
}

function handleAbility(player, ability, message = {}) {
  const now = Date.now();
  if (ability === "grapple") {
    handleGrapple(player, message);
    return;
  }
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

function updateObjective(now, dt) {
  if (round.status !== "playing" || round.mode !== "koth" || !round.objective) return;
  const counts = { red: 0, blue: 0 };
  for (const client of clients.values()) {
    const player = client.player;
    if (!player.alive) continue;
    if (Math.hypot(player.x - round.objective.x, player.z - round.objective.z) <= KOTH_RADIUS) counts[player.team]++;
  }
  const capturing = counts.red > 0 && counts.blue === 0 ? "red" : counts.blue > 0 && counts.red === 0 ? "blue" : null;
  round.objective.capturing = capturing;
  if (capturing) {
    if (round.objective.owner === capturing) round.objective.progress = 100;
    else {
      round.objective.progress += KOTH_CAPTURE_RATE * dt * Math.max(1, counts[capturing] * 0.7);
      if (round.objective.progress >= 100) {
        round.objective.owner = capturing;
        round.objective.progress = 100;
        round.objective.nextScoreAt = now + 1000;
        for (const client of clients.values()) {
          const player = client.player;
          if (player.alive && player.team === capturing && Math.hypot(player.x - round.objective.x, player.z - round.objective.z) <= KOTH_RADIUS) {
            player.captures = (player.captures || 0) + 1;
            player.roundScore = (player.roundScore || 0) + 3;
            send(player.ws, { type: "objective_credit", amount: 1 });
          }
        }
        broadcast({ type: "objective_captured", team: capturing, objective: round.objective });
      }
    }
  } else if (!round.objective.owner) {
    round.objective.progress = Math.max(0, round.objective.progress - 18 * dt);
  }
  if (round.objective.owner && now >= round.objective.nextScoreAt) {
    round.score[round.objective.owner] += 1;
    round.objective.nextScoreAt += 1000;
    if (round.score[round.objective.owner] >= KOTH_SCORE_LIMIT) endRound(round.objective.owner);
  }
}

function handleModeVote(player, mode) {
  if (round.status !== "ended" || !GAME_MODES.includes(mode) || round.voters.has(player.id)) return;
  round.voters.add(player.id);
  round.modeVotes[mode] += 1;
  broadcast({ type: "mode_vote", voterId: player.id, mode, round: roundPublic() });
}

function handleMapVote(player, map) {
  if (round.status !== "ended" || !MAP_VARIANTS.includes(map) || round.mapVoters.has(player.id)) return;
  round.mapVoters.add(player.id);
  round.mapVotes[map] += 1;
  broadcast({ type: "map_vote", voterId: player.id, map, round: roundPublic() });
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
    sequence: tickNumber / SNAPSHOT_EVERY,
    serverNow: Date.now(),
    players: visiblePlayers,
    roster: fullRoster(),
    round: roundPublic()
  };
}

function runTick() {
  const now = Date.now();
  const dt = 1 / TICK_RATE;
  tickNumber++;

  for (const client of clients.values()) simulateMovement(client.player, dt, now);

  updateGrappleProjectiles(now);
  updateObjective(now, dt);
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
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  const id = crypto.randomUUID().slice(0, 8);
  const team = chooseTeam();
  const spawn = chooseSafeSpawn(team);

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
    yaw: Number.isFinite(spawn.yaw) ? spawn.yaw : (team === "red" ? -Math.PI / 2 : Math.PI / 2),
    pitch: 0,
    health: 100,
    armor: 25,
    kills: 0,
    deaths: 0,
    assists: 0,
    roundScore: 0,
    damageDealt: 0,
    shots: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    captures: 0,
    stamina: STAMINA_MAX,
    skin: "standard",
    archetype: "assault",
    isBot: false,
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
    grapple: null,
    grappleProjectile: null,
    grappleReadyAt: 0,
    embeddedTicks: 0,
    weaponBloom: 0,
    lastShotAt: 0,
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
      crouch: false,
      aiming: false,
      steady: false
    },
    history: [{ t: Date.now(), x: spawn.x, y: spawn.y, z: spawn.z, yaw: Number.isFinite(spawn.yaw) ? spawn.yaw : (team === "red" ? -Math.PI / 2 : Math.PI / 2), pitch: 0, weapon: "rifle", crouching: false }],
    actionHistory: [],
    damageContributors: new Map()
  };

  clients.set(id, {
    ws,
    player,
    lastMessageAt: Date.now(),
    lastPingAt: 0,
    messageWindowAt: Date.now(),
    messageCount: 0
  });

  send(ws, {
    type: "init",
    id,
    version: GAME_VERSION,
    player: publicPlayer(player),
    roster: fullRoster(),
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

    const messageNow = Date.now();
    if (messageNow - current.messageWindowAt >= 1000) {
      current.messageWindowAt = messageNow;
      current.messageCount = 0;
    }
    current.messageCount++;
    if (current.messageCount > 180) {
      ws.close(1008, "message rate exceeded");
      return;
    }
    current.lastMessageAt = messageNow;

    if (message.type === "hello") {
      if (ROOM_CODE && String(message.roomCode || "") !== ROOM_CODE) {
        send(ws, { type: "access_denied", reason: "Invalid private match code" });
        ws.close(1008, "invalid room code");
        return;
      }
      const previous = player.name;
      player.name = cleanName(message.name);
      if (["standard", "carbon", "neon", "royal"].includes(message.skin)) player.skin = message.skin;
      if (["assault", "scout", "heavy"].includes(message.archetype)) player.archetype = message.archetype;
      if (GAME_MODES.includes(message.modePreference) && round.status === "ended") handleModeVote(player, message.modePreference);

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
        crouch: Boolean(input.crouch),
        aiming: Boolean(input.aiming),
        steady: Boolean(input.steady)
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
      handleAbility(player, String(message.ability || ""), message);
      return;
    }

    if (message.type === "switch_weapon") {
      switchWeapon(player, String(message.weapon || ""));
      return;
    }

    if (message.type === "mode_vote") {
      handleModeVote(player, String(message.mode || ""));
      return;
    }
    if (message.type === "map_vote") {
      handleMapVote(player, String(message.map || ""));
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
  console.log(`Voxel Combat Arena v${GAME_VERSION} listening on port ${PORT}`);
  console.log(`EC2 AZ: ${EC2_AZ}`);
  console.log(`Instance: ${INSTANCE_ID}`);
});
