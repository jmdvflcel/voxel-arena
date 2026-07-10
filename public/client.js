"use strict";

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

const WEAPON_META = {
  sword: {
    label: "Arc Blade",
    className: "MELEE",
    hint: "Close-range heavy damage",
    cooldown: 560,
    automatic: false,
    recoil: 0.05,
    spreadKick: 0.08
  },
  pistol: {
    label: "Pulse Pistol",
    className: "SEMI-AUTO",
    hint: "Accurate precision sidearm",
    cooldown: 250,
    automatic: false,
    recoil: 0.08,
    spreadKick: 0.15
  },
  rifle: {
    label: "Vector Rifle",
    className: "AUTOMATIC",
    hint: "Fast sustained fire",
    cooldown: 105,
    automatic: true,
    recoil: 0.045,
    spreadKick: 0.12
  },
  shotgun: {
    label: "Scatter Cannon",
    className: "SHOTGUN",
    hint: "High close-range burst damage",
    cooldown: 820,
    automatic: false,
    recoil: 0.14,
    spreadKick: 0.28
  }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88c9ec);
scene.fog = new THREE.FogExp2(0x88c9ec, 0.015);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 450);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
document.body.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xd9f2ff, 0x33452a, 1.08);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.18);
sun.position.set(44, 68, 30);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x79a8ff, 0.24);
fill.position.set(-30, 24, -35);
scene.add(fill);

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const mats = {
  grass: new THREE.MeshLambertMaterial({ color: 0x4ca745 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x86572f }),
  stone: new THREE.MeshLambertMaterial({ color: 0x727a83 }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x3e4853 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x5d6b78, metalness: 0.55, roughness: 0.42 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xd5bf78 }),
  red: new THREE.MeshLambertMaterial({ color: 0x962434 }),
  blue: new THREE.MeshLambertMaterial({ color: 0x245b9d }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x66dcff }),
  orange: new THREE.MeshBasicMaterial({ color: 0xffa64d })
};

const blocks = new Map();
const players = new Map();
const remoteMeshes = new Map();
const keys = Object.create(null);
const velocity = new THREE.Vector3();
const clock = new THREE.Clock();
const radarCtx = $("radarCanvas").getContext("2d");

let socket = null;
let myId = null;
let myPlayer = null;
let serverWeapons = null;
let selectedWeapon = "sword";
let ammoState = {};
let reloading = false;
let reloadEndsAt = 0;
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let canJump = false;
let alive = true;
let fireHeld = false;
let aimHeld = false;
let lastLocalFireAt = 0;
let lastStateSent = 0;
let lastPingSent = 0;
let pingMs = 0;
let fpsFrames = 0;
let fpsStart = performance.now();
let bobTime = 0;
let recoilPitch = 0;
let recoilYaw = 0;
let recoilVelocity = 0;
let crosshairKick = 0;
let toastTimer = null;
let reconnectTimer = null;
let audioContext = null;

const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.31;
const WALK_SPEED = 4.7;
const SPRINT_SPEED = 7.1;
const GRAVITY = 22;
const JUMP_POWER = 7.6;
const ARENA_RADIUS = 25;

function k(x, y, z) {
  return `${x},${y},${z}`;
}

function addBlock(x, y, z, materialName) {
  const key = k(x, y, z);
  if (blocks.has(key)) return;
  const mesh = new THREE.Mesh(blockGeometry, mats[materialName]);
  mesh.position.set(x, y, z);
  mesh.userData = { x, y, z, materialName };
  scene.add(mesh);
  blocks.set(key, mesh);
}

function buildWall(x1, z1, x2, z2, y1, y2, materialName) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const x = Math.round(lerp(x1, x2, t));
    const z = Math.round(lerp(z1, z2, t));
    for (let y = y1; y <= y2; y++) addBlock(x, y, z, materialName);
  }
}

