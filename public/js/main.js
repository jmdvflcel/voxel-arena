import * as THREE from "/vendor/three.module.js";
import {
  QUALITY_PRESETS,
  WEAPON_INFO,
  WEAPON_ORDER,
  POWER_INFO,
  ABILITY_INFO,
  MOVEMENT
} from "./config.js";
import {
  buildWorld,
  collidingBox,
  supportHeight,
  PickupRenderer,
  createSky
} from "./world.js";
import { EffectsSystem } from "./effects.js";
import { AudioSystem } from "./audio.js";
import { RemotePlayer, LocalPlayerAvatar, FirstPersonWeapon } from "./player.js";
import { NetworkClient } from "./network.js";

const $ = (id) => document.getElementById(id);

const savedSettings = JSON.parse(localStorage.getItem("voxelCombatSettings") || "{}");
const settings = {
  quality: savedSettings.quality || "medium",
  fov: Number(savedSettings.fov || 78),
  sensitivity: Number(savedSettings.sensitivity || 1),
  volume: Number(savedSettings.volume ?? 0.45),
  cameraMode: savedSettings.cameraMode === "third" ? "third" : "first"
};

$("qualitySelect").value = settings.quality;
$("pauseQuality").value = settings.quality;
$("fovInput").value = settings.fov;
$("pauseFov").value = settings.fov;
$("sensitivityInput").value = settings.sensitivity;
$("pauseSensitivity").value = settings.sensitivity;
$("volumeInput").value = settings.volume;
$("pauseVolume").value = settings.volume;
$("cameraSelect").value = settings.cameraMode;
$("pauseCamera").value = settings.cameraMode;
$("fovValue").textContent = String(settings.fov);
$("sensitivityValue").textContent = settings.sensitivity.toFixed(2);
$("volumeValue").textContent = `${Math.round(settings.volume * 100)}%`;

const quality = { ...QUALITY_PRESETS[settings.quality] };

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ccff0, 28, quality.viewDistance);

const camera = new THREE.PerspectiveCamera(
  settings.fov,
  innerWidth / innerHeight,
  0.08,
  250
);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({
  antialias: quality.antialias,
  powerPreference: "high-performance"
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.sortObjects = true;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const sky = createSky(scene);

const hemisphere = new THREE.HemisphereLight(0xcfeeff, 0x26351f, 1.15);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xfff1d5, 2.15);
sun.position.set(45, 70, 30);
sun.castShadow = quality.shadows;
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
sun.shadow.camera.left = -38;
sun.shadow.camera.right = 38;
sun.shadow.camera.top = 38;
sun.shadow.camera.bottom = -38;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 150;
sun.shadow.bias = -0.00035;
scene.add(sun);

const ambient = new THREE.AmbientLight(0x7890aa, 0.42);
scene.add(ambient);

const world = buildWorld(scene, quality);
const pickupRenderer = new PickupRenderer(scene, quality);
const effects = new EffectsSystem(scene, quality.particles);
const audio = new AudioSystem();
audio.setVolume(settings.volume);

const network = new NetworkClient();
const clock = new THREE.Clock();
const firstPersonWeapon = new FirstPersonWeapon(camera);
let localAvatar = null;
const thirdPersonRaycaster = new THREE.Raycaster();
const thirdPersonCameraPosition = new THREE.Vector3();

const local = {
  id: null,
  name: "",
  team: "red",
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: -Math.PI / 2,
  pitch: 0,
  health: 100,
  armor: 25,
  kills: 0,
  deaths: 0,
  assists: 0,
  alive: false,
  weapon: "rifle",
  owned: new Set(["sword", "pistol", "rifle"]),
  ammo: {},
  blocking: false,
  reloading: false,
  crouching: false,
  powers: {
    speed: 0,
    dash: 0,
    rapid: 0,
    damage: 0,
    regen: 0,
    jump: 0,
    dashReadyAt: 0
  },
  dashUntil: 0,
  dashDirection: { x: 0, z: 0 },
  grapple: null,
  grappleReadyAt: 0,
  jumpPressedAt: -Infinity,
  lastGroundedAt: performance.now(),
  slideUntil: 0,
  grounded: true,
  correction: new THREE.Vector3(),
  input: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false
  },
  previousJump: false,
  previousCrouch: false
};

const remotePlayers = new Map();
const playerData = new Map();
const keys = {};
let serverWeapons = {};
let roundState = null;
let serverClockOffset = 0;
let inputSequence = 0;
let lastInputSent = 0;
let leftMouseDown = false;
let rightMouseDown = false;
let nextLocalAttackAt = 0;
let localCombo = 0;
let localComboAt = 0;
let localReloadEndsAt = 0;
let pointerStarted = false;
let pausedByMenu = false;
let resolutionScale = 1;
let fpsFrames = 0;
let fpsValue = 60;
let fpsWindowStart = performance.now();
let highFpsSeconds = 0;
let recoilPitch = 0;
let cameraBob = 0;
let cameraRoll = 0;
let landingKick = 0;
let lastGrounded = true;
let lastFootstepDust = 0;
let deathAt = 0;
let currentMatchTime = "05:00";
let movementAccumulator = 0;
const MOVEMENT_STEP = 1 / 60;
let serverPowerups = {};
let lastPowerHudSignature = "";
let clientBloom = 0;
const grappleLines = new Map();
const grappleMaterial = new THREE.LineBasicMaterial({ color: 0x78e5ff, transparent: true, opacity: 0.92 });
let killCam = {
  active: false,
  frames: [],
  events: [],
  eventIndex: 0,
  startedAt: 0,
  duration: 2200,
  killer: null,
  weapon: "rifle",
  restoreWeapon: "rifle"
};

const radarContext = $("radar").getContext("2d");

function saveSettings() {
  localStorage.setItem("voxelCombatSettings", JSON.stringify(settings));
}

function setCameraMode(mode, announce = true) {
  settings.cameraMode = mode === "third" ? "third" : "first";
  $("cameraSelect").value = settings.cameraMode;
  $("pauseCamera").value = settings.cameraMode;
  document.body.classList.toggle("third-person", settings.cameraMode === "third");
  firstPersonWeapon.setVisible(settings.cameraMode === "first");

  if (localAvatar) {
    localAvatar.group.visible = settings.cameraMode === "third" && local.alive;
  }

  $("cameraModeBadge").textContent = settings.cameraMode === "third"
    ? "THIRD PERSON · V TO SWITCH"
    : "FIRST PERSON · V TO SWITCH";

  if (announce && pointerStarted) {
    showCombatText(settings.cameraMode === "third" ? "THIRD PERSON" : "FIRST PERSON");
  }

  saveSettings();
}

function toggleCameraMode() {
  setCameraMode(settings.cameraMode === "first" ? "third" : "first");
}

function applyQuality(name) {
  settings.quality = name;
  Object.assign(quality, QUALITY_PRESETS[name]);
  renderer.shadowMap.enabled = quality.shadows;
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  scene.fog.far = quality.viewDistance;
  resolutionScale = Math.min(1, resolutionScale);
  updateRendererResolution();
  saveSettings();
}

function updateRendererResolution() {
  const ratio = Math.min(
    devicePixelRatio,
    quality.pixelRatio * resolutionScale
  );
  renderer.setPixelRatio(Math.max(0.55, ratio));
  $("resolutionText").textContent = `${Math.round(resolutionScale * 100)}%`;
}

function updateFov(value) {
  settings.fov = Number(value);
  $("fovValue").textContent = String(settings.fov);
  saveSettings();
}

function updateSensitivity(value) {
  settings.sensitivity = Number(value);
  $("sensitivityValue").textContent = settings.sensitivity.toFixed(2);
  saveSettings();
}

function updateVolume(value) {
  settings.volume = Number(value);
  $("volumeValue").textContent = `${Math.round(settings.volume * 100)}%`;
  audio.setVolume(settings.volume);
  saveSettings();
}

function setConnectedUi(connected) {
  $("playButton").disabled = !connected;
  $("playButton").textContent = connected ? "Enter Arena" : "Connecting to server...";
}

setConnectedUi(false);

function weaponAmmo(name) {
  return local.ammo[name] || { magazine: 0, reserve: 0 };
}

function buildWeaponSlots() {
  $("weaponSlots").replaceChildren();

  WEAPON_ORDER.forEach((weaponName, index) => {
    const info = WEAPON_INFO[weaponName];
    const slot = document.createElement("div");
    slot.className = "weapon-slot";
    slot.dataset.weapon = weaponName;

    const key = document.createElement("strong");
    key.textContent = `${index === 9 ? 0 : index + 1} ${info.icon}`;

    const label = document.createElement("span");
    label.textContent = info.name.replace("Vector ", "").replace("Pulse ", "");

    slot.append(key, label);
    $("weaponSlots").appendChild(slot);
  });

  updateWeaponHud();
}

function updateWeaponHud() {
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  $("weaponIcon").textContent = info.icon;
  $("weaponName").textContent = info.name;

  const ammo = weaponAmmo(local.weapon);

  if (info.kind === "melee") {
    $("magazineText").textContent = "∞";
    $("reserveText").textContent = "BLOCK";
  } else {
    $("magazineText").textContent = String(ammo.magazine ?? 0);
    $("reserveText").textContent = String(ammo.reserve ?? 0);
  }

  if (local.reloading) {
    $("weaponState").textContent = "RELOADING";
  } else if (local.blocking) {
    $("weaponState").textContent = "BLOCKING";
  } else {
    $("weaponState").textContent = local.alive ? "READY" : "DISABLED";
  }

  document.querySelectorAll(".weapon-slot").forEach((slot) => {
    const weaponName = slot.dataset.weapon;
    slot.classList.toggle("active", weaponName === local.weapon);
    slot.classList.toggle("locked", !local.owned.has(weaponName));
  });
}

function setHealthArmor(health, armor) {
  local.health = Math.max(0, Math.min(100, health));
  local.armor = Math.max(0, Math.min(200, armor));

  $("healthText").textContent = String(Math.round(local.health));
  $("armorText").textContent = String(Math.round(local.armor));
  $("healthBar").style.width = `${local.health}%`;
  $("armorBar").style.width = `${Math.min(100, local.armor)}%`;
  $("armorText").classList.toggle("overshield", local.armor > 100);

  if (local.health > 55) {
    $("healthBar").style.background = "linear-gradient(90deg,#27ad58,#69e88d)";
  } else if (local.health > 25) {
    $("healthBar").style.background = "linear-gradient(90deg,#cb8a2b,#f0c84a)";
  } else {
    $("healthBar").style.background = "linear-gradient(90deg,#a91f35,#ef5665)";
  }
}

function activeLocalPower(name, now = Date.now()) {
  return Number(local.powers?.[name] || 0) > now;
}

function updatePowerHud() {
  const container = $("powerHud");
  if (!container) return;

  const now = Date.now();
  const active = Object.entries(POWER_INFO).filter(([name]) => {
    return name === "overshield" ? local.armor > 100 : activeLocalPower(name, now);
  });

  const signature = active.map(([name]) => {
    const value = name === "overshield"
      ? Math.round(local.armor)
      : name === "dash"
        ? `${Math.ceil((Number(local.powers.dash || 0) - now) / 250)}:${Math.ceil((Number(local.powers.dashReadyAt || 0) - now) / 250)}`
        : Math.ceil((Number(local.powers[name] || 0) - now) / 500);
    return `${name}:${value}`;
  }).join("|");

  if (signature === lastPowerHudSignature) return;
  lastPowerHudSignature = signature;
  container.replaceChildren();

  for (const [name, info] of active) {
    const chip = document.createElement("div");
    chip.className = `power-chip ${name}`;
    const label = document.createElement("strong");
    label.textContent = info.short;
    const detail = document.createElement("span");

    if (name === "overshield") {
      detail.textContent = `${Math.round(local.armor)} ARMOR`;
    } else if (name === "dash") {
      const readyIn = Math.max(0, Number(local.powers.dashReadyAt || 0) - now);
      const duration = Math.max(0, Number(local.powers.dash || 0) - now);
      detail.textContent = readyIn > 0 ? `${(readyIn / 1000).toFixed(1)}s` : `Q READY · ${Math.ceil(duration / 1000)}s`;
      chip.classList.toggle("ready", readyIn <= 0);
    } else {
      detail.textContent = `${Math.ceil(Math.max(0, Number(local.powers[name]) - now) / 1000)}s`;
    }

    chip.append(label, detail);
    container.appendChild(chip);
  }

  container.classList.toggle("empty", active.length === 0);
}

function updateGrappleHud() {
  const now = Date.now();
  const remaining = Math.max(0, local.grappleReadyAt - now);
  const hud = $("grappleHud");
  hud.classList.toggle("cooldown", remaining > 0);
  hud.classList.toggle("active", Boolean(local.grapple));
  $("grappleState").textContent = local.grapple
    ? "PULLING · E CANCEL"
    : remaining > 0
      ? `${(remaining / 1000).toFixed(1)}s`
      : "READY";
}

function createGrappleLine(id, target, endsAt) {
  removeGrappleLine(id);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0,0,0,target.x,target.y,target.z], 3));
  const line = new THREE.Line(geometry, grappleMaterial.clone());
  line.frustumCulled = false;
  line.userData.target = new THREE.Vector3(target.x, target.y, target.z);
  line.userData.endsAt = endsAt;
  scene.add(line);
  grappleLines.set(id, line);
}

function removeGrappleLine(id) {
  const line = grappleLines.get(id);
  if (!line) return;
  scene.remove(line);
  line.geometry.dispose();
  line.material.dispose();
  grappleLines.delete(id);
}

function updateGrappleLines() {
  const now = Date.now();
  for (const [id, line] of grappleLines) {
    if (now >= line.userData.endsAt) {
      removeGrappleLine(id);
      if (id === local.id) local.grapple = null;
      continue;
    }
    let start;
    if (id === local.id) {
      start = settings.cameraMode === "first"
        ? firstPersonWeapon.muzzleWorldPosition()
        : new THREE.Vector3(local.x, local.y + 1.35, local.z);
    } else {
      const remote = remotePlayers.get(id);
      start = remote
        ? remote.group.position.clone().add(new THREE.Vector3(0, 1.35, 0))
        : new THREE.Vector3();
    }
    const positions = line.geometry.attributes.position.array;
    positions[0]=start.x; positions[1]=start.y; positions[2]=start.z;
    positions[3]=line.userData.target.x; positions[4]=line.userData.target.y; positions[5]=line.userData.target.z;
    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = 0.72 + Math.sin(performance.now() * 0.025) * 0.18;
  }
}

function powerName(name) {
  return POWER_INFO[name]?.name || String(name || "Power");
}

function showAnimated(element, duration = 1500) {
  element.classList.remove("show");
  void element.offsetWidth;
  element.classList.add("show");
  clearTimeout(element._hideTimer);
  element._hideTimer = setTimeout(() => element.classList.remove("show"), duration);
}

function showPickup(text) {
  $("pickupNotice").textContent = text;
  showAnimated($("pickupNotice"), 1600);
}

function showCombatText(text) {
  $("combatText").textContent = text;
  showAnimated($("combatText"), 1300);
}

function showKillBanner(text) {
  $("killBanner").textContent = text;
  showAnimated($("killBanner"), 1700);
}

function showHit(headshot = false) {
  showAnimated($("hitMarker"), 230);

  if (headshot) {
    showAnimated($("headshotMarker"), 760);
  }
}

function addChat(name, text, team = "system") {
  const line = document.createElement("div");
  line.className = `chat-line ${team}`;

  if (team === "system") {
    line.classList.add("system");
    line.textContent = text;
  } else {
    const strong = document.createElement("strong");
    strong.textContent = `${name}: `;
    const span = document.createElement("span");
    span.textContent = text;
    line.append(strong, span);
  }

  $("messages").appendChild(line);

  while ($("messages").children.length > 9) {
    $("messages").firstChild.remove();
  }
}

function addKillFeed(message) {
  const line = document.createElement("div");
  line.className = "kill-line";

  const killer = document.createElement("span");
  killer.className = message.killer.team;
  killer.textContent = message.killer.name;

  const weapon = document.createElement("span");
  weapon.className = "weapon";
  weapon.textContent = `${WEAPON_INFO[message.weapon]?.icon || "×"}${message.headshot ? " HEADSHOT" : ""}`;

  const victim = document.createElement("span");
  victim.className = message.victim.team;
  victim.textContent = message.victim.name;

  line.append(killer, weapon, victim);
  $("killFeed").appendChild(line);
  setTimeout(() => line.remove(), 5400);
}