function buildArena() {
  for (let x = -ARENA_RADIUS; x <= ARENA_RADIUS; x++) {
    for (let z = -ARENA_RADIUS; z <= ARENA_RADIUS; z++) {
      const d = Math.hypot(x, z);
      if (d <= ARENA_RADIUS) {
        addBlock(x, 0, z, d > 21 ? "stone" : "grass");
        addBlock(x, -1, z, "dirt");
        addBlock(x, -2, z, "darkStone");
      }
    }
  }

  for (let angle = 0; angle < Math.PI * 2; angle += 0.065) {
    const x = Math.round(Math.cos(angle) * ARENA_RADIUS);
    const z = Math.round(Math.sin(angle) * ARENA_RADIUS);
    for (let y = 1; y <= 5; y++) addBlock(x, y, z, "darkStone");
    if (Math.round(angle * 100) % 7 === 0) addBlock(x, 6, z, "metal");
  }

  const pillars = [
    [-12, -12], [12, -12], [-12, 12], [12, 12],
    [0, -16], [0, 16], [-16, 0], [16, 0]
  ];
  for (const [x, z] of pillars) {
    for (let y = 1; y <= 5; y++) addBlock(x, y, z, "stone");
    addBlock(x, 6, z, "metal");
  }

  buildWall(-6, -5, 6, -5, 1, 2, "stone");
  buildWall(-6, 5, 6, 5, 1, 2, "stone");
  buildWall(-5, -4, -5, 4, 1, 2, "stone");
  buildWall(5, -4, 5, 4, 1, 2, "stone");

  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) addBlock(x, 1, z, "darkStone");
  }
  addBlock(0, 2, 0, "metal");

  for (let y = 1; y <= 4; y++) {
    addBlock(-20, y, 0, "red");
    addBlock(20, y, 0, "blue");
  }

  const ramps = [
    [-10, 0, 1], [10, 0, -1], [0, -10, 1], [0, 10, -1]
  ];
  for (const [x, z, direction] of ramps) {
    for (let i = 0; i < 4; i++) {
      const rx = x === 0 ? x : x + direction * i;
      const rz = z === 0 ? z : z + direction * i;
      for (let w = -1; w <= 1; w++) {
        addBlock(rx + (x === 0 ? w : 0), i + 1, rz + (z === 0 ? w : 0), "stone");
      }
    }
  }
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function weaponMaterials() {
  return {
    dark: new THREE.MeshStandardMaterial({ color: 0x26313b, metalness: 0.62, roughness: 0.36 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd9e5ee, metalness: 0.82, roughness: 0.23 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x55cfff, emissive: 0x0a3348, metalness: 0.4, roughness: 0.28 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xb68b39, metalness: 0.58, roughness: 0.32 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x4c3023, roughness: 0.78 })
  };
}

function createSword() {
  const m = weaponMaterials();
  const g = new THREE.Group();
  const blade = box(0.1, 1.24, 0.07, m.steel, 0, 0.77, 0);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.082, 0.25, 4), m.steel);
  tip.position.y = 1.5;
  tip.rotation.y = Math.PI / 4;
  const guard = box(0.46, 0.08, 0.12, m.gold, 0, 0.12, 0);
  const grip = box(0.12, 0.38, 0.12, m.grip, 0, -0.1, 0);
  const glow = box(0.025, 0.9, 0.075, m.accent, 0.045, 0.8, 0);
  g.add(blade, tip, guard, grip, glow);
  return g;
}

function createPistol() {
  const m = weaponMaterials();
  const g = new THREE.Group();
  g.add(
    box(0.22, 0.23, 0.7, m.dark, 0, 0.08, -0.18),
    box(0.18, 0.14, 0.52, m.steel, 0, 0.22, -0.2),
    box(0.16, 0.43, 0.2, m.grip, 0, -0.18, 0.02),
    box(0.08, 0.08, 0.58, m.accent, 0.09, 0.19, -0.2)
  );
  return g;
}

function createRifle() {
  const m = weaponMaterials();
  const g = new THREE.Group();
  g.add(
    box(0.28, 0.29, 1.25, m.dark, 0, 0, -0.34),
    box(0.18, 0.15, 0.92, m.steel, 0, 0.18, -0.55),
    box(0.14, 0.48, 0.2, m.grip, 0, -0.29, -0.12),
    box(0.18, 0.48, 0.28, m.dark, 0, -0.23, -0.52),
    box(0.1, 0.1, 1.02, m.accent, 0.13, 0.12, -0.52),
    box(0.18, 0.2, 0.45, m.dark, 0, 0, 0.48)
  );
  return g;
}

function createShotgun() {
  const m = weaponMaterials();
  const g = new THREE.Group();
  g.add(
    box(0.3, 0.28, 1.15, m.dark, 0, 0, -0.3),
    box(0.22, 0.18, 1.0, m.steel, 0, 0.19, -0.55),
    box(0.19, 0.47, 0.23, m.grip, 0, -0.26, -0.05),
    box(0.24, 0.18, 0.5, m.grip, 0, -0.08, -0.72),
    box(0.08, 0.08, 0.92, m.accent, 0.15, 0.14, -0.48)
  );
  return g;
}

function createWeaponModel(name) {
  if (name === "pistol") return createPistol();
  if (name === "rifle") return createRifle();
  if (name === "shotgun") return createShotgun();
  return createSword();
}

const viewWeaponRoot = new THREE.Group();
camera.add(viewWeaponRoot);
scene.add(camera);
let viewWeapon = null;

function equipViewWeapon(name) {
  if (viewWeapon) viewWeaponRoot.remove(viewWeapon);
  viewWeapon = createWeaponModel(name);
  viewWeaponRoot.add(viewWeapon);
  if (name === "sword") {
    viewWeapon.rotation.set(-0.32, 0.18, -0.18);
  } else {
    viewWeapon.rotation.set(0.03, Math.PI, 0.02);
  }
}

equipViewWeapon("sword");