function updateScoreboard() {
  const players = Array.from(playerData.values());

  const renderTeam = (team, container) => {
    container.replaceChildren();

    const header = document.createElement("div");
    header.className = "score-row header";
    ["PLAYER", "K", "D", "A"].forEach((text) => {
      const span = document.createElement("span");
      span.textContent = text;
      header.appendChild(span);
    });
    container.appendChild(header);

    players
      .filter((player) => player.team === team)
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .forEach((player) => {
        const row = document.createElement("div");
        row.className = `score-row${player.id === local.id ? " me" : ""}`;

        const name = document.createElement("span");
        name.textContent = `${player.name}${player.id === local.id ? " (You)" : ""}`;
        const kills = document.createElement("span");
        kills.textContent = String(player.kills);
        const deaths = document.createElement("span");
        deaths.textContent = String(player.deaths);
        const assists = document.createElement("span");
        assists.textContent = String(player.assists);

        row.append(name, kills, deaths, assists);
        container.appendChild(row);
      });
  };

  renderTeam("red", $("redRows"));
  renderTeam("blue", $("blueRows"));
  $("playersText").textContent = String(players.length);
}

function applyPlayerData(player, sampleTime = performance.now()) {
  playerData.set(player.id, {
    ...(playerData.get(player.id) || {}),
    ...player
  });

  if (player.id === local.id) {
    local.name = player.name;
    local.team = player.team;
    local.health = player.health;
    local.armor = player.armor;
    local.kills = player.kills;
    local.deaths = player.deaths;
    local.assists = player.assists;
    local.alive = player.alive;
    local.blocking = player.blocking;
    local.crouching = player.crouching;
    local.weapon = player.weapon;
    local.owned = new Set(player.owned || Array.from(local.owned));
    local.powers = { ...local.powers, ...(player.powers || {}) };
    local.grappleReadyAt = Number(player.powers?.grappleReadyAt || local.grappleReadyAt || 0);
    if (player.grapple) local.grapple = { ...player.grapple };

    setHealthArmor(player.health, player.armor);
    updateWeaponHud();
    return;
  }

  let remote = remotePlayers.get(player.id);

  if (!remote) {
    remote = new RemotePlayer(scene, player, quality);
    remotePlayers.set(player.id, remote);
  }

  remote.pushSample(player, sampleTime);
}

function removeRemotePlayer(id) {
  const remote = remotePlayers.get(id);

  if (remote) {
    remote.dispose();
    remotePlayers.delete(id);
  }

  playerData.delete(id);
  updateScoreboard();
}

function setRound(round) {
  if (!round) return;

  roundState = round;
  if (Number.isFinite(round.serverNow)) {
    serverClockOffset = round.serverNow - Date.now();
  }

  $("redScore").textContent = String(round.score.red);
  $("blueScore").textContent = String(round.score.blue);

  if (round.status === "ended") {
    const winner = round.winner;
    $("roundWinner").textContent = winner === "draw"
      ? "DRAW"
      : `${String(winner).toUpperCase()} TEAM WINS`;
    $("roundWinner").style.color = winner === "red"
      ? "#ff7380"
      : winner === "blue"
        ? "#76b8ff"
        : "#fff";
    $("roundEnd").classList.remove("hidden");
  } else {
    $("roundEnd").classList.add("hidden");
  }
}

function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function updateMatchClock() {
  if (!roundState) return;

  const serverNow = Date.now() + serverClockOffset;
  const target = roundState.status === "ended"
    ? roundState.restartAt
    : roundState.endsAt;

  currentMatchTime = formatTime(target - serverNow);
  $("matchTimer").textContent = currentMatchTime;
  $("scoreboardTimer").textContent = currentMatchTime;

  if (roundState.status === "ended") {
    $("matchStatus").textContent = "Next round";
    $("roundRestart").textContent = `Next round in ${currentMatchTime}`;
  } else {
    $("matchStatus").textContent = "First to 30";
  }
}

function updateRadar() {
  const context = radarContext;
  const width = context.canvas.width;
  const height = context.canvas.height;
  const center = width / 2;
  const scale = 3.0;

  context.clearRect(0, 0, width, height);

  const gradient = context.createRadialGradient(center, center, 8, center, center, center);
  gradient.addColorStop(0, "rgba(14,27,42,.72)");
  gradient.addColorStop(1, "rgba(4,9,16,.92)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(center, center, center - 3, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "rgba(255,255,255,.1)";
  context.lineWidth = 1;

  for (const radius of [30, 58, 84]) {
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.stroke();
  }

  context.beginPath();
  context.moveTo(center, 5);
  context.lineTo(center, height - 5);
  context.moveTo(5, center);
  context.lineTo(width - 5, center);
  context.stroke();

  const sin = Math.sin(-local.yaw);
  const cos = Math.cos(-local.yaw);

  for (const player of playerData.values()) {
    if (player.id === local.id || !player.alive) continue;

    const dx = player.x - local.x;
    const dz = player.z - local.z;
    const rotatedX = dx * cos - dz * sin;
    const rotatedZ = dx * sin + dz * cos;
    const x = center + rotatedX * scale;
    const y = center + rotatedZ * scale;

    if (Math.hypot(x - center, y - center) > center - 7) continue;

    context.fillStyle = player.team === local.team ? "#7cd0ff" : "#ff6473";
    context.beginPath();
    context.arc(x, y, player.team === local.team ? 3.3 : 2.7, 0, Math.PI * 2);
    context.fill();
  }

  context.save();
  context.translate(center, center);
  context.fillStyle = "#fff";
  context.beginPath();
  context.moveTo(0, -8);
  context.lineTo(5, 6);
  context.lineTo(0, 3);
  context.lineTo(-5, 6);
  context.closePath();
  context.fill();
  context.restore();

  context.strokeStyle = local.team === "red" ? "#ff5968" : "#5aa9ff";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(center, center, center - 4, 0, Math.PI * 2);
  context.stroke();
}

function currentEyeHeight() {
  return local.input.crouch || performance.now() < local.slideUntil ? 1.18 : 1.62;
}

function collisionAt(x, y, z) {
  return collidingBox(
    {
      x,
      y,
      z
    },
    local.input.crouch
  );
}

function applyFriction(value, friction, dt) {
  return value * Math.max(0, 1 - friction * dt);
}

function simulateLocalMovement(dt) {
  if (!local.alive || pausedByMenu || killCam.active) return;

  const now = performance.now();
  const epochNow = Date.now();
  const support = supportHeight(local.x, local.z, local.y);
  const grounded = local.y <= support + 0.04 && local.vy <= 0.3;
  local.grounded = grounded;

  if (grounded) local.lastGroundedAt = now;

  const jumpBuffered = now - local.jumpPressedAt <= MOVEMENT.jumpBuffer * 1000;
  const canCoyoteJump = now - local.lastGroundedAt <= MOVEMENT.coyoteTime * 1000;

  if (jumpBuffered && canCoyoteJump) {
    local.vy = MOVEMENT.jumpSpeed * (activeLocalPower("jump", epochNow) ? 1.28 : 1);
    local.jumpPressedAt = -Infinity;
    local.lastGroundedAt = -Infinity;
  }

  const horizontalSpeed = Math.hypot(local.vx, local.vz);

  if (local.input.crouch &&
      !local.previousCrouch &&
      local.input.sprint &&
      grounded &&
      horizontalSpeed > 5.2) {
    local.slideUntil = now + 720;
    effects.spawnDust({ x: local.x, y: local.y + 0.05, z: local.z }, 9);
  }

  local.previousJump = local.input.jump;
  local.previousCrouch = local.input.crouch;

  let rightAmount = (local.input.right ? 1 : 0) - (local.input.left ? 1 : 0);
  let forwardAmount = (local.input.forward ? 1 : 0) - (local.input.backward ? 1 : 0);
  const length = Math.hypot(rightAmount, forwardAmount);

  if (length > 0) {
    rightAmount /= length;
    forwardAmount /= length;
  }

  const sin = Math.sin(local.yaw);
  const cos = Math.cos(local.yaw);
  const worldX = rightAmount * cos - forwardAmount * sin;
  const worldZ = -rightAmount * sin - forwardAmount * cos;

  let maxSpeed = MOVEMENT.walkSpeed;
  if (local.input.crouch) maxSpeed = MOVEMENT.crouchSpeed;
  if (local.input.sprint && !local.input.crouch) maxSpeed = MOVEMENT.sprintSpeed;
  if (activeLocalPower("speed", epochNow)) maxSpeed *= 1.35;
  if (local.blocking) maxSpeed *= 0.55;

  const accel = (grounded ? MOVEMENT.moveAccel : MOVEMENT.airAccel) * (activeLocalPower("jump", epochNow) ? 1.18 : 1);
  const sliding = now < local.slideUntil;
  const dashing = now < local.dashUntil;

  if (dashing) {
    local.vx = local.dashDirection.x * MOVEMENT.dashSpeed;
    local.vz = local.dashDirection.z * MOVEMENT.dashSpeed;
  } else if (sliding) {
    const current = Math.hypot(local.vx, local.vz) || 1;
    local.vx = local.vx / current * Math.max(MOVEMENT.slideSpeed * 0.72, current);
    local.vz = local.vz / current * Math.max(MOVEMENT.slideSpeed * 0.72, current);
  } else {
    const targetVx = worldX * maxSpeed;
    const targetVz = worldZ * maxSpeed;
    const response = 1 - Math.exp(-accel * dt / Math.max(maxSpeed, 1));
    local.vx += (targetVx - local.vx) * response;
    local.vz += (targetVz - local.vz) * response;

    if (length === 0) {
      const friction = grounded ? MOVEMENT.groundFriction : MOVEMENT.airFriction;
      local.vx = applyFriction(local.vx, friction, dt);
      local.vz = applyFriction(local.vz, friction, dt);
    }
  }

  let gravityScale = 1;
  if (local.grapple) {
    const epochNow = Date.now();
    if (epochNow >= local.grapple.endsAt) {
      local.grapple = null;
      removeGrappleLine(local.id);
    } else {
      const target = local.grapple.target;
      const dx = target.x - local.x;
      const dy = target.y - (local.y + 1.0);
      const dz = target.z - local.z;
      const distanceToTarget = Math.hypot(dx, dy, dz) || 1;
      if (distanceToTarget < 1.45) {
        local.grapple = null;
        removeGrappleLine(local.id);
      } else {
        const pull = MOVEMENT.grapplePull * dt;
        local.vx += dx / distanceToTarget * pull;
        local.vy += dy / distanceToTarget * pull * 0.92;
        local.vz += dz / distanceToTarget * pull;
        const total = Math.hypot(local.vx, local.vy, local.vz);
        if (total > MOVEMENT.grappleMaxSpeed) {
          const scale = MOVEMENT.grappleMaxSpeed / total;
          local.vx *= scale; local.vy *= scale; local.vz *= scale;
        }
        gravityScale = 0.28;
      }
    }
  }

  const tryMove = (axis, amount) => {
    if (Math.abs(amount) < 0.000001) return;
    const nextX = axis === "x" ? local.x + amount : local.x;
    const nextZ = axis === "z" ? local.z + amount : local.z;
    const collision = collisionAt(nextX, local.y, nextZ);

    if (!collision) {
      if (axis === "x") local.x = nextX;
      else local.z = nextZ;
      return;
    }

    const canMantle = (local.input.jump || local.input.forward) &&
      collision.maxY > local.y + 0.15 &&
      collision.maxY <= local.y + 1.15 &&
      local.vy <= 1.5;

    if (canMantle) {
      local.y = collision.maxY + 0.02;
      local.vy = Math.max(local.vy, 2.1);
      if (axis === "x") local.x = nextX;
      else local.z = nextZ;
      landingKick = Math.max(landingKick, 0.08);
      return;
    }

    if (axis === "x") local.vx = 0;
    else local.vz = 0;
  };

  const moveX = local.vx * dt;
  const moveZ = local.vz * dt;
  const substeps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) / 0.18));
  for (let step = 0; step < substeps; step++) {
    tryMove("x", moveX / substeps);
    tryMove("z", moveZ / substeps);
  }

  const distance = Math.hypot(local.x, local.z);
  const boundary = MOVEMENT.arenaRadius - MOVEMENT.playerRadius;

  if (distance > boundary) {
    const scale = boundary / distance;
    local.x *= scale;
    local.z *= scale;
    local.vx *= 0.4;
    local.vz *= 0.4;
  }

  const preFallVelocity = local.vy;
  local.vy -= MOVEMENT.gravity * gravityScale * dt;
  local.y += local.vy * dt;

  const newSupport = supportHeight(local.x, local.z, local.y);
  if (local.y < newSupport) {
    local.y = newSupport;
    local.vy = 0;
    local.grounded = true;
    local.lastGroundedAt = now;
  }

  if (!lastGrounded && local.grounded) {
    landingKick = Math.min(0.18, Math.abs(preFallVelocity) * 0.015 + 0.06);
    effects.spawnDust({ x: local.x, y: local.y + 0.04, z: local.z }, 6);
  }
  lastGrounded = local.grounded;

  if (local.correction.lengthSq() > 0.000001) {
    const factor = 1 - Math.exp(-dt * 10);
    const applied = local.correction.clone().multiplyScalar(factor);
    local.x += applied.x;
    local.y += applied.y;
    local.z += applied.z;
    local.correction.sub(applied);
  }

  const speed = Math.hypot(local.vx, local.vz);
  if (local.grounded && speed > 1.2 && !sliding && !dashing) {
    audio.playFootstep(speed, "stone");
    if (now - lastFootstepDust > Math.max(220, 500 - speed * 30)) {
      lastFootstepDust = now;
      effects.spawnDust({ x: local.x, y: local.y + 0.04, z: local.z }, 2);
    }
  }

  cameraBob += dt * (6.2 + speed * 0.76);
  const bobAmount = local.grounded ? Math.min(1, speed / 5) : 0;
  const eyeHeight = currentEyeHeight();
  const bobX = Math.sin(cameraBob) * 0.022 * bobAmount;
  const bobY = Math.abs(Math.cos(cameraBob * 2)) * 0.016 * bobAmount;

  landingKick *= Math.pow(0.04, dt);
  cameraRoll += ((local.input.right ? -1 : 0) + (local.input.left ? 1 : 0) - cameraRoll) * (1 - Math.exp(-dt * 9));
  updateCameraTransform(dt, eyeHeight, bobX, bobY);
  recoilPitch *= Math.pow(0.01, dt);
}

function updateCameraTransform(dt, eyeHeight, bobX, bobY) {
  const roll = cameraRoll * 0.012;

  if (settings.cameraMode === "first") {
    camera.position.set(
      local.x + bobX,
      local.y + eyeHeight - bobY - landingKick,
      local.z
    );
    camera.rotation.y = local.yaw;
    camera.rotation.x = local.pitch + recoilPitch;
    camera.rotation.z = roll;
    return;
  }

  const pitch = THREE.MathUtils.clamp(local.pitch * 0.72, -0.85, 0.72);
  const cosPitch = Math.cos(pitch);
  const viewDirection = new THREE.Vector3(
    -Math.sin(local.yaw) * cosPitch,
    Math.sin(pitch),
    -Math.cos(local.yaw) * cosPitch
  ).normalize();
  const right = new THREE.Vector3(Math.cos(local.yaw), 0, -Math.sin(local.yaw));
  const pivot = new THREE.Vector3(
    local.x,
    local.y + Math.max(1.25, eyeHeight * 0.88),
    local.z
  );

  const desired = pivot
    .clone()
    .addScaledVector(viewDirection, -5.2)
    .addScaledVector(right, 0.72);
  desired.y += 0.42;

  const rayDirection = desired.clone().sub(pivot);
  const desiredDistance = rayDirection.length();
  rayDirection.normalize();
  thirdPersonRaycaster.set(pivot, rayDirection);
  thirdPersonRaycaster.far = desiredDistance;
  const hit = thirdPersonRaycaster.intersectObjects(world.meshes, false)[0];

  if (hit && hit.distance < desiredDistance) {
    desired.copy(pivot).addScaledVector(rayDirection, Math.max(0.55, hit.distance - 0.28));
  }

  if (thirdPersonCameraPosition.lengthSq() === 0) {
    thirdPersonCameraPosition.copy(desired);
  }

  thirdPersonCameraPosition.lerp(desired, 1 - Math.exp(-dt * 14));
  camera.position.copy(thirdPersonCameraPosition);
  camera.rotation.y = local.yaw;
  camera.rotation.x = pitch + recoilPitch * 0.55;
  camera.rotation.z = roll * 0.45;
}