function createNameplate(player) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2,7,12,.76)";
  ctx.roundRect(28, 12, 456, 96, 18);
  ctx.fill();
  ctx.strokeStyle = "rgba(121,213,255,.4)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "white";
  ctx.font = "700 35px Arial";
  ctx.textAlign = "center";
  ctx.fillText(player.name || "Fighter", 256, 55);
  ctx.fillStyle = "rgba(255,255,255,.12)";
  ctx.roundRect(72, 75, 368, 14, 7);
  ctx.fill();
  const ratio = clamp((player.health || 0) / 100, 0, 1);
  ctx.fillStyle = ratio > 0.5 ? "#64e283" : ratio > 0.25 ? "#ffc05a" : "#ff5b69";
  ctx.roundRect(72, 75, 368 * ratio, 14, 7);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set(3.6, 0.9, 1);
  sprite.userData.signature = `${player.name}:${player.health}`;
  return sprite;
}

function createRemotePlayer(player) {
  if (player.id === myId || remoteMeshes.has(player.id)) return;
  const g = new THREE.Group();
  const color = new THREE.Color(player.color || "#ffffff");
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xf0c39b });
  const darkMat = new THREE.MeshLambertMaterial({ color: color.clone().multiplyScalar(0.55) });

  const torso = box(0.72, 1.02, 0.38, bodyMat, 0, 0.65, 0);
  const head = box(0.47, 0.47, 0.47, skinMat, 0, 1.42, 0);
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.48, 1.02, 0);
  leftArmPivot.add(box(0.22, 0.82, 0.24, bodyMat, 0, -0.34, 0));
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.48, 1.02, 0);
  rightArmPivot.add(box(0.22, 0.82, 0.24, bodyMat, 0, -0.34, 0));
  const leftLeg = box(0.27, 0.78, 0.28, darkMat, -0.18, -0.25, 0);
  const rightLeg = box(0.27, 0.78, 0.28, darkMat, 0.18, -0.25, 0);
  const nameplate = createNameplate(player);
  nameplate.position.y = 2.3;

  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.55, 0.84, -0.08);
  const weapon = createWeaponModel(player.weapon || "sword");
  weapon.scale.setScalar(player.weapon === "sword" ? 0.72 : 0.58);
  weapon.rotation.set(player.weapon === "sword" ? 0 : 0.05, player.weapon === "sword" ? 0 : Math.PI, player.weapon === "sword" ? -0.5 : 0.05);
  weaponPivot.add(weapon);

  g.add(torso, head, leftArmPivot, rightArmPivot, leftLeg, rightLeg, nameplate, weaponPivot);
  g.userData = {
    torso,
    head,
    leftArmPivot,
    rightArmPivot,
    leftLeg,
    rightLeg,
    nameplate,
    weaponPivot,
    weapon,
    weaponName: player.weapon || "sword",
    targetPosition: new THREE.Vector3(player.x, player.y - PLAYER_HEIGHT, player.z),
    targetYaw: player.yaw || 0,
    lastTargetPosition: new THREE.Vector3(player.x, player.y - PLAYER_HEIGHT, player.z),
    speed: 0,
    walkTime: Math.random() * 10,
    fireAnim: 0
  };

  scene.add(g);
  remoteMeshes.set(player.id, g);
}

function replaceRemoteWeapon(group, name) {
  if (group.userData.weaponName === name) return;
  group.userData.weaponPivot.remove(group.userData.weapon);
  const weapon = createWeaponModel(name);
  weapon.scale.setScalar(name === "sword" ? 0.72 : 0.58);
  weapon.rotation.set(name === "sword" ? 0 : 0.05, name === "sword" ? 0 : Math.PI, name === "sword" ? -0.5 : 0.05);
  group.userData.weaponPivot.add(weapon);
  group.userData.weapon = weapon;
  group.userData.weaponName = name;
}

function refreshNameplate(group, player) {
  const signature = `${player.name}:${player.health}`;
  if (group.userData.nameplate.userData.signature === signature) return;
  group.remove(group.userData.nameplate);
  group.userData.nameplate.material.map.dispose();
  group.userData.nameplate.material.dispose();
  const sprite = createNameplate(player);
  sprite.position.y = 2.3;
  group.add(sprite);
  group.userData.nameplate = sprite;
}

function updateRemotePlayer(player, immediate = false) {
  if (player.id === myId) return;
  if (!remoteMeshes.has(player.id)) createRemotePlayer(player);
  const g = remoteMeshes.get(player.id);
  if (!g) return;

  const next = new THREE.Vector3(player.x, player.y - PLAYER_HEIGHT, player.z);
  const distance = next.distanceTo(g.userData.targetPosition);
  g.userData.speed = Math.min(8, distance * 20);
  g.userData.lastTargetPosition.copy(g.userData.targetPosition);
  g.userData.targetPosition.copy(next);
  g.userData.targetYaw = player.yaw || 0;
  g.visible = player.alive !== false;
  replaceRemoteWeapon(g, player.weapon || "sword");
  refreshNameplate(g, player);

  if (immediate) {
    g.position.copy(next);
    g.rotation.y = g.userData.targetYaw;
  }
}