function useDash() {
  const now = Date.now();
  if (!local.alive || !activeLocalPower("dash", now)) {
    if (local.alive) showCombatText("FIND A BLINK CORE");
    return;
  }

  if (now < Number(local.powers.dashReadyAt || 0)) {
    showCombatText("DASH RECHARGING");
    return;
  }

  let x = Number(local.input.right) - Number(local.input.left);
  let z = Number(local.input.forward) - Number(local.input.backward);
  if (Math.hypot(x, z) < 0.1) z = 1;
  const length = Math.hypot(x, z) || 1;
  x /= length;
  z /= length;
  const sin = Math.sin(local.yaw);
  const cos = Math.cos(local.yaw);
  local.dashDirection = {
    x: x * cos - z * sin,
    z: -x * sin - z * cos
  };
  local.dashUntil = performance.now() + MOVEMENT.dashDuration * 1000;
  local.powers.dashReadyAt = now + 1600;
  local.vx = local.dashDirection.x * MOVEMENT.dashSpeed;
  local.vz = local.dashDirection.z * MOVEMENT.dashSpeed;

  effects.spawnDash({ x: local.x, y: local.y, z: local.z }, local.dashDirection);
  audio.playDash();
  network.send("ability", { ability: "dash" });
  showCombatText("DASH");
}

function useGrapple() {
  if (!local.alive || killCam.active) return;
  const now = Date.now();
  if (!local.grapple && now < local.grappleReadyAt) {
    showCombatText(`GRAPPLE ${(local.grappleReadyAt - now) / 1000 > 0 ? ((local.grappleReadyAt - now) / 1000).toFixed(1) : 0}s`);
    return;
  }
  network.send("ability", { ability: "grapple", yaw: local.yaw, pitch: local.pitch });
  if (local.grapple) showCombatText("GRAPPLE RELEASED");
}

function sendInput(now) {
  if (!local.id || now - lastInputSent < 33) return;

  inputSequence++;

  network.send("input", {
    seq: inputSequence,
    input: { ...local.input, aiming: rightMouseDown && WEAPON_INFO[local.weapon]?.kind === "gun" },
    yaw: local.yaw,
    pitch: local.pitch
  });

  lastInputSent = now;
}

function switchWeapon(weaponName) {
  if (!local.owned.has(weaponName) || !local.alive) return;
  if (local.weapon === weaponName) return;

  local.weapon = weaponName;
  local.reloading = false;
  local.blocking = false;
  firstPersonWeapon.setWeapon(weaponName);
  firstPersonWeapon.setReloading(false);
  firstPersonWeapon.setBlocking(false);
  network.send("switch_weapon", { weapon: weaponName });
  updateWeaponHud();
}

function reloadWeapon() {
  const info = WEAPON_INFO[local.weapon];

  if (!local.alive || info.kind === "melee" || local.reloading) return;

  const ammo = weaponAmmo(local.weapon);
  const serverInfo = serverWeapons[local.weapon];

  if (!serverInfo || ammo.magazine >= serverInfo.magazine || ammo.reserve <= 0) return;

  local.reloading = true;
  localReloadEndsAt = performance.now() + serverInfo.reload;
  firstPersonWeapon.setReloading(true);
  network.send("reload");
  audio.playReload();
  updateWeaponHud();
}

function attackSword() {
  const now = performance.now();
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.sword;

  if (now < nextLocalAttackAt || local.blocking || local.reloading) return;

  if (now - localComboAt > 900) localCombo = 0;
  else localCombo = (localCombo + 1) % 3;

  localComboAt = now;
  nextLocalAttackAt = now + info.localCooldown + localCombo * 45;
  firstPersonWeapon.melee(localCombo);
  if (localAvatar) localAvatar.triggerSwing(localCombo);
  audio.playWeapon(local.weapon === "voidblade" ? "railgun" : "sword");
  network.send("melee", { combo: localCombo, weapon: local.weapon });
}

function fireGun() {
  const now = performance.now();
  const info = WEAPON_INFO[local.weapon];
  const ammo = weaponAmmo(local.weapon);

  if (now < nextLocalAttackAt || local.reloading || ammo.magazine <= 0) {
    if (ammo.magazine <= 0 && !local.reloading) {
      showCombatText("EMPTY — PRESS R");
    }
    return;
  }

  const ammoCost = serverWeapons[local.weapon]?.ammoPerShot || 1;
  if (ammo.magazine < ammoCost) {
    showCombatText("EMPTY — PRESS R");
    return;
  }
  const rapidMultiplier = activeLocalPower("rapid") ? 0.70 : 1;
  nextLocalAttackAt = now + info.localCooldown * rapidMultiplier;
  ammo.magazine -= ammoCost;
  firstPersonWeapon.fire();
  if (localAvatar) localAvatar.triggerFire();
  audio.playWeapon(local.weapon);
  recoilPitch += info.recoil;
  clientBloom = Math.min(
    Number(serverWeapons[local.weapon]?.maxBloom || 0.04),
    clientBloom + Number(serverWeapons[local.weapon]?.bloomPerShot || 0.003)
  );
  network.send("fire", {
    weapon: local.weapon,
    latency: network.latency,
    aiming: rightMouseDown
  });
  updateWeaponHud();

  const origin = settings.cameraMode === "third" && localAvatar
    ? localAvatar.muzzleWorldPosition()
    : firstPersonWeapon.muzzleWorldPosition();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const end = origin.clone().addScaledVector(direction, 18);

  const heavy = local.weapon === "shotgun" || local.weapon === "railgun";
  effects.spawnMuzzle(origin, info.color, heavy ? 1.75 : local.weapon === "lmg" ? 1.25 : 1);
  effects.spawnTracer(origin, end, info.color, heavy ? 1.6 : 1);
}

function attemptAttack() {
  if (!local.alive || pausedByMenu) return;

  if (WEAPON_INFO[local.weapon]?.kind === "melee") {
    attackSword();
  } else {
    fireGun();
  }
}

function setBlockOrAim(active) {
  rightMouseDown = active;

  if (WEAPON_INFO[local.weapon]?.kind === "melee") {
    local.blocking = active;
    firstPersonWeapon.setBlocking(active);
    network.send("block", { active });
  }

  updateWeaponHud();
}

function updateAutomaticFire() {
  if (!leftMouseDown || !local.alive) return;

  const info = WEAPON_INFO[local.weapon];

  if (info?.automatic) {
    attemptAttack();
  }
}

function startKillCam(message) {
  if (!message.frames?.length) return;
  killCam = {
    active: true,
    frames: message.frames,
    events: message.events || [],
    eventIndex: 0,
    startedAt: performance.now(),
    duration: Math.max(1000, Number(message.deathTime) - Number(message.startTime)),
    killer: message.killer,
    weapon: message.weapon || message.frames.at(-1)?.weapon || "rifle",
    restoreWeapon: local.weapon
  };
  $("killCamKiller").textContent = `${message.killer?.name || "Enemy"} · ${WEAPON_INFO[killCam.weapon]?.name || killCam.weapon}`;
  $("killCam").classList.remove("hidden");
  $("deathScreen").classList.add("hidden");
  $("scopeOverlay").classList.add("hidden");
  firstPersonWeapon.setVisible(true);
  firstPersonWeapon.setWeapon(killCam.weapon);
  document.exitPointerLock();
}

function finishKillCam(skipped = false) {
  if (!killCam.active) return;
  killCam.active = false;
  $("killCam").classList.add("hidden");
  firstPersonWeapon.setWeapon(local.weapon || killCam.restoreWeapon);
  firstPersonWeapon.setVisible(settings.cameraMode === "first");
  if (!local.alive) setDeathState(true, killCam.killer?.name || "");
  if (skipped) showCombatText("KILLCAM SKIPPED");
}

function updateKillCam(now, dt) {
  if (!killCam.active) return false;
  const elapsed = now - killCam.startedAt;
  const progress = THREE.MathUtils.clamp(elapsed / killCam.duration, 0, 1);
  $("killCamProgress").style.width = `${progress * 100}%`;
  const targetServerTime = killCam.frames[0].t + elapsed;
  let older = killCam.frames[0];
  let newer = killCam.frames[killCam.frames.length - 1];
  for (let i = 0; i < killCam.frames.length - 1; i++) {
    if (killCam.frames[i].t <= targetServerTime && killCam.frames[i + 1].t >= targetServerTime) {
      older = killCam.frames[i]; newer = killCam.frames[i + 1]; break;
    }
  }
  const span = Math.max(1, newer.t - older.t);
  const alpha = THREE.MathUtils.clamp((targetServerTime - older.t) / span, 0, 1);
  const x = THREE.MathUtils.lerp(older.x, newer.x, alpha);
  const y = THREE.MathUtils.lerp(older.y, newer.y, alpha);
  const z = THREE.MathUtils.lerp(older.z, newer.z, alpha);
  let yawDelta = newer.yaw - older.yaw;
  yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
  const yaw = older.yaw + yawDelta * alpha;
  const pitch = THREE.MathUtils.lerp(older.pitch, newer.pitch, alpha);
  camera.position.set(x, y + (newer.crouching ? 1.18 : 1.62), z);
  camera.rotation.set(pitch, yaw, 0, "YXZ");
  const weapon = newer.weapon || killCam.weapon;
  if (firstPersonWeapon.current !== weapon) firstPersonWeapon.setWeapon(weapon);
  while (killCam.eventIndex < killCam.events.length && killCam.events[killCam.eventIndex].t <= targetServerTime) {
    const event = killCam.events[killCam.eventIndex++];
    if (event.type === "fire") firstPersonWeapon.fire();
    if (event.type === "melee") firstPersonWeapon.melee(event.combo || 0);
  }
  firstPersonWeapon.update(dt, Math.hypot(newer.vx || 0, newer.vz || 0), true, Boolean(newer.aiming));
  if (progress >= 1) finishKillCam(false);
  return true;
}