function removeRemotePlayer(id) {
  const g = remoteMeshes.get(id);
  if (!g) return;
  scene.remove(g);
  remoteMeshes.delete(id);
}

function animateRemotePlayers(dt) {
  for (const g of remoteMeshes.values()) {
    const smoothing = 1 - Math.exp(-dt * 14);
    g.position.lerp(g.userData.targetPosition, smoothing);
    let delta = g.userData.targetYaw - g.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    g.rotation.y += delta * smoothing;

    const moving = g.userData.speed > 0.2;
    if (moving) g.userData.walkTime += dt * (5 + g.userData.speed * 0.45);
    const swing = moving ? Math.sin(g.userData.walkTime) * 0.58 : 0;
    g.userData.leftLeg.rotation.x = lerp(g.userData.leftLeg.rotation.x, swing, smoothing);
    g.userData.rightLeg.rotation.x = lerp(g.userData.rightLeg.rotation.x, -swing, smoothing);
    g.userData.leftArmPivot.rotation.x = lerp(g.userData.leftArmPivot.rotation.x, -swing * 0.55, smoothing);
    g.userData.rightArmPivot.rotation.x = lerp(g.userData.rightArmPivot.rotation.x, swing * 0.35, smoothing);

    if (g.userData.fireAnim > 0) {
      g.userData.fireAnim = Math.max(0, g.userData.fireAnim - dt * 5.5);
      const phase = 1 - g.userData.fireAnim;
      if (g.userData.weaponName === "sword") {
        g.userData.weapon.rotation.z = -0.5 - Math.sin(phase * Math.PI) * 1.4;
      } else {
        g.userData.weaponPivot.position.z = -0.08 + Math.sin(phase * Math.PI) * 0.12;
      }
    } else {
      g.userData.weapon.rotation.z = g.userData.weaponName === "sword" ? -0.5 : 0.05;
      g.userData.weaponPivot.position.z = -0.08;
    }
  }
}

function audioReady() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function synthSound(kind, volume = 0.12) {
  const ctx = audioReady();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const osc = ctx.createOscillator();
  osc.connect(gain);
  gain.connect(ctx.destination);

  if (kind === "sword") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);
    gain.gain.setValueAtTime(volume * 0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.start(now); osc.stop(now + 0.18);
  } else if (kind === "pistol") {
    osc.type = "square";
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (kind === "rifle") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.065);
    gain.gain.setValueAtTime(volume * 0.85, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    osc.start(now); osc.stop(now + 0.075);
  } else if (kind === "shotgun") {
    osc.type = "square";
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    gain.gain.setValueAtTime(volume * 1.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (kind === "hit") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);
    gain.gain.setValueAtTime(volume * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.start(now); osc.stop(now + 0.09);
  } else if (kind === "empty") {
    osc.type = "square";
    osc.frequency.setValueAtTime(180, now);
    gain.gain.setValueAtTime(volume * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now); osc.stop(now + 0.05);
  }
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function addMessage(name, text) {
  const line = document.createElement("div");
  line.textContent = `${name}: ${text}`;
  $("messages").appendChild(line);
  while ($("messages").children.length > 8) $("messages").firstChild.remove();
}

function addKillFeed(attacker, victim, weapon) {
  const line = document.createElement("div");
  line.className = "kill-line";
  line.innerHTML = `<b>${escapeHtml(attacker)}</b><em>${escapeHtml(WEAPON_META[weapon]?.label || weapon)}</em><span>${escapeHtml(victim)}</span>`;
  $("killFeed").appendChild(line);
  setTimeout(() => line.remove(), 5400);
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toast(text) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").classList.remove("show");
  void $("toast").offsetWidth;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 1600);
}

function flashElement(id, className = "show") {
  const el = $(id);
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

function applyPlayer(player) {
  players.set(player.id, { ...(players.get(player.id) || {}), ...player });
  if (player.id === myId) {
    myPlayer = players.get(player.id);
    alive = myPlayer.alive !== false;
    updateVitals(myPlayer.health, myPlayer.armor);
    updateStats();
  } else {
    updateRemotePlayer(players.get(player.id));
  }
  $("playerCount").textContent = players.size;
  updateScoreboard();
}

function updateStats() {
  if (!myPlayer) return;
  $("kills").textContent = myPlayer.kills || 0;
  $("deaths").textContent = myPlayer.deaths || 0;
  const deaths = myPlayer.deaths || 0;
  $("kd").textContent = deaths ? ((myPlayer.kills || 0) / deaths).toFixed(2) : (myPlayer.kills || 0).toFixed(2);
}

function updateVitals(health, armor) {
  const h = clamp(Number(health) || 0, 0, 100);
  const a = clamp(Number(armor) || 0, 0, 50);
  $("healthText").textContent = h;
  $("armorText").textContent = a;
  $("healthBar").style.width = `${h}%`;
  $("armorBar").style.width = `${(a / 50) * 100}%`;
  $("healthBar").style.background = h > 55
    ? "linear-gradient(90deg,#29b85b,#75df7f)"
    : h > 25
      ? "linear-gradient(90deg,#d6972c,#ffcf59)"
      : "linear-gradient(90deg,#b82737,#ff5b69)";
}

function updateScoreboard() {
  const sorted = Array.from(players.values()).sort((a, b) => (b.kills || 0) - (a.kills || 0) || (a.deaths || 0) - (b.deaths || 0));
  $("scoreRows").innerHTML = "";
  for (const p of sorted) {
    const row = document.createElement("div");
    row.className = `score-row${p.id === myId ? " me" : ""}`;
    const deaths = p.deaths || 0;
    const ratio = deaths ? ((p.kills || 0) / deaths).toFixed(2) : (p.kills || 0).toFixed(2);
    row.innerHTML = `
      <span class="score-player"><i class="score-color" style="background:${p.color};color:${p.color}"></i>${escapeHtml(p.name)}${p.id === myId ? " (You)" : ""}</span>
      <span>${p.kills || 0}</span>
      <span>${p.deaths || 0}</span>
      <span>${ratio}</span>
      <span>${escapeHtml(WEAPON_META[p.weapon]?.label || p.weapon || "—")}</span>`;
    $("scoreRows").appendChild(row);
  }
}

function updateWeaponUI() {
  const meta = WEAPON_META[selectedWeapon];
  $("weaponClass").textContent = meta.className;
  $("weaponName").textContent = meta.label;
  $("weaponHint").textContent = meta.hint;

  document.querySelectorAll("#weaponBar button").forEach((button) => {
    button.classList.toggle("active", button.dataset.weapon === selectedWeapon);
  });

  if (selectedWeapon === "sword") {
    $("ammoMag").textContent = "∞";
    $("ammoReserve").textContent = "∞";
  } else {
    const state = ammoState[selectedWeapon] || { mag: 0, reserve: 0 };
    $("ammoMag").textContent = state.mag;
    $("ammoReserve").textContent = state.reserve;
  }
}

function selectWeapon(name, notifyServer = true) {
  if (!WEAPON_META[name] || name === selectedWeapon) return;
  selectedWeapon = name;
  equipViewWeapon(name);
  updateWeaponUI();
  crosshairKick = Math.max(crosshairKick, 0.12);
  if (notifyServer) send({ type: "select_weapon", weapon: name });
  toast(WEAPON_META[name].label);
}

function applyWeaponState(message) {
  selectedWeapon = message.weapon || selectedWeapon;
  ammoState = message.ammo || ammoState;
  reloading = Boolean(message.reloading);
  reloadEndsAt = Number(message.reloadEndsAt) || 0;
  equipViewWeapon(selectedWeapon);
  updateWeaponUI();
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    $("connectionBanner").classList.remove("show");
    $("menuStatusDot").classList.add("online");
    $("menuStatusText").textContent = "Server online";
    addMessage("System", "Connected to Voxel Combat Arena");
  });

  socket.addEventListener("close", () => {
    $("connectionBanner").classList.add("show");
    $("menuStatusDot").classList.remove("online");
    $("menuStatusText").textContent = "Reconnecting…";
    reconnectTimer = setTimeout(connect, 1500);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "init") {
      myId = message.id;
      serverWeapons = message.weapons;
      $("az").textContent = message.az;
      $("instance").textContent = message.instanceId;
      players.clear();
      for (const p of message.players) players.set(p.id, p);
      const initial = players.get(myId);
      if (initial) {
        myPlayer = initial;
        camera.position.set(initial.x, initial.y, initial.z);
        yaw = initial.yaw || 0;
        pitch = initial.pitch || 0;
        camera.rotation.set(pitch, yaw, 0);
        updateVitals(initial.health, initial.armor);
        updateStats();
      }
      for (const p of players.values()) updateRemotePlayer(p, true);
      $("playerCount").textContent = players.size;
      updateScoreboard();
      send({ type: "hello", name: $("nameInput").value || "EC2 Fighter" });
    }

    if (message.type === "weapon_state") applyWeaponState(message);
    if (message.type === "player_join" || message.type === "player_update") applyPlayer(message.player);

    if (message.type === "state") {
      const merged = { ...(players.get(message.player.id) || {}), ...message.player };
      players.set(merged.id, merged);
      updateRemotePlayer(merged);
    }

    if (message.type === "player_leave") {
      players.delete(message.id);
      removeRemotePlayer(message.id);
      $("playerCount").textContent = players.size;
      updateScoreboard();
    }

    if (message.type === "weapon_fire") {
      const remote = remoteMeshes.get(message.attackerId);
      if (remote) remote.userData.fireAnim = 1;
      createWeaponEffect(message);
      if (message.attackerId === myId) flashElement("muzzleFlash");
    }

    if (message.type === "damage") {
      const target = players.get(message.targetId);
      if (target) {
        target.health = message.health;
        target.armor = message.armor;
        applyPlayer(target);
      }
      if (message.attackerId === myId) {
        flashElement("hitMarker");
        synthSound("hit", 0.12);
      }
      if (message.targetId === myId) {
        flashElement("damageFlash");
        cameraShake(0.11);
      }
    }

    if (message.type === "kill") {
      applyPlayer(message.attacker);
      applyPlayer(message.victim);
      addKillFeed(message.attacker.name, message.victim.name, message.weapon);
      if (message.victim.id === myId) {
        alive = false;
        $("deathTitle").textContent = `Defeated by ${message.attacker.name}`;
        $("deathSubtitle").textContent = `${WEAPON_META[message.weapon]?.label || message.weapon} • Respawning…`;
        $("deathScreen").classList.add("show");
        document.exitPointerLock();
      }
    }

    if (message.type === "respawn") {
      applyPlayer(message.player);
      if (message.player.id === myId) {
        camera.position.set(message.player.x, message.player.y, message.player.z);
        velocity.set(0, 0, 0);
        verticalVelocity = 0;
        alive = true;
        $("deathScreen").classList.remove("show");
        document.body.requestPointerLock();
      } else {
        updateRemotePlayer(message.player, true);
      }
    }

    if (message.type === "reload_start" && message.playerId !== myId) {
      const remote = remoteMeshes.get(message.playerId);
      if (remote) remote.userData.fireAnim = 0.35;
    }

    if (message.type === "dry_fire") synthSound("empty", 0.12);
    if (message.type === "chat") addMessage(message.name, message.text);
    if (message.type === "system") addMessage("System", message.text);
    if (message.type === "pong") pingMs = Math.max(0, Date.now() - Number(message.sentAt));
  });
}