function setDeathState(active, killerName = "") {
  if (active) {
    if (killCam.active) return;
    deathAt = performance.now();
    $("deathTitle").textContent = killerName
      ? `Eliminated by ${killerName}`
      : "You were defeated";
    $("deathScreen").classList.remove("hidden");
    document.exitPointerLock();
  } else {
    $("deathScreen").classList.add("hidden");
  }
}

function reconcileSelf(serverPlayer) {
  const error = new THREE.Vector3(
    serverPlayer.x - local.x,
    serverPlayer.y - local.y,
    serverPlayer.z - local.z
  );

  if (error.length() > 2.5) {
    local.x = serverPlayer.x;
    local.y = serverPlayer.y;
    local.z = serverPlayer.z;
    local.correction.set(0, 0, 0);
  } else {
    local.correction.add(error.multiplyScalar(0.55));
  }

  local.vx += (serverPlayer.vx - local.vx) * 0.18;
  local.vy += (serverPlayer.vy - local.vy) * 0.1;
  local.vz += (serverPlayer.vz - local.vz) * 0.18;
  applyPlayerData(serverPlayer);
}

function setupNetworkHandlers() {
  network.on("connected", () => {
    addChat("", "Connected to EC2 game server", "system");
    setConnectedUi(true);
  });

  network.on("disconnected", () => {
    addChat("", "Connection lost. Reconnecting...", "system");
    setConnectedUi(false);
  });

  network.on("latency", (latency) => {
    $("pingText").textContent = `${Math.round(latency)} ms`;
  });

  network.on("init", (message) => {
    local.id = message.id;
    serverWeapons = message.weapons || {};
    serverPowerups = message.powerups || {};
    local.ammo = message.ammo || {};
    local.owned = new Set(message.player.owned || []);
    local.weapon = message.player.weapon;
    local.x = message.player.x;
    local.y = message.player.y;
    local.z = message.player.z;
    local.yaw = message.player.yaw;
    local.pitch = message.player.pitch;
    local.alive = message.player.alive;
    local.name = message.player.name;
    local.team = message.player.team;
    local.powers = { ...local.powers, ...(message.player.powers || {}) };
    local.grappleReadyAt = Number(message.player.powers?.grappleReadyAt || 0);

    if (!localAvatar) {
      localAvatar = new LocalPlayerAvatar(scene, message.player, quality);
    }
    setCameraMode(settings.cameraMode, false);

    $("azText").textContent = message.availabilityZone;
    $("instanceText").textContent = message.instanceId;

    setHealthArmor(message.player.health, message.player.armor);
    firstPersonWeapon.setWeapon(local.weapon);
    pickupRenderer.setPickups(message.pickups || []);
    setRound(message.round);
    applyPlayerData(message.player);
    buildWeaponSlots();

    network.send("hello", {
      name: $("nameInput").value || localStorage.getItem("voxelCombatName") || "EC2 Fighter"
    });
  });

  network.on("snapshot", (message) => {
    const sampleTime = performance.now();
    setRound(message.round);

    const visibleIds = new Set();

    for (const player of message.players || []) {
      visibleIds.add(player.id);

      if (player.id === local.id) {
        reconcileSelf(player);
      } else {
        applyPlayerData(player, sampleTime);
      }
    }

    updateScoreboard();
  });

  network.on("player_update", (message) => {
    applyPlayerData(message.player);
    updateScoreboard();
  });

  network.on("player_leave", (message) => {
    removeRemotePlayer(message.id);
  });

  network.on("system", (message) => {
    addChat("", message.text, "system");
  });

  network.on("chat", (message) => {
    addChat(message.name, message.text, message.team);
  });

  network.on("weapon_state", (message) => {
    local.weapon = message.weapon;
    local.owned = new Set(message.owned || []);
    local.ammo = message.ammo || local.ammo;
    local.reloading = false;
    firstPersonWeapon.setWeapon(local.weapon);
    firstPersonWeapon.setReloading(false);
    updateWeaponHud();
  });

  network.on("weapon_switch", (message) => {
    const remote = remotePlayers.get(message.id);
    if (remote) remote.setWeapon(message.weapon);

    const player = playerData.get(message.id);
    if (player) player.weapon = message.weapon;
  });

  network.on("ammo", (message) => {
    local.ammo[message.weapon] = message.ammo;
    local.reloading = Boolean(message.reloading);
    localReloadEndsAt = Number(message.reloadEndsAt || 0) - Date.now() + performance.now();
    firstPersonWeapon.setReloading(local.reloading);
    updateWeaponHud();
  });

  network.on("empty", () => {
    showCombatText("EMPTY — PRESS R");
  });

  network.on("reload_state", (message) => {
    const remote = remotePlayers.get(message.id);
    if (remote) remote.reloading = message.reloading;

    const player = playerData.get(message.id);
    if (player) player.reloading = message.reloading ? message.weapon : null;
  });

  network.on("block_state", (message) => {
    const remote = remotePlayers.get(message.id);
    if (remote) remote.blocking = message.blocking;

    const player = playerData.get(message.id);
    if (player) player.blocking = message.blocking;
  });

  network.on("fire", (message) => {
    const info = WEAPON_INFO[message.weapon] || WEAPON_INFO.rifle;
    const remote = remotePlayers.get(message.id);

    if (remote) {
      remote.triggerFire();
      audio.playWeapon(message.weapon);
      const heavy = message.weapon === "shotgun" || message.weapon === "railgun";
      effects.spawnMuzzle(message.origin, info.color, heavy ? 1.6 : message.weapon === "lmg" ? 1.25 : 1);
    }

    for (const impact of message.impacts || []) {
      effects.spawnTracer(message.origin, impact, info.color, message.weapon === "shotgun" ? 1.25 : 1);
      effects.spawnImpact(
        impact,
        info.color,
        message.weapon === "shotgun" ? 3 : 5,
        message.weapon === "railgun" ? 5.2 : message.weapon === "marksman" ? 4.4 : 3.2
      );
    }
  });

  network.on("melee", (message) => {
    const remote = remotePlayers.get(message.id);

    if (remote) {
      remote.triggerSwing(message.combo);
      audio.playWeapon("sword");
    }
  });

  network.on("hit_confirm", (message) => {
    showHit(message.headshot);
    audio.playHit(message.headshot);

    if (message.killed) {
      showKillBanner(message.headshot ? "HEADSHOT ELIMINATION" : "ELIMINATION");
      audio.playKill();
    }
  });

  network.on("damaged", (message) => {
    setHealthArmor(message.health, message.armor);
    audio.playDamage();

    if (message.armorAmount > message.amount) {
      showAnimated($("armorOverlay"), 340);
    } else {
      showAnimated($("damageOverlay"), 500);
    }
  });

  network.on("vitals", (message) => {
    setHealthArmor(message.health, message.armor);
  });

  network.on("ability", (message) => {
    const position = { x: message.x, y: message.y, z: message.z };
    effects.spawnDash(position, message.direction || { x: 0, z: -1 });

    if (message.id === local.id) {
      local.powers.dashReadyAt = message.dashReadyAt;
    } else {
      const remote = remotePlayers.get(message.id);
      if (remote) remote.triggerFire();
    }
  });

  network.on("grapple_start", (message) => {
    createGrappleLine(message.id, message.target, message.endsAt);
    if (message.id === local.id) {
      local.grapple = { target: message.target, endsAt: message.endsAt };
      local.grappleReadyAt = message.readyAt;
      showCombatText("GRAPPLE ATTACHED");
      audio.playDash();
    }
  });

  network.on("grapple_end", (message) => {
    removeGrappleLine(message.id);
    if (message.id === local.id) local.grapple = null;
  });

  network.on("grapple_miss", () => {
    showCombatText("NO GRAPPLE SURFACE");
  });

  network.on("ability_denied", (message) => {
    if (message.ability === "grapple") local.grappleReadyAt = Number(message.readyAt || local.grappleReadyAt);
  });

  network.on("killcam", (message) => {
    startKillCam(message);
  });

  network.on("parry", (message) => {
    audio.playParry();

    if (message.defenderId === local.id) {
      showCombatText("PERFECT PARRY");
    } else if (message.attackerId === local.id) {
      showCombatText("PARRIED");
    }

    effects.spawnImpact(
      {
        x: local.x,
        y: local.y + 1.3,
        z: local.z
      },
      0xb8ecff,
      14,
      4
    );
  });

  network.on("kill", (message) => {
    applyPlayerData(message.killer);
    applyPlayerData(message.victim);
    setRound(message.round);
    addKillFeed(message);

    if (message.victim.id === local.id) {
      local.alive = false;
      if (!killCam.active) setDeathState(true, message.killer.name);
    }

    if (message.killer.id === local.id) {
      showKillBanner(message.headshot ? "HEADSHOT ELIMINATION" : "ELIMINATION");
    }

    updateScoreboard();
  });

  network.on("assist", () => {
    showCombatText("ASSIST");
  });

  network.on("respawn", (message) => {
    applyPlayerData(message.player);

    if (message.player.id === local.id) {
      local.x = message.player.x;
      local.y = message.player.y;
      local.z = message.player.z;
      local.vx = 0;
      local.vy = 0;
      local.vz = 0;
      local.yaw = message.player.yaw;
      local.pitch = message.player.pitch;
      local.alive = true;
      local.weapon = message.player.weapon;
      local.owned = new Set(message.player.owned || []);
      local.ammo = message.ammo || local.ammo;
      local.reloading = false;
      local.blocking = false;
      local.powers = { ...local.powers, ...(message.player.powers || {}) };
      local.dashUntil = 0;
      local.grapple = null;
      local.grappleReadyAt = Number(message.player.powers?.grappleReadyAt || 0);
      removeGrappleLine(local.id);
      if (killCam.active) finishKillCam(false);
      local.correction.set(0, 0, 0);
      firstPersonWeapon.setWeapon(local.weapon);
      firstPersonWeapon.setReloading(false);
      firstPersonWeapon.setBlocking(false);
      setHealthArmor(message.player.health, message.player.armor);
      setDeathState(false);
      updateWeaponHud();

      if (pointerStarted) {
        document.body.requestPointerLock();
      }
    }
  });

  network.on("pickup_state", (message) => {
    pickupRenderer.setActive(message.pickup.id, message.pickup.active);
  });

  network.on("pickup_collected", (message) => {
    pickupRenderer.setActive(message.pickup.id, false);
    local.owned = new Set(message.player.owned || Array.from(local.owned));
    local.weapon = message.player.weapon;
    local.ammo = message.ammo || local.ammo;
    local.health = message.player.health;
    local.armor = message.player.armor;
    local.powers = { ...local.powers, ...(message.player.powers || {}) };
    firstPersonWeapon.setWeapon(local.weapon);
    setHealthArmor(local.health, local.armor);
    updateWeaponHud();

    const pickup = message.pickup;
    const text = pickup.type === "weapon"
      ? `${WEAPON_INFO[pickup.weapon]?.name || pickup.weapon} acquired`
      : pickup.type === "power"
        ? `${powerName(pickup.power)} activated`
        : `${pickup.type.toUpperCase()} PICKUP`;

    showPickup(text);
    if (pickup.type === "power") {
      const info = POWER_INFO[pickup.power];
      effects.spawnPowerBurst({ x: local.x, y: local.y, z: local.z }, info?.color || 0xffffff);
      audio.playPower(pickup.power);
    } else {
      audio.playPickup();
    }
    updatePowerHud();
  });

  network.on("round_end", (message) => {
    setRound(message.round);
  });

  network.on("round_start", (message) => {
    setRound(message.round);
    pickupRenderer.setPickups(message.pickups || []);
    $("roundEnd").classList.add("hidden");
  });
}

setupNetworkHandlers();
network.connect();

function syncSettingsFromMenu() {
  updateFov($("fovInput").value);
  updateSensitivity($("sensitivityInput").value);
  updateVolume($("volumeInput").value);
  applyQuality($("qualitySelect").value);
  setCameraMode($("cameraSelect").value, false);

  $("pauseQuality").value = settings.quality;
  $("pauseFov").value = settings.fov;
  $("pauseSensitivity").value = settings.sensitivity;
  $("pauseVolume").value = settings.volume;
  $("pauseCamera").value = settings.cameraMode;
}

$("playButton").addEventListener("click", () => {
  syncSettingsFromMenu();

  const name = $("nameInput").value.trim() || "EC2 Fighter";
  localStorage.setItem("voxelCombatName", name);
  network.send("hello", { name });
  $("bootScreen").classList.add("hidden");
  pointerStarted = true;
  pausedByMenu = false;
  audio.ensure();
  document.body.requestPointerLock();
});

$("resumeButton").addEventListener("click", () => {
  pausedByMenu = false;
  $("pauseMenu").classList.add("hidden");
  document.body.requestPointerLock();
});

$("qualitySelect").addEventListener("change", (event) => applyQuality(event.target.value));
$("pauseQuality").addEventListener("change", (event) => {
  applyQuality(event.target.value);
  $("qualitySelect").value = event.target.value;
});

$("cameraSelect").addEventListener("change", (event) => {
  setCameraMode(event.target.value, false);
});
$("pauseCamera").addEventListener("change", (event) => {
  setCameraMode(event.target.value, false);
  $("cameraSelect").value = event.target.value;
});

$("fovInput").addEventListener("input", (event) => updateFov(event.target.value));
$("pauseFov").addEventListener("input", (event) => {
  updateFov(event.target.value);
  $("fovInput").value = event.target.value;
});

$("sensitivityInput").addEventListener("input", (event) => updateSensitivity(event.target.value));
$("pauseSensitivity").addEventListener("input", (event) => {
  updateSensitivity(event.target.value);
  $("sensitivityInput").value = event.target.value;
});

$("volumeInput").addEventListener("input", (event) => updateVolume(event.target.value));
$("pauseVolume").addEventListener("input", (event) => {
  updateVolume(event.target.value);
  $("volumeInput").value = event.target.value;
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === document.body;

  if (!locked && pointerStarted && local.alive && document.activeElement !== $("chatInput")) {
    pausedByMenu = true;
    $("pauseMenu").classList.remove("hidden");
  } else if (locked) {
    pausedByMenu = false;
    $("pauseMenu").classList.add("hidden");
  }
});

function handleKey(code, active) {
  if (code === "KeyW") local.input.forward = active;
  if (code === "KeyS") local.input.backward = active;
  if (code === "KeyA") local.input.left = active;
  if (code === "KeyD") local.input.right = active;
  if (code === "Space") local.input.jump = active;
  if (code === "ShiftLeft" || code === "ShiftRight") local.input.sprint = active;
  if (code === "KeyC" || code === "ControlLeft") local.input.crouch = active;
}

document.addEventListener("keydown", (event) => {
  if (document.activeElement === $("chatInput")) {
    if (event.code === "Enter") {
      const text = $("chatInput").value.trim();

      if (text) {
        network.send("chat", { text });
      }

      $("chatInput").value = "";
      $("chatInput").blur();

      if (local.alive) {
        document.body.requestPointerLock();
      }
    }

    return;
  }

  if (killCam.active && ["KeyF", "Space", "Escape"].includes(event.code)) {
    event.preventDefault();
    finishKillCam(true);
    return;
  }

  keys[event.code] = true;
  handleKey(event.code, true);

  if (event.code === "KeyR") {
    reloadWeapon();
  }

  if (event.code === "KeyQ" && !event.repeat) {
    useDash();
  }

  if (event.code === "KeyE" && !event.repeat) {
    useGrapple();
  }

  if (event.code === "Space" && !event.repeat) {
    local.jumpPressedAt = performance.now();
  }

  if (event.code === "KeyV" && !event.repeat) {
    toggleCameraMode();
  }

  if (event.code === "Enter") {
    document.exitPointerLock();
    $("pauseMenu").classList.add("hidden");
    $("chatInput").focus();
  }

  if (event.code === "Tab") {
    event.preventDefault();
    $("scoreboard").classList.remove("hidden");
  }

  const number = Number(event.code.replace("Digit", ""));

  if (number >= 1 && number <= 9) {
    switchWeapon(WEAPON_ORDER[number - 1]);
  } else if (event.code === "Digit0") {
    switchWeapon("voidblade");
  }
});