function createTracer(origin, direction, color = 0xffd36b, length = 28) {
  const start = new THREE.Vector3(origin.x, origin.y, origin.z);
  const end = start.clone().add(new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(length));
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.88 });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  let life = 0.08;
  const fade = () => {
    life -= 0.016;
    material.opacity = Math.max(0, life / 0.08);
    if (life <= 0) {
      scene.remove(line);
      geometry.dispose();
      material.dispose();
    } else {
      requestAnimationFrame(fade);
    }
  };
  requestAnimationFrame(fade);
}

function createWeaponEffect(message) {
  const weapon = message.weapon;
  if (weapon === "sword") {
    synthSound("sword", message.attackerId === myId ? 0.12 : 0.045);
    return;
  }
  synthSound(weapon, message.attackerId === myId ? 0.13 : 0.05);
  const rays = weapon === "shotgun" && Array.isArray(message.rays) ? message.rays.slice(0, 5) : [message.direction];
  for (const ray of rays) createTracer(message.origin, ray, weapon === "rifle" ? 0x76dcff : 0xffd36b, weapon === "shotgun" ? 22 : 34);
}

function solidAt(x, y, z) {
  return blocks.has(k(Math.round(x), Math.round(y), Math.round(z)));
}

function collides(x, y, z) {
  const foot = y - PLAYER_HEIGHT;
  const horizontal = [
    [x - PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, z + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z + PLAYER_RADIUS]
  ];
  const vertical = [foot + 0.14, foot + 0.85, y - 0.12];
  return horizontal.some(([sx, sz]) => vertical.some((sy) => solidAt(sx, sy, sz)));
}

function groundHeight() {
  const x = Math.round(camera.position.x);
  const z = Math.round(camera.position.z);
  for (let y = 28; y >= -8; y--) {
    if (blocks.has(k(x, y, z))) return y + 0.5 + PLAYER_HEIGHT;
  }
  return -99;
}

function movementInput() {
  let x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let z = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const length = Math.hypot(x, z);
  if (length) { x /= length; z /= length; }
  return { x, z, length: Math.min(1, length) };
}

function updateMovement(dt) {
  if (!alive) return;
  const input = movementInput();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const sprinting = Boolean((keys.ShiftLeft || keys.ShiftRight) && input.z > 0 && input.length);
  const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
  const desired = new THREE.Vector3()
    .add(forward.multiplyScalar(input.z * speed))
    .add(right.multiplyScalar(input.x * speed));

  const acceleration = input.length ? 14 : 10;
  const smooth = 1 - Math.exp(-dt * acceleration);
  velocity.x = lerp(velocity.x, desired.x, smooth);
  velocity.z = lerp(velocity.z, desired.z, smooth);

  const nextX = camera.position.x + velocity.x * dt;
  if (!collides(nextX, camera.position.y, camera.position.z)) camera.position.x = nextX;
  else velocity.x *= -0.06;

  const nextZ = camera.position.z + velocity.z * dt;
  if (!collides(camera.position.x, camera.position.y, nextZ)) camera.position.z = nextZ;
  else velocity.z *= -0.06;

  verticalVelocity -= GRAVITY * dt;
  camera.position.y += verticalVelocity * dt;
  const floor = groundHeight();
  if (camera.position.y < floor) {
    camera.position.y = floor;
    verticalVelocity = 0;
    canJump = true;
  }

  if (camera.position.y < -8) {
    camera.position.set(0, 8, 0);
    verticalVelocity = 0;
  }

  const moveSpeed = Math.hypot(velocity.x, velocity.z);
  if (canJump && moveSpeed > 0.15) bobTime += dt * (sprinting ? 12.5 : 9.2);
  const bobAmount = canJump ? Math.min(moveSpeed / SPRINT_SPEED, 1) : 0;
  const bobX = Math.sin(bobTime) * 0.018 * bobAmount;
  const bobY = Math.abs(Math.cos(bobTime)) * 0.024 * bobAmount;

  const targetFov = aimHeld && selectedWeapon !== "sword" ? 62 : sprinting ? 82 : 76;
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 10));
  camera.updateProjectionMatrix();

  viewWeaponRoot.position.x = lerp(viewWeaponRoot.position.x, bobX, 1 - Math.exp(-dt * 14));
  viewWeaponRoot.position.y = lerp(viewWeaponRoot.position.y, -bobY, 1 - Math.exp(-dt * 14));

  const movingSpread = moveSpeed / SPRINT_SPEED;
  crosshairKick = Math.max(0, crosshairKick - dt * 1.9);
  const expanded = crosshairKick + movingSpread * 0.28 + (aimHeld ? -0.12 : 0);
  $("crosshair").classList.toggle("expanded", expanded > 0.13);
}

function cameraShake(amount) {
  recoilPitch += amount;
  recoilYaw += (Math.random() - 0.5) * amount;
}

function updateCameraRecoil(dt) {
  const recovery = 1 - Math.exp(-dt * 18);
  recoilPitch = lerp(recoilPitch, 0, recovery);
  recoilYaw = lerp(recoilYaw, 0, recovery);
  recoilVelocity = lerp(recoilVelocity, 0, recovery);
  camera.rotation.x = pitch + recoilPitch;
  camera.rotation.y = yaw + recoilYaw;
}

function updateViewWeapon(dt) {
  const aiming = aimHeld && selectedWeapon !== "sword";
  const meta = WEAPON_META[selectedWeapon];
  const t = 1 - Math.exp(-dt * 14);
  const targetX = aiming ? 0 : selectedWeapon === "sword" ? 0.48 : 0.42;
  const targetY = aiming ? -0.28 : selectedWeapon === "sword" ? -0.48 : -0.42;
  const targetZ = aiming ? -0.7 : selectedWeapon === "sword" ? -0.78 : -0.82;
  viewWeapon.position.x = lerp(viewWeapon.position.x, targetX, t);
  viewWeapon.position.y = lerp(viewWeapon.position.y, targetY, t);
  viewWeapon.position.z = lerp(viewWeapon.position.z, targetZ + recoilVelocity, t);

  if (selectedWeapon === "sword") {
    const swing = Math.max(0, (meta.cooldown - (performance.now() - lastLocalFireAt)) / meta.cooldown);
    if (swing > 0) {
      const phase = 1 - swing;
      viewWeapon.rotation.z = -0.18 - Math.sin(phase * Math.PI) * 1.45;
      viewWeapon.rotation.x = -0.32 + Math.sin(phase * Math.PI) * 0.5;
    } else {
      viewWeapon.rotation.z = lerp(viewWeapon.rotation.z, -0.18, t);
      viewWeapon.rotation.x = lerp(viewWeapon.rotation.x, -0.32, t);
    }
  }
}

function tryFire() {
  if (!alive || document.pointerLockElement !== document.body || reloading) return;
  const meta = WEAPON_META[selectedWeapon];
  const now = performance.now();
  if (now - lastLocalFireAt < meta.cooldown) return;

  if (selectedWeapon !== "sword") {
    const ammo = ammoState[selectedWeapon];
    if (!ammo || ammo.mag <= 0) {
      synthSound("empty");
      if (ammo?.reserve > 0) requestReload();
      return;
    }
  }

  lastLocalFireAt = now;
  send({ type: "attack" });
  synthSound(selectedWeapon, 0.12);
  recoilPitch += meta.recoil;
  recoilYaw += (Math.random() - 0.5) * meta.recoil * 0.55;
  recoilVelocity = meta.recoil * 0.65;
  crosshairKick = Math.max(crosshairKick, meta.spreadKick);
  if (selectedWeapon !== "sword") flashElement("muzzleFlash");
}

function requestReload() {
  if (selectedWeapon === "sword" || reloading) return;
  const ammo = ammoState[selectedWeapon];
  if (!ammo || ammo.reserve <= 0) return;
  send({ type: "reload" });
}