document.addEventListener("keyup", (event) => {
  keys[event.code] = false;
  handleKey(event.code, false);

  if (event.code === "Tab") {
    $("scoreboard").classList.add("hidden");
  }
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== document.body || !local.alive) return;

  const multiplier = 0.00165 * settings.sensitivity;
  local.yaw -= event.movementX * multiplier;
  local.pitch -= event.movementY * multiplier;
  local.pitch = THREE.MathUtils.clamp(local.pitch, -1.42, 1.42);
  firstPersonWeapon.addSway(event.movementX, event.movementY);
});

document.addEventListener("mousedown", (event) => {
  if (killCam.active) {
    finishKillCam(true);
    return;
  }
  if (document.pointerLockElement !== document.body) {
    if (local.alive && pointerStarted) document.body.requestPointerLock();
    return;
  }

  if (event.button === 0) {
    leftMouseDown = true;
    attemptAttack();
  }

  if (event.button === 2) {
    setBlockOrAim(true);
  }
});

document.addEventListener("mouseup", (event) => {
  if (event.button === 0) leftMouseDown = false;
  if (event.button === 2) setBlockOrAim(false);
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("blur", () => {
  leftMouseDown = false;
  rightMouseDown = false;
  setBlockOrAim(false);

  for (const key of Object.keys(keys)) keys[key] = false;
  Object.assign(local.input, {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false
  });
});

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function updateGraphicsScaling(now) {
  fpsFrames++;

  if (now - fpsWindowStart < 1000) return;

  fpsValue = Math.round(fpsFrames * 1000 / (now - fpsWindowStart));
  fpsFrames = 0;
  fpsWindowStart = now;
  $("fpsText").textContent = String(fpsValue);

  if (fpsValue < 42) {
    resolutionScale = Math.max(0.58, resolutionScale - 0.08);
    highFpsSeconds = 0;
    updateRendererResolution();
  } else if (fpsValue > 58) {
    highFpsSeconds++;

    if (highFpsSeconds >= 3) {
      resolutionScale = Math.min(1, resolutionScale + 0.05);
      highFpsSeconds = 0;
      updateRendererResolution();
    }
  } else {
    highFpsSeconds = 0;
  }
}

function updateCrosshair() {
  const speed = Math.hypot(local.vx, local.vz);
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  const serverInfo = serverWeapons[local.weapon] || {};
  const aiming = rightMouseDown && info.kind === "gun";
  let spread = aiming ? Number(serverInfo.adsSpread || 0.003) : Number(serverInfo.hipSpread || 0.015);
  spread += Math.min(1, speed / MOVEMENT.sprintSpeed) * Number(serverInfo.moveSpread || 0.01);
  if (!local.grounded) spread += Number(serverInfo.airSpread || 0.02);
  if (local.input.crouch && local.grounded) spread *= 0.68;
  spread += clientBloom;
  const gap = aiming ? 3 : 6 + Math.min(18, spread * 420);
  $("crosshair").style.setProperty("--gap", `${gap}px`);
  $("crosshair").style.opacity = local.blocking ? "0.45" : aiming ? "0.15" : "1";
}

function updateCameraFov(dt) {
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  const aiming = rightMouseDown && info.kind === "gun" && local.alive && !killCam.active;
  const sprinting = local.input.sprint && Math.hypot(local.vx, local.vz) > 4 && !aiming;
  let targetFov = settings.fov;

  if (aiming) targetFov = info.fov;
  else if (performance.now() < local.dashUntil) targetFov = settings.fov + 13;
  else if (sprinting) targetFov = settings.fov + (activeLocalPower("speed") ? 10 : 7);

  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * (aiming ? 14 : 10)));
  camera.updateProjectionMatrix();
  firstPersonWeapon.setAim(aiming);

  const scope = $("scopeOverlay");
  const scopeType = info.scope || "none";
  const showScope = aiming && settings.cameraMode === "first" && scopeType !== "none";
  scope.classList.toggle("hidden", !showScope);
  scope.classList.toggle("active", showScope);
  document.body.classList.toggle("ads-active", showScope);
  for (const name of ["holo", "optic", "sniper", "rail"]) {
    document.body.classList.toggle(`scope-${name}`, showScope && scopeType === name);
  }
  const zoom = Math.max(1, settings.fov / Math.max(1, info.fov));
  $("scopeLabel").textContent = `${zoom.toFixed(1)}× · ${info.name}`;
}

function updateRemotePlayers(now, dt) {
  for (const remote of remotePlayers.values()) {
    remote.render(now, dt);
  }
}

function updateLocalAvatar(now, dt) {
  if (!localAvatar) return;

  localAvatar.renderLocal({
    ...local,
    sliding: performance.now() < local.slideUntil,
    crouching: local.input.crouch,
    reloading: local.reloading,
    blocking: local.blocking
  }, now, dt, settings.cameraMode === "third");
}

function updateDeathCountdown(now) {
  if (local.alive || $("deathScreen").classList.contains("hidden")) return;

  const seconds = Math.max(0, 3 - Math.floor((now - deathAt) / 1000));
  $("respawnText").textContent = `Respawning in ${seconds}...`;
}

function updateDayNight(time) {
  const cycle = (time * 0.000018) % 1;
  const angle = cycle * Math.PI * 2;
  const height = 34 + Math.sin(angle) * 28;

  sun.position.set(
    Math.cos(angle) * 58,
    height,
    Math.sin(angle) * 48
  );

  const daylight = THREE.MathUtils.clamp((height - 6) / 48, 0.35, 1);
  sun.intensity = 1.2 + daylight * 1.15;
  hemisphere.intensity = 0.7 + daylight * 0.55;
  renderer.toneMappingExposure = 0.88 + daylight * 0.22;

  sky.material.uniforms.topColor.value.setHSL(0.58, 0.55, 0.24 + daylight * 0.16);
  sky.material.uniforms.bottomColor.value.setHSL(0.55, 0.72, 0.52 + daylight * 0.22);
  scene.fog.color.copy(sky.material.uniforms.bottomColor.value);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  const playingKillCam = updateKillCam(now, dt);
  movementAccumulator = Math.min(0.2, movementAccumulator + dt);
  let movementSteps = 0;
  while (!playingKillCam && movementAccumulator >= MOVEMENT_STEP && movementSteps < 6) {
    simulateLocalMovement(MOVEMENT_STEP);
    movementAccumulator -= MOVEMENT_STEP;
    movementSteps++;
  }
  if (playingKillCam) movementAccumulator = 0;
  clientBloom = Math.max(0, clientBloom - Number(serverWeapons[local.weapon]?.bloomRecovery || 0.03) * dt);
  sendInput(now);
  updateAutomaticFire();
  updateRemotePlayers(now, dt);
  updateLocalAvatar(now, dt);
  effects.update(dt);
  pickupRenderer.update(now / 1000);
  updateMatchClock();
  updateRadar();
  updateCrosshair();
  updatePowerHud();
  updateGrappleHud();
  updateGrappleLines();
  for (const anchor of world.grappleAnchors || []) {
    anchor.userData.ringA.rotation.z += dt * 1.4;
    anchor.userData.ringB.rotation.z -= dt * 1.1;
    anchor.rotation.y += dt * 0.35;
  }
  if (!playingKillCam) updateCameraFov(dt);
  updateDeathCountdown(now);
  updateDayNight(now);

  const speed = Math.hypot(local.vx, local.vz);
  if (!playingKillCam) {
    firstPersonWeapon.update(
      dt,
      speed,
      local.grounded,
      rightMouseDown && WEAPON_INFO[local.weapon]?.kind === "gun"
    );
  }

  if (local.reloading && localReloadEndsAt && now >= localReloadEndsAt) {
    local.reloading = false;
    firstPersonWeapon.setReloading(false);
    updateWeaponHud();
  }

  updateGraphicsScaling(now);
  renderer.render(scene, camera);
}

buildWeaponSlots();
setHealthArmor(100, 25);
updateRendererResolution();
setCameraMode(settings.cameraMode, false);
updateGrappleHud();
animate();