function updateReloadUI() {
  if (!reloading || !reloadEndsAt) {
    $("reloadBar").style.width = "0%";
    return;
  }
  const duration = serverWeapons?.[selectedWeapon]?.reload || 1500;
  const remaining = Math.max(0, reloadEndsAt - Date.now());
  const progress = clamp(1 - remaining / duration, 0, 1);
  $("reloadBar").style.width = `${progress * 100}%`;
  if (remaining <= 0) reloading = false;
}

function updateRadar() {
  const canvas = $("radarCanvas");
  const ctx = radarCtx;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createRadialGradient(w/2,h/2,5,w/2,h/2,w/2);
  gradient.addColorStop(0,"rgba(31,75,101,.6)");
  gradient.addColorStop(1,"rgba(2,8,14,.82)");
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(w/2,h/2,w/2-3,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "rgba(103,213,255,.16)";
  ctx.lineWidth = 1;
  for (const r of [28,55,82]) { ctx.beginPath(); ctx.arc(w/2,h/2,r,0,Math.PI*2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(w/2,8); ctx.lineTo(w/2,h-8); ctx.moveTo(8,h/2); ctx.lineTo(w-8,h/2); ctx.stroke();

  ctx.save();
  ctx.translate(w/2,h/2);
  ctx.rotate(yaw);
  const scale = 3.2;
  for (const p of players.values()) {
    if (p.id === myId || !p.alive || !myPlayer) continue;
    const dx = (p.x - camera.position.x) * scale;
    const dz = (p.z - camera.position.z) * scale;
    if (Math.hypot(dx,dz) > 78) continue;
    ctx.fillStyle = "#ff6672";
    ctx.beginPath(); ctx.arc(dx,dz,4,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = "#64dcff";
  ctx.beginPath();
  ctx.moveTo(w/2,h/2-7); ctx.lineTo(w/2-5,h/2+6); ctx.lineTo(w/2+5,h/2+6); ctx.closePath(); ctx.fill();
}

function sendStateAndPing(now) {
  if (alive && now - lastStateSent > 45) {
    send({ type: "state", x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw, pitch });
    lastStateSent = now;
  }
  if (now - lastPingSent > 2000) {
    send({ type: "ping", sentAt: Date.now() });
    lastPingSent = now;
  }
  $("ping").textContent = pingMs;
}

$("playButton").addEventListener("click", () => {
  audioReady();
  $("menu").style.display = "none";
  document.body.requestPointerLock();
});

$("nameInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") $("playButton").click();
});

document.querySelectorAll("#weaponBar button").forEach((button) => {
  button.addEventListener("click", () => selectWeapon(button.dataset.weapon));
});

document.addEventListener("keydown", (event) => {
  if (document.activeElement === $("chatInput")) {
    if (event.code === "Enter") {
      const text = $("chatInput").value.trim();
      if (text) send({ type: "chat", text });
      $("chatInput").value = "";
      $("chatInput").blur();
      if (alive) document.body.requestPointerLock();
    }
    return;
  }

  keys[event.code] = true;
  if (event.code === "Space" && canJump && alive) {
    verticalVelocity = JUMP_POWER;
    canJump = false;
  }
  if (event.code === "KeyR") requestReload();
  if (event.code === "Digit1") selectWeapon("sword");
  if (event.code === "Digit2") selectWeapon("pistol");
  if (event.code === "Digit3") selectWeapon("rifle");
  if (event.code === "Digit4") selectWeapon("shotgun");
  if (event.code === "Enter") {
    document.exitPointerLock();
    $("chatInput").focus();
  }
  if (event.code === "Tab") {
    event.preventDefault();
    $("scoreboard").classList.add("show");
  }
});

document.addEventListener("keyup", (event) => {
  keys[event.code] = false;
  if (event.code === "Tab") $("scoreboard").classList.remove("show");
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== document.body || !alive) return;
  const sensitivity = aimHeld ? 0.00115 : 0.0017;
  yaw -= event.movementX * sensitivity;
  pitch -= event.movementY * sensitivity;
  pitch = clamp(pitch, -1.42, 1.42);
});

document.addEventListener("mousedown", (event) => {
  if (document.pointerLockElement !== document.body) {
    if (alive) document.body.requestPointerLock();
    return;
  }
  if (event.button === 0) {
    fireHeld = true;
    tryFire();
  }
  if (event.button === 2) aimHeld = true;
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 0) fireHeld = false;
  if (event.button === 2) aimHeld = false;
});

document.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("blur", () => { fireHeld = false; aimHeld = false; });
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  updateMovement(dt);
  updateCameraRecoil(dt);
  updateViewWeapon(dt);
  animateRemotePlayers(dt);
  updateReloadUI();
  updateRadar();

  if (fireHeld && WEAPON_META[selectedWeapon].automatic) tryFire();
  sendStateAndPing(now);

  fpsFrames++;
  if (now - fpsStart >= 1000) {
    $("fps").textContent = fpsFrames;
    fpsFrames = 0;
    fpsStart = now;
  }

  renderer.render(scene, camera);
}

buildArena();
camera.position.set(0, 7, 16);
updateWeaponUI();
connect();
animate();
