import * as THREE from "/vendor/three.module.js";
import {
  QUALITY_PRESETS,
  WEAPON_INFO,
  WEAPON_ORDER,
  POWER_INFO,
  ABILITY_INFO,
  MOVEMENT,
  RECOIL_PATTERNS,
  GAME_MODES,
  WEAPON_SKINS,
  CHARACTER_ARCHETYPES,
  OBJECTIVE_POINTS
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
import { InputBindings, GamepadController, ProgressionStore, DamageDirectionSystem, DEFAULT_KEYBINDS, normalizeAngle } from "./systems.js";
import { AssetPipeline } from "./assets.js";

const $ = (id) => document.getElementById(id);
const SCOPE_OVERLAY_TYPES = new Set(["sniper", "rail"]);
const FULLSCREEN_SCOPE_WEAPONS = new Set(["marksman", "railgun"]);

const savedSettings = JSON.parse(localStorage.getItem("voxelCombatSettings") || "{}");
const settings = {
  quality: QUALITY_PRESETS[savedSettings.quality] ? savedSettings.quality : "medium",
  fov: Number(savedSettings.fov || 78),
  sensitivity: Number(savedSettings.sensitivity || 1),
  volume: Number(savedSettings.volume ?? 0.45),
  cameraMode: savedSettings.cameraMode === "third" ? "third" : "first",
  adsMode: savedSettings.adsMode === "toggle" ? "toggle" : "hold",
  controller: savedSettings.controller !== false,
  reducedMotion: Boolean(savedSettings.reducedMotion),
  colorblind: ["deuteranopia", "protanopia", "tritanopia"].includes(savedSettings.colorblind) ? savedSettings.colorblind : "none",
  crosshair: ["precision", "dot"].includes(savedSettings.crosshair) ? savedSettings.crosshair : "dynamic",
  keybinds: savedSettings.keybinds || {},
  modePreference: GAME_MODES[savedSettings.modePreference] ? savedSettings.modePreference : "tdm",
  roomCode: String(savedSettings.roomCode || ""),
  archetype: CHARACTER_ARCHETYPES[savedSettings.archetype] ? savedSettings.archetype : "assault"
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
$("adsModeSelect").value = settings.adsMode;
$("pauseAdsMode").value = settings.adsMode;
$("controllerInput").checked = settings.controller;
$("pauseController").checked = settings.controller;
$("reducedMotionInput").checked = settings.reducedMotion;
$("pauseReducedMotion").checked = settings.reducedMotion;
$("colorblindSelect").value = settings.colorblind;
$("pauseColorblind").value = settings.colorblind;
$("crosshairSelect").value = settings.crosshair;
$("modeSelect").value = settings.modePreference;
$("roomCodeInput").value = settings.roomCode;
$("archetypeSelect").value = settings.archetype;
$("pauseArchetype").value = settings.archetype;

const quality = { ...QUALITY_PRESETS[settings.quality] };

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9ccff0, 28, quality.viewDistance);

const camera = new THREE.PerspectiveCamera(
  settings.fov,
  innerWidth / innerHeight,
  0.015,
  250
);
camera.rotation.order = "YXZ";
// Camera children are only traversed by Three.js when the camera is part of the scene.
// The dedicated first-person viewmodel is attached below this camera.
scene.add(camera);

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
renderer.domElement.id = "gameCanvas";
renderer.domElement.tabIndex = 0;
document.body.appendChild(renderer.domElement);

const pointerLockTarget = renderer.domElement;
function isGamePointerLocked() {
  return document.pointerLockElement === pointerLockTarget;
}
function setMouseLookHint(visible, text = "Click the game to enable mouse look · Esc releases the cursor") {
  const hint = $("mouseLookHint");
  if (!hint) return;
  hint.textContent = text;
  hint.classList.toggle("hidden", !visible);
}
function requestGamePointerLock() {
  if (!pointerLockTarget.requestPointerLock) {
    setMouseLookHint(true, "Pointer lock is unavailable in this browser");
    return false;
  }
  try {
    pointerLockTarget.focus({ preventScroll: true });
    const request = pointerLockTarget.requestPointerLock();
    if (request && typeof request.catch === "function") {
      request.catch(() => setMouseLookHint(true));
    }
    return true;
  } catch {
    setMouseLookHint(true);
    return false;
  }
}

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
const assetPipeline = new AssetPipeline();
assetPipeline.addEnvironment(scene, quality).catch(() => null);

const objectiveMarker = new THREE.Group();
const objectiveRing = new THREE.Mesh(
  new THREE.TorusGeometry(5.75, 0.08, 10, 72),
  new THREE.MeshBasicMaterial({ color: 0xffd46a, transparent: true, opacity: 0.72, depthWrite: false })
);
objectiveRing.rotation.x = Math.PI / 2;
const objectiveBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.18, 10, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd46a, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
);
objectiveBeam.position.y = 5;
objectiveMarker.add(objectiveRing, objectiveBeam);
objectiveMarker.visible = false;
scene.add(objectiveMarker);
const pickupRenderer = new PickupRenderer(scene, quality);
const effects = new EffectsSystem(scene, quality.particles, quality);
const audio = new AudioSystem();
audio.setVolume(settings.volume);

const network = new NetworkClient();
const inputBindings = new InputBindings(settings.keybinds);
const gamepad = new GamepadController();
gamepad.enabled = settings.controller;
const progression = new ProgressionStore();
const damageDirection = new DamageDirectionSystem($("damageDirection"));
let pendingRebindAction = null;
const clock = new THREE.Clock();
const firstPersonWeapon = new FirstPersonWeapon(camera);
const presentationWeapons = ["pistol", "rifle", "shotgun", "marksman", "sword", "voidblade"];
Promise.all(presentationWeapons.map((name) => assetPipeline.weapon(name)))
  .then((models) => {
    models.forEach((model, index) => {
      if (model) firstPersonWeapon.installAuthoredModel(presentationWeapons[index], model);
    });
  })
  .catch(() => null);
let localAvatar = null;
const thirdPersonRaycaster = new THREE.Raycaster();
const grappleRaycaster = new THREE.Raycaster();
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
  stamina: 100,
  skin: progression.data.selectedSkin || "standard",
  archetype: settings.archetype,
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
    crouch: false,
    steady: false
  },
  previousJump: false,
  previousCrouch: false
};

const remotePlayers = new Map();
const playerData = new Map();
const rosterData = new Map();
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
let recoilYaw = 0;
let recoilShotIndex = 0;
let lastLocalShotAt = 0;
let localShotId = 0;
let lastDryFireAt = 0;
let adsAmount = 0;
let adsToggled = false;
let opticZoomIndex = 0;
let aimPunchPitch = 0;
let aimPunchYaw = 0;
let pendingGrapple = null;
let spectatorTargetId = null;
let spectatorActive = false;
let lastGamepadFire = false;
let lastGamepadAim = false;
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
  settings.keybinds = inputBindings.serialize();
  settings.modePreference = $("modeSelect")?.value || settings.modePreference;
  settings.roomCode = $("roomCodeInput")?.value || "";
  localStorage.setItem("voxelCombatSettings", JSON.stringify(settings));
}

function applyAccessibility() {
  document.body.classList.toggle("reduced-motion", settings.reducedMotion);
  $("postFx").classList.toggle("disabled", !quality.postFx || settings.reducedMotion);
  for (const mode of ["deuteranopia", "protanopia", "tritanopia"]) document.body.classList.toggle(`color-${mode}`, settings.colorblind === mode);
  document.body.classList.toggle("crosshair-dot", settings.crosshair === "dot");
  document.body.classList.toggle("crosshair-precision", settings.crosshair === "precision");
  gamepad.enabled = settings.controller;
}

function updateProgressionHud(message = "") {
  const data = progression.data;
  $("levelText").textContent = `LEVEL ${data.level}`;
  const required = progression.xpForLevel(data.level);
  $("xpBar").style.width = `${Math.min(100, data.xp / required * 100)}%`;
  const active = Object.values(data.challenges).find((challenge) => !challenge.complete);
  $("challengeText").textContent = message || (active ? `${active.label} · ${active.current}/${active.target}` : "All current challenges complete");
  const skinSelect = $("skinSelect");
  for (const option of skinSelect.options) option.disabled = !data.unlockedSkins.includes(option.value);
  skinSelect.value = data.unlockedSkins.includes(data.selectedSkin) ? data.selectedSkin : "standard";
}

function awardProgress(stat, amount, xp, label = "") {
  const result = progression.record(stat, amount);
  const leveled = progression.addXp(xp);
  if (leveled) showCombatText(`LEVEL ${progression.data.level} REACHED`);
  for (const challenge of result.completed) showCombatText(`CHALLENGE COMPLETE · +${challenge.reward} XP`);
  updateProgressionHud(label);
}

function buildKeybindGrid() {
  const grid = $("keybindGrid");
  grid.replaceChildren();
  const labels = { forward:"Forward", backward:"Backward", left:"Strafe left", right:"Strafe right", jump:"Jump / mantle", sprint:"Sprint / steady", crouch:"Crouch / slide", grapple:"Grapple", dash:"Dash", reload:"Reload", camera:"Camera", interact:"Spectator target" };
  for (const action of Object.keys(labels)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "keybind-button";
    button.dataset.action = action;
    button.innerHTML = `${labels[action]} <strong>${inputBindings.bindings[action]}</strong>`;
    button.addEventListener("click", () => {
      pendingRebindAction = action;
      for (const item of grid.children) item.classList.remove("listening");
      button.classList.add("listening");
      button.querySelector("strong").textContent = "PRESS KEY";
    });
    grid.appendChild(button);
  }
}

function updateStaminaHud() {
  const stamina = Math.max(0, Math.min(100, Number(local.stamina ?? 100)));
  $("staminaBar").style.width = `${stamina}%`;
  $("staminaText").textContent = String(Math.round(stamina));
  $("staminaHud").classList.toggle("depleted", stamina < 15);
}

function updateObjectiveHud(round = roundState) {
  const hud = $("objectiveHud");
  const objective = round?.objective;
  const active = round?.mode === "koth" && objective;
  hud.classList.toggle("hidden", !active);
  if (!active) return;
  $("objectiveName").textContent = objective.label || objective.id || "OBJECTIVE";
  const state = objective.capturing ? `${objective.capturing.toUpperCase()} CAPTURING` : objective.owner ? `${objective.owner.toUpperCase()} CONTROL` : "NEUTRAL";
  $("objectiveState").textContent = state;
  $("objectiveProgress").style.width = `${Math.max(0, Math.min(100, objective.progress || 0))}%`;
  hud.classList.toggle("red-owned", objective.owner === "red");
  hud.classList.toggle("blue-owned", objective.owner === "blue");
}

function updateObjectiveMarker(now) {
  const objective = roundState?.objective;
  objectiveMarker.visible = roundState?.mode === "koth" && roundState.status === "playing" && Boolean(objective);
  if (!objectiveMarker.visible) return;
  objectiveMarker.position.set(objective.x || 0, (objective.y || 0) + 0.08, objective.z || 0);
  const color = objective.owner === "red" ? 0xff5968 : objective.owner === "blue" ? 0x5aa9ff : 0xffd46a;
  objectiveRing.material.color.setHex(color);
  objectiveBeam.material.color.setHex(color);
  objectiveRing.rotation.z = now * 0.00035;
  const pulse = 1 + Math.sin(now * 0.004) * 0.035;
  objectiveRing.scale.setScalar(pulse);
  objectiveBeam.material.opacity = 0.14 + Math.sin(now * 0.003) * 0.06;
}

function cycleSpectatorTarget() {
  const candidates = Array.from(playerData.values()).filter((player) => player.id !== local.id && player.alive);
  if (!candidates.length) { spectatorTargetId = null; return; }
  const index = Math.max(-1, candidates.findIndex((player) => player.id === spectatorTargetId));
  spectatorTargetId = candidates[(index + 1) % candidates.length].id;
  $("spectatorName").textContent = candidates[(index + 1) % candidates.length].name;
}

function updateSpectatorCamera() {
  spectatorActive = !local.alive && !killCam.active;
  $("spectatorHud").classList.toggle("hidden", !spectatorActive);
  if (!spectatorActive) return false;
  let target = spectatorTargetId ? playerData.get(spectatorTargetId) : null;
  if (!target?.alive) { cycleSpectatorTarget(); target = spectatorTargetId ? playerData.get(spectatorTargetId) : null; }
  if (!target) return false;
  $("spectatorName").textContent = target.name;
  const back = new THREE.Vector3(Math.sin(target.yaw) * 5.5, 2.6, Math.cos(target.yaw) * 5.5);
  const desired = new THREE.Vector3(target.x, target.y + 1.3, target.z).add(back);
  camera.position.lerp(desired, 0.16);
  camera.lookAt(target.x, target.y + 1.2, target.z);
  return true;
}

function cycleWeapon(direction = 1) {
  const owned = WEAPON_ORDER.filter((weapon) => local.owned.has(weapon));
  if (!owned.length) return;
  const index = Math.max(0, owned.indexOf(local.weapon));
  switchWeapon(owned[(index + direction + owned.length) % owned.length]);
}

function currentAimActive() {
  return settings.adsMode === "toggle" ? adsToggled : rightMouseDown;
}

function updateWeaponObstruction() {
  if (!local.alive || settings.cameraMode !== "first") { firstPersonWeapon.setObstruction(0); return; }
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const origin = camera.position.clone();
  grappleRaycaster.set(origin, direction);
  grappleRaycaster.far = 1.45;
  const hits = grappleRaycaster.intersectObjects(world.collisionMeshes || [], true);
  const amount = hits.length ? THREE.MathUtils.clamp(1 - hits[0].distance / 1.4, 0, 1) : 0;
  firstPersonWeapon.setObstruction(amount);
  if (amount > 0.72 && currentAimActive()) { adsToggled = false; rightMouseDown = false; }
}

function setCameraMode(mode, announce = true) {
  settings.cameraMode = mode === "third" ? "third" : "first";
  $("cameraSelect").value = settings.cameraMode;
  $("pauseCamera").value = settings.cameraMode;
  $("pauseAdsMode").value = settings.adsMode;
  $("pauseController").checked = settings.controller;
  $("pauseReducedMotion").checked = settings.reducedMotion;
  $("pauseColorblind").value = settings.colorblind;
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
  $("postFx").classList.toggle("disabled", !quality.postFx || settings.reducedMotion);
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
  const active = Boolean(local.grapple);
  hud.classList.toggle("cooldown", remaining > 0 && !active);
  hud.classList.toggle("active", active);

  let meter = 1;
  if (active) {
    const target = local.grapple.target;
    const distance = Math.hypot(target.x - local.x, target.y - (local.y + 1.1), target.z - local.z);
    const ropeLength = Math.max(0.01, Number(local.grapple.ropeLength || distance));
    const tension = Math.max(0, distance - ropeLength);
    meter = Math.min(1, 0.22 + tension / 6);
    $("grappleState").textContent = tension > 2.2 ? "HIGH TENSION · E RELEASE" : "SWINGING · E RELEASE";
  } else if (pendingGrapple) {
    meter = 0.35;
    $("grappleState").textContent = "HOOK FIRED";
  } else if (remaining > 0) {
    meter = 1 - Math.min(1, remaining / Math.max(1, ABILITY_INFO.grapple.cooldown));
    $("grappleState").textContent = `${(remaining / 1000).toFixed(1)}s`;
  } else {
    $("grappleState").textContent = "READY";
  }

  $("grappleMeter").style.transform = `scaleX(${Math.max(0.03, meter)})`;
}

function createGrappleLine(id, target, endsAt, ropeLength = 0) {
  removeGrappleLine(id);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(9 * 3), 3));
  const line = new THREE.Line(geometry, grappleMaterial.clone());
  line.frustumCulled = false;
  line.userData.target = new THREE.Vector3(target.x, target.y, target.z);
  line.userData.endsAt = endsAt;
  line.userData.ropeLength = ropeLength;
  line.userData.createdAt = performance.now();
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
      if (id === local.id && !pendingGrapple) local.grapple = null;
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

    const target = line.userData.target;
    const distance = start.distanceTo(target);
    const ropeLength = Number(line.userData.ropeLength || distance);
    const slack = Math.max(0, ropeLength - distance);
    const tension = Math.max(0, distance - ropeLength);
    const positions = line.geometry.attributes.position.array;
    const time = performance.now() * 0.012;

    for (let segment = 0; segment < 9; segment++) {
      const t = segment / 8;
      const index = segment * 3;
      const sag = Math.sin(t * Math.PI) * Math.min(0.65, slack * 0.16 + 0.04);
      const vibration = Math.sin(time + t * 18) * Math.sin(t * Math.PI) * Math.min(0.055, tension * 0.012);
      positions[index] = THREE.MathUtils.lerp(start.x, target.x, t) + vibration;
      positions[index + 1] = THREE.MathUtils.lerp(start.y, target.y, t) - sag;
      positions[index + 2] = THREE.MathUtils.lerp(start.z, target.z, t) - vibration;
    }

    line.geometry.attributes.position.needsUpdate = true;
    line.material.opacity = 0.68 + Math.min(0.25, tension * 0.06) + Math.sin(performance.now() * 0.025) * 0.08;
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

function showHit(headshot = false, damage = 0, armorDamage = 0) {
  showAnimated($("hitMarker"), 230);

  const totalDamage = Math.max(0, Math.round(Number(damage || 0) + Number(armorDamage || 0)));
  if (totalDamage > 0) {
    $("damageNumber").textContent = headshot ? `${totalDamage} CRIT` : String(totalDamage);
    $("damageNumber").classList.toggle("critical", headshot);
    showAnimated($("damageNumber"), 520);
  }

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
  const players = Array.from(rosterData.values());

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

function resetNetworkPlayerState() {
  for (const remote of remotePlayers.values()) remote.dispose();
  remotePlayers.clear();
  playerData.clear();
  rosterData.clear();
  updateScoreboard();
}

function syncRoster(roster = []) {
  const activeIds = new Set();

  for (const player of roster) {
    if (!player || typeof player.id !== "string") continue;
    activeIds.add(player.id);
    rosterData.set(player.id, {
      ...(rosterData.get(player.id) || {}),
      ...player
    });
  }

  for (const id of Array.from(rosterData.keys())) {
    if (!activeIds.has(id)) rosterData.delete(id);
  }

  for (const id of Array.from(remotePlayers.keys())) {
    if (!activeIds.has(id)) removeRemotePlayer(id, false);
  }

  for (const id of Array.from(playerData.keys())) {
    if (id !== local.id && !activeIds.has(id)) playerData.delete(id);
  }

  updateScoreboard();
}

function applyPlayerData(player, sampleTime = performance.now()) {
  playerData.set(player.id, {
    ...(playerData.get(player.id) || {}),
    ...player
  });
  rosterData.set(player.id, {
    ...(rosterData.get(player.id) || {}),
    id: player.id,
    name: player.name,
    team: player.team,
    kills: player.kills,
    deaths: player.deaths,
    assists: player.assists,
    roundScore: player.roundScore || 0,
    alive: player.alive,
    isBot: Boolean(player.isBot)
  });

  if (player.id === local.id) {
    local.name = player.name;
    local.team = player.team;
    local.health = player.health;
    local.armor = player.armor;
    local.stamina = Number(player.stamina ?? local.stamina);
    local.skin = player.skin || local.skin;
    local.archetype = CHARACTER_ARCHETYPES[player.archetype] ? player.archetype : local.archetype;
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
    if (firstPersonWeapon.skinName !== local.skin) firstPersonWeapon.setSkin(local.skin);
    if (localAvatar && localAvatar.archetype !== local.archetype) localAvatar.setArchetype(local.archetype);
    if (firstPersonWeapon.archetype !== local.archetype) firstPersonWeapon.setArchetype(local.archetype);

    setHealthArmor(player.health, player.armor);
    updateStaminaHud();
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

function removeRemotePlayer(id, removeFromRoster = true) {
  const remote = remotePlayers.get(id);

  if (remote) {
    remote.dispose();
    remotePlayers.delete(id);
  }

  playerData.delete(id);
  if (removeFromRoster) rosterData.delete(id);
  updateScoreboard();
}

function setRound(round) {
  if (!round) return;
  roundState = round;
  if (Number.isFinite(round.serverNow)) serverClockOffset = round.serverNow - Date.now();
  $("redScore").textContent = String(Math.floor(round.score?.red || 0));
  $("blueScore").textContent = String(Math.floor(round.score?.blue || 0));
  const labels = { tdm: "TEAM DEATHMATCH", koth: "KING OF THE HILL", ffa: "FREE-FOR-ALL" };
  $("matchMode").textContent = labels[round.mode] || "TEAM DEATHMATCH";
  updateObjectiveHud(round);
  $("voteTdm").textContent = String(round.modeVotes?.tdm || 0);
  $("voteKoth").textContent = String(round.modeVotes?.koth || 0);
  $("voteFfa").textContent = String(round.modeVotes?.ffa || 0);
  $("voteFoundry").textContent = String(round.mapVotes?.foundry || 0);
  $("voteNightfall").textContent = String(round.mapVotes?.nightfall || 0);
  $("voteStorm").textContent = String(round.mapVotes?.storm || 0);

  for (const name of ["foundry", "nightfall", "storm"]) {
    document.body.classList.toggle(`map-${name}`, round.map === name);
  }
  const mapLabel = { foundry: "FOUNDRY", nightfall: "NIGHTFALL", storm: "STORMFRONT" }[round.map] || "FOUNDRY";
  $("matchMode").textContent = `${labels[round.mode] || "TEAM DEATHMATCH"} · ${mapLabel}`;

  const highlights = round.highlights || {};
  $("highlightEliminator").textContent = highlights.eliminator
    ? `Top eliminator — ${highlights.eliminator.name} · ${highlights.eliminator.value}`
    : "Top eliminator —";
  $("highlightDamage").textContent = highlights.damage
    ? `Top damage — ${highlights.damage.name} · ${highlights.damage.value}`
    : "Top damage —";
  $("highlightObjective").textContent = highlights.objective
    ? `Objective leader — ${highlights.objective.name} · ${highlights.objective.value}`
    : "Objective leader —";

  if (round.status === "ended") {
    const winnerPlayer = round.winner && playerData.get(round.winner);
    const winner = winnerPlayer ? winnerPlayer.name : round.winner;
    $("roundWinner").textContent = winner === "draw" ? "DRAW" : round.mode === "ffa" ? `${String(winner || "PLAYER").toUpperCase()} WINS` : `${String(winner).toUpperCase()} TEAM WINS`;
    $("roundWinner").style.color = winner === "red" ? "#ff7380" : winner === "blue" ? "#76b8ff" : "#fff";
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
    $("matchStatus").textContent = roundState.mode === "koth" ? `Hold the objective · first to ${roundState.scoreLimit || 150}` : roundState.mode === "ffa" ? `First fighter to ${roundState.scoreLimit || 30}` : `First team to ${roundState.scoreLimit || 30}`;
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
    const grappleNow = Date.now();
    if (grappleNow >= local.grapple.endsAt) {
      local.grapple = null;
      removeGrappleLine(local.id);
    } else {
      const target = local.grapple.target;
      const dx = target.x - local.x;
      const dy = target.y - (local.y + (local.input.crouch ? 0.9 : 1.15));
      const dz = target.z - local.z;
      const distanceToTarget = Math.hypot(dx, dy, dz) || 1;
      const nx = dx / distanceToTarget;
      const ny = dy / distanceToTarget;
      const nz = dz / distanceToTarget;

      local.grapple.ropeLength = Math.max(
        MOVEMENT.grappleStopDistance,
        Number(local.grapple.ropeLength || distanceToTarget) - MOVEMENT.grappleReelSpeed * dt * (local.input.forward ? 1.3 : 1)
      );

      if (distanceToTarget < MOVEMENT.grappleStopDistance) {
        local.grapple = null;
        removeGrappleLine(local.id);
      } else {
        const stretch = Math.max(0, distanceToTarget - local.grapple.ropeLength);
        const radialVelocity = local.vx * nx + local.vy * ny + local.vz * nz;
        const force = Math.min(86, MOVEMENT.grapplePull + stretch * 22 + Math.max(0, -radialVelocity) * 3.5);
        const pull = force * dt;
        local.vx += nx * pull;
        local.vy += ny * pull;
        local.vz += nz * pull;

        if (stretch > 0.08 && radialVelocity < 0) {
          const correction = Math.min(-radialVelocity, stretch * 10) * 0.34;
          local.vx += nx * correction;
          local.vy += ny * correction;
          local.vz += nz * correction;
        }

        const total = Math.hypot(local.vx, local.vy, local.vz);
        if (total > MOVEMENT.grappleMaxSpeed) {
          const scale = MOVEMENT.grappleMaxSpeed / total;
          local.vx *= scale; local.vy *= scale; local.vz *= scale;
        }
        gravityScale = 0.48;
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

  aimPunchPitch *= Math.exp(-dt * 12);
  aimPunchYaw *= Math.exp(-dt * 14);
  recoilPitch *= Math.exp(-dt * 7.5);
  recoilYaw *= Math.exp(-dt * 9);
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
  recoilPitch *= Math.pow(0.018, dt);
  recoilYaw *= Math.pow(0.012, dt);
}

function updateCameraTransform(dt, eyeHeight, bobX, bobY) {
  const roll = cameraRoll * 0.012;

  if (settings.cameraMode === "first") {
    camera.position.set(
      local.x + bobX,
      local.y + eyeHeight - bobY - landingKick,
      local.z
    );
    camera.rotation.y = local.yaw + recoilYaw + aimPunchYaw;
    camera.rotation.x = local.pitch + recoilPitch + aimPunchPitch;
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
  camera.rotation.y = local.yaw + recoilYaw * 0.55 + aimPunchYaw * 0.35;
  camera.rotation.x = pitch + recoilPitch * 0.55 + aimPunchPitch * 0.35;
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

function predictGrappleTarget() {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  grappleRaycaster.set(camera.position, direction);
  grappleRaycaster.near = 1.8;
  grappleRaycaster.far = MOVEMENT.grappleRange;
  const hit = grappleRaycaster.intersectObjects(world.meshes, false)[0];
  let best = hit ? { point: hit.point.clone(), score: 2.2 } : null;

  for (const anchor of world.grappleAnchors || []) {
    const position = anchor.getWorldPosition(new THREE.Vector3());
    const delta = position.clone().sub(camera.position);
    const distance = delta.length();
    if (distance < 2 || distance > MOVEMENT.grappleRange) continue;
    const dot = direction.dot(delta.normalize());
    if (dot < 0.965) continue;
    const score = dot * 5.5 - distance / MOVEMENT.grappleRange;
    if (!best || score > best.score) best = { point: position, score };
  }

  return best?.point || null;
}

function useGrapple() {
  if (!local.alive || killCam.active) return;
  const now = Date.now();

  if (local.grapple) {
    const speed = Math.hypot(local.vx, local.vy, local.vz);
    if (speed > 4) {
      local.vx *= MOVEMENT.grappleReleaseBoost;
      local.vz *= MOVEMENT.grappleReleaseBoost;
    }
    local.vy += MOVEMENT.grappleReleaseUp;
    local.grapple = null;
    pendingGrapple = null;
    removeGrappleLine(local.id);
    network.send("ability", { ability: "grapple", yaw: local.yaw, pitch: local.pitch });
    showCombatText("MOMENTUM RELEASE");
    return;
  }

  if (now < local.grappleReadyAt) {
    showCombatText(`GRAPPLE ${Math.max(0, (local.grappleReadyAt - now) / 1000).toFixed(1)}s`);
    return;
  }

  const predictedTarget = predictGrappleTarget();
  if (predictedTarget) {
    pendingGrapple = { target: predictedTarget, expiresAt: now + 650 };
    createGrappleLine(local.id, predictedTarget, now + 650, camera.position.distanceTo(predictedTarget));
    showCombatText("HOOK FIRED");
  }

  network.send("ability", { ability: "grapple", yaw: local.yaw, pitch: local.pitch });
}

function sendInput(now) {
  if (!local.id || now - lastInputSent < 33) return;

  inputSequence++;

  network.send("input", {
    seq: inputSequence,
    input: { ...local.input, aiming: currentAimActive() && WEAPON_INFO[local.weapon]?.kind === "gun", steady: local.input.steady },
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
  firstPersonWeapon.setReloading(true, serverInfo.reload);
  network.send("reload");
  audio.playReload();
  updateWeaponHud();
}

function attackSword() {
  const now = performance.now();
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.sword;
  if (now < nextLocalAttackAt || local.blocking || local.reloading) return;
  const airborne = !local.grounded;
  const attackType = airborne ? "aerial" : local.input.sprint && local.stamina >= 34 ? "heavy" : "light";
  if (attackType === "heavy") local.stamina = Math.max(0, local.stamina - 34);
  if (now - localComboAt > 900) localCombo = 0; else localCombo = (localCombo + 1) % 3;
  if (attackType === "heavy") localCombo = 2;
  localComboAt = now;
  const multiplier = attackType === "heavy" ? 1.62 : attackType === "aerial" ? 1.25 : 1;
  nextLocalAttackAt = now + (info.localCooldown + localCombo * 45) * multiplier;
  firstPersonWeapon.melee(localCombo, attackType);
  if (localAvatar) localAvatar.triggerSwing(localCombo, attackType);
  audio.playWeapon(local.weapon);
  const swordDirection = { x: -Math.sin(local.yaw), y: Math.sin(local.pitch) * 0.22, z: -Math.cos(local.yaw) };
  effects.spawnSlash(local, swordDirection, info.color, localCombo);
  const lungeStrength = ([4.2, 4.8, 6.1][localCombo] || 4.2) * (attackType === "heavy" ? 1.18 : 1);
  local.vx += -Math.sin(local.yaw) * lungeStrength;
  local.vz += -Math.cos(local.yaw) * lungeStrength;
  network.send("melee", { combo: localCombo, attackType, weapon: local.weapon, latency: network.latency });
  updateStaminaHud();
}

function fireGun() {
  const now = performance.now();
  const info = WEAPON_INFO[local.weapon];
  const ammo = weaponAmmo(local.weapon);

  if (now < nextLocalAttackAt || local.reloading || ammo.magazine <= 0) {
    if (ammo.magazine <= 0 && !local.reloading) {
      showCombatText("EMPTY — PRESS R");
      if (now - lastDryFireAt > 240) {
        lastDryFireAt = now;
        audio.playDryFire();
      }
    }
    return;
  }

  const ammoCost = serverWeapons[local.weapon]?.ammoPerShot || 1;
  if (ammo.magazine < ammoCost) {
    showCombatText("EMPTY — PRESS R");
    if (now - lastDryFireAt > 240) {
      lastDryFireAt = now;
      audio.playDryFire();
    }
    return;
  }
  const rapidMultiplier = activeLocalPower("rapid") ? 0.70 : 1;
  nextLocalAttackAt = now + info.localCooldown * rapidMultiplier;
  ammo.magazine -= ammoCost;

  // Capture the exact pre-recoil view direction so the fired round follows
  // the reticle/red dot the player actually saw when pressing fire.
  camera.updateMatrixWorld(true);
  const aimDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
  const shotYaw = Math.atan2(-aimDirection.x, -aimDirection.z);
  const shotPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(aimDirection.y, -1, 1)), -1.45, 1.45);

  localShotId++;
  network.send("fire", {
    weapon: local.weapon,
    shotId: localShotId,
    latency: network.latency,
    aiming: currentAimActive(),
    yaw: shotYaw,
    pitch: shotPitch,
    direction: { x: aimDirection.x, y: aimDirection.y, z: aimDirection.z }
  });

  firstPersonWeapon.fire();
  if (localAvatar) localAvatar.triggerFire();
  audio.playWeapon(local.weapon);

  if (now - lastLocalShotAt > 430) recoilShotIndex = 0;
  const pattern = RECOIL_PATTERNS[local.weapon] || [[1, 0]];
  const kick = pattern[recoilShotIndex % pattern.length];
  recoilShotIndex++;
  lastLocalShotAt = now;
  const adsControl = currentAimActive() ? 0.72 : 1;
  recoilPitch += info.recoil * kick[0] * adsControl;
  recoilYaw += info.recoil * kick[1] * 0.72 * adsControl;

  clientBloom = Math.min(
    Number(serverWeapons[local.weapon]?.maxBloom || 0.04),
    clientBloom + Number(serverWeapons[local.weapon]?.bloomPerShot || 0.003)
  );
  updateWeaponHud();

  const origin = settings.cameraMode === "third" && localAvatar
    ? localAvatar.muzzleWorldPosition()
    : firstPersonWeapon.muzzleWorldPosition();

  const heavy = local.weapon === "shotgun" || local.weapon === "railgun";
  effects.spawnMuzzle(origin, info.color, heavy ? 1.75 : local.weapon === "lmg" ? 1.25 : 1);
  // Authoritative tracers are drawn when the server returns exact impact points.
  // This prevents a guessed local tracer from disagreeing with the sight or hit.
  const right = new THREE.Vector3(1, 0.35, 0).applyQuaternion(camera.quaternion);
  effects.spawnCasing(origin, right, local.weapon);
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
  const melee = WEAPON_INFO[local.weapon]?.kind === "melee";
  if (melee) {
    rightMouseDown = active;
    local.blocking = active && local.stamina > 0;
    firstPersonWeapon.setBlocking(local.blocking);
    network.send("block", { active: local.blocking });
    return;
  }
  if (settings.adsMode === "toggle") {
    if (active) adsToggled = !adsToggled;
    rightMouseDown = adsToggled;
  } else {
    rightMouseDown = active;
  }
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
    $("jitterText").textContent = `${Math.round(network.jitter)} ms`;
  });
  network.on("quality", (qualityState) => {
    $("lossText").textContent = `${Math.round(qualityState.loss * 100)}%`;
    for (const remote of remotePlayers.values()) remote.interpolationDelay = qualityState.interpolationDelay;
  });

  network.on("init", (message) => {
    resetNetworkPlayerState();
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
    local.stamina = Number(message.player.stamina ?? 100);
    local.skin = message.player.skin || progression.data.selectedSkin || "standard";
    local.archetype = CHARACTER_ARCHETYPES[message.player.archetype] ? message.player.archetype : settings.archetype;
    local.powers = { ...local.powers, ...(message.player.powers || {}) };
    local.grappleReadyAt = Number(message.player.powers?.grappleReadyAt || 0);

    if (!localAvatar) {
      localAvatar = new LocalPlayerAvatar(scene, message.player, quality);
    }
    setCameraMode(settings.cameraMode, false);

    $("azText").textContent = message.availabilityZone;
    $("instanceText").textContent = message.instanceId;
    $("versionText").textContent = `v${message.version || "8.8.0"}`;

    setHealthArmor(message.player.health, message.player.armor);
    firstPersonWeapon.setWeapon(local.weapon);
    firstPersonWeapon.setSkin(local.skin);
    if (localAvatar) localAvatar.setArchetype(local.archetype);
    firstPersonWeapon.setArchetype(local.archetype);
    pickupRenderer.setPickups(message.pickups || []);
    setRound(message.round);
    syncRoster(message.roster || [message.player]);
    applyPlayerData(message.player);
    buildWeaponSlots();

    network.send("hello", {
      name: $("nameInput").value || localStorage.getItem("voxelCombatName") || "EC2 Fighter",
      roomCode: $("roomCodeInput").value,
      modePreference: $("modeSelect").value,
      skin: progression.data.selectedSkin || "standard",
      archetype: settings.archetype
    });
  });

  network.on("snapshot", (message) => {
    const sampleTime = performance.now();
    setRound(message.round);
    syncRoster(message.roster || message.players || []);

    const visibleIds = new Set();

    for (const player of message.players || []) {
      visibleIds.add(player.id);

      if (player.id === local.id) {
        reconcileSelf(player);
      } else {
        applyPlayerData(player, sampleTime);
      }
    }

    // Interest-managed players outside the current snapshot must not leave
    // frozen character models behind. Their lightweight roster row remains.
    for (const id of Array.from(remotePlayers.keys())) {
      if (!visibleIds.has(id)) removeRemotePlayer(id, false);
    }

    updateScoreboard();
  });

  network.on("unstuck", (message) => {
    applyPlayerData(message.player);
    if (message.player.id === local.id) {
      local.x = message.player.x;
      local.y = message.player.y;
      local.z = message.player.z;
      local.yaw = message.player.yaw;
      local.vx = 0; local.vy = 0; local.vz = 0;
      local.correction.set(0, 0, 0);
      showCombatText("POSITION RECOVERED");
    }
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
    firstPersonWeapon.setReloading(local.reloading, serverWeapons[message.weapon]?.reload || Math.max(250, localReloadEndsAt - performance.now()));
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

    const visualOrigin = message.id === local.id
      ? (settings.cameraMode === "third" && localAvatar ? localAvatar.muzzleWorldPosition() : firstPersonWeapon.muzzleWorldPosition())
      : (remote?.muzzleWorldPosition?.() || new THREE.Vector3(message.origin.x, message.origin.y, message.origin.z));

    for (const impact of message.impacts || []) {
      effects.spawnTracer(visualOrigin, impact, info.color, message.weapon === "shotgun" ? 1.25 : 1);
      effects.spawnImpact(impact, info.color, message.weapon === "shotgun" ? 3 : 5, message.weapon === "railgun" ? 5.2 : message.weapon === "marksman" ? 4.4 : 3.2);
      const surface = impact.y < 0.12 ? "grass" : "stone";
      if (quality.decals) effects.spawnDecal(impact, { x: 0, y: 1, z: 0 }, surface);
      audio.playImpact(surface);
    }
  });

  network.on("melee", (message) => {
    const remote = remotePlayers.get(message.id);
    const info = WEAPON_INFO[message.weapon] || WEAPON_INFO.sword;
    if (remote) {
      remote.triggerSwing(message.combo, message.attackType || "light");
      audio.playWeapon(message.weapon || "sword");
    }
    if (message.origin && message.end) {
      const direction = new THREE.Vector3(
        message.end.x - message.origin.x,
        message.end.y - message.origin.y,
        message.end.z - message.origin.z
      ).normalize();
      effects.spawnSlash(message.origin, direction, info.color, message.combo);
      if (message.attackType === "heavy") effects.spawnImpact(message.end, info.color, 12, 5);
    }
  });

  network.on("melee_result", (message) => {
    local.stamina = Number(message.stamina ?? local.stamina);
    updateStaminaHud();
    if (message.hits > 0) audio.playMeleeHit(message.attackType === "heavy" || message.combo === 2 || message.weapon === "voidblade");
    if (message.hits > 1) showCombatText(`CLEAVE ×${message.hits}`);
    else if (message.hits === 1) showCombatText(message.combo === 2 ? "HEAVY STRIKE" : "BLADE HIT");
  });

  network.on("hit_confirm", (message) => {
    showHit(message.headshot, message.damage, message.armorDamage);
    audio.playHit(message.headshot);

    if (message.headshot) awardProgress("headshots", 1, 16, "Precision hit");
    if (message.killed) {
      showKillBanner(message.headshot ? "HEADSHOT ELIMINATION" : "ELIMINATION");
      audio.playKill();
      awardProgress("kills", 1, message.headshot ? 120 : 90, "Elimination confirmed");
    } else awardProgress("damage", message.damage + message.armorDamage, Math.max(2, Math.round((message.damage + message.armorDamage) * 0.08)));
  
  });

  network.on("damaged", (message) => {
    setHealthArmor(message.health, message.armor);
    audio.playDamage();

    if (message.direction) {
      const worldAngle = Math.atan2(message.direction.x, message.direction.z);
      const relative = normalizeAngle(worldAngle + local.yaw);
      damageDirection.add(relative, message.armorAmount > message.amount, Math.min(1.4, (message.amount + message.armorAmount) / 30));
      aimPunchPitch += Math.min(0.035, (message.amount + message.armorAmount) * 0.0007);
      aimPunchYaw += (Math.random() - 0.5) * 0.025;
    }
    if (Number.isFinite(message.stamina)) local.stamina = message.stamina;
    if (message.armorAmount > message.amount) {
      showAnimated($("armorOverlay"), 340);
    } else {
      showAnimated($("damageOverlay"), 500);
    }
  });

  network.on("vitals", (message) => {
    setHealthArmor(message.health, message.armor);
    if (Number.isFinite(message.stamina)) { local.stamina = message.stamina; updateStaminaHud(); }
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

  network.on("grapple_projectile", (message) => {
    effects.spawnProjectile(message.origin, message.target, 0x65f3ff, Math.max(0.05, (message.arrivesAt - Date.now()) / 1000), 1.1);
    createGrappleLine(message.id, message.target, message.arrivesAt, camera.position.distanceTo(new THREE.Vector3(message.target.x, message.target.y, message.target.z)));
    if (message.id === local.id) {
      pendingGrapple = { target: message.target, expiresAt: message.arrivesAt + 250 };
      local.grappleReadyAt = message.readyAt;
      audio.playGrappleLaunch();
      awardProgress("grapples", 1, 4, "Grapple launched");
    }
  });

  network.on("grapple_start", (message) => {
    createGrappleLine(message.id, message.target, message.endsAt, message.ropeLength);
    if (message.id === local.id) {
      pendingGrapple = null;
      local.grapple = {
        target: message.target,
        endsAt: message.endsAt,
        ropeLength: message.ropeLength,
        attachedAt: message.attachedAt
      };
      local.grappleReadyAt = message.readyAt;
      showCombatText("GRAPPLE LOCKED");
      audio.playGrappleAttach();
    }
  });

  network.on("grapple_end", (message) => {
    removeGrappleLine(message.id);
    if (message.id === local.id) {
      const wasAttached = Boolean(local.grapple || pendingGrapple);
      pendingGrapple = null;
      local.grapple = null;
      if (wasAttached) audio.playGrappleRelease();
      if (message.velocity) {
        local.vx = Number(message.velocity.x || local.vx);
        local.vy = Number(message.velocity.y || local.vy);
        local.vz = Number(message.velocity.z || local.vz);
      }
    }
  });

  network.on("grapple_miss", (message) => {
    pendingGrapple = null;
    removeGrappleLine(local.id);
    local.grappleReadyAt = Number(message.readyAt || local.grappleReadyAt);
    showCombatText("NO GRAPPLE SURFACE");
  });

  network.on("ability_denied", (message) => {
    if (message.ability === "grapple") local.grappleReadyAt = Number(message.readyAt || local.grappleReadyAt);
    if (message.ability === "block") {
      local.blocking = false;
      firstPersonWeapon.setBlocking(false);
      showCombatText("LOW STAMINA");
    }
  });

  network.on("guard_break", (message) => {
    audio.playParry();
    if (message.defenderId === local.id) { local.blocking = false; showCombatText("GUARD BROKEN"); }
    else if (message.attackerId === local.id) showCombatText("GUARD BREAK");
  });

  network.on("objective_captured", (message) => {
    showCombatText(`${message.team.toUpperCase()} CAPTURED ${message.objective.label}`);
    updateObjectiveHud({ ...roundState, objective: message.objective });
  });
  network.on("objective_credit", () => awardProgress("captures", 1, 80, "Objective secured"));
  network.on("mode_vote", (message) => setRound(message.round));
  network.on("map_vote", (message) => setRound(message.round));
  network.on("access_denied", (message) => { $("bootScreen").classList.remove("hidden"); setConnectedUi(false); alert(message.reason || "Access denied"); });

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
      spectatorTargetId = message.killer.id;
      if (!killCam.active) setDeathState(true, message.killer.name);
    }

    if (message.killer.id === local.id) {
      showKillBanner(message.headshot ? "HEADSHOT ELIMINATION" : "ELIMINATION");
    }

    updateScoreboard();
  });

  network.on("assist", () => {
    showCombatText("ASSIST");
    awardProgress("assists", 1, 35, "Team assist");
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
      local.stamina = Number(message.player.stamina ?? 100);
      local.skin = message.player.skin || local.skin;
      local.archetype = CHARACTER_ARCHETYPES[message.player.archetype] ? message.player.archetype : local.archetype;
      spectatorActive = false;
      spectatorTargetId = null;
      local.powers = { ...local.powers, ...(message.player.powers || {}) };
      local.dashUntil = 0;
      local.grapple = null;
      pendingGrapple = null;
      recoilPitch = 0;
      recoilYaw = 0;
      recoilShotIndex = 0;
      local.grappleReadyAt = Number(message.player.powers?.grappleReadyAt || 0);
      removeGrappleLine(local.id);
      if (killCam.active) finishKillCam(false);
      local.correction.set(0, 0, 0);
      firstPersonWeapon.setWeapon(local.weapon);
      firstPersonWeapon.setSkin(local.skin);
      firstPersonWeapon.setReloading(false);
      firstPersonWeapon.setBlocking(false);
      setHealthArmor(message.player.health, message.player.armor);
      setDeathState(false);
      updateWeaponHud();
      updateStaminaHud();

      if (pointerStarted) {
        requestGamePointerLock();
      }
    }
  });

  network.on("pickup_state", (message) => {
    if (pickupRenderer.updatePickup) pickupRenderer.updatePickup(message.pickup);
    else pickupRenderer.setActive(message.pickup.id, message.pickup.active);
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
    const won = message.round?.mode === "ffa"
      ? message.round?.winner === local.id
      : message.round?.winner === local.team;
    if (won) awardProgress("wins", 1, 220, "Round victory");
  });

  network.on("round_start", (message) => {
    setRound(message.round);
    pickupRenderer.setPickups(message.pickups || []);
    $("roundEnd").classList.add("hidden");
    for (const button of $("modeVote").querySelectorAll("button")) button.classList.remove("voted");
    for (const button of $("mapVote").querySelectorAll("button")) button.classList.remove("voted");
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
  settings.adsMode = $("adsModeSelect").value;
  settings.controller = $("controllerInput").checked;
  settings.reducedMotion = $("reducedMotionInput").checked;
  settings.colorblind = $("colorblindSelect").value;
  settings.modePreference = $("modeSelect").value;
  settings.roomCode = $("roomCodeInput").value;
  settings.archetype = CHARACTER_ARCHETYPES[$("archetypeSelect").value] ? $("archetypeSelect").value : "assault";
  applyAccessibility();
  saveSettings();

  $("pauseQuality").value = settings.quality;
  $("pauseFov").value = settings.fov;
  $("pauseSensitivity").value = settings.sensitivity;
  $("pauseVolume").value = settings.volume;
  $("pauseCamera").value = settings.cameraMode;
  $("pauseArchetype").value = settings.archetype;
}

$("playButton").addEventListener("click", () => {
  syncSettingsFromMenu();

  const name = $("nameInput").value.trim() || "EC2 Fighter";
  localStorage.setItem("voxelCombatName", name);
  progression.setSkin($("skinSelect").value);
  local.skin = progression.data.selectedSkin;
  firstPersonWeapon.setSkin(local.skin);
  local.archetype = settings.archetype;
  if (localAvatar) localAvatar.setArchetype(local.archetype);
  firstPersonWeapon.setArchetype(local.archetype);
  network.send("hello", { name, roomCode: $("roomCodeInput").value, modePreference: $("modeSelect").value, skin: local.skin, archetype: local.archetype });
  $("bootScreen").classList.add("hidden");
  pointerStarted = true;
  pausedByMenu = false;
  audio.ensure();
  requestGamePointerLock();
});

$("resumeButton").addEventListener("click", () => {
  pausedByMenu = false;
  $("pauseMenu").classList.add("hidden");
  requestGamePointerLock();
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

function updateAdvancedSetting() {
  settings.adsMode = $("pauseAdsMode").value;
  settings.controller = $("pauseController").checked;
  settings.reducedMotion = $("pauseReducedMotion").checked;
  settings.colorblind = $("pauseColorblind").value;
  settings.crosshair = $("crosshairSelect").value;
  settings.archetype = CHARACTER_ARCHETYPES[$("pauseArchetype").value] ? $("pauseArchetype").value : settings.archetype;
  local.archetype = settings.archetype;
  if (localAvatar) localAvatar.setArchetype(local.archetype);
  firstPersonWeapon.setArchetype(local.archetype);
  network.send("hello", { name: local.name, roomCode: $("roomCodeInput").value, skin: local.skin, archetype: local.archetype });
  $("archetypeSelect").value = settings.archetype;
  $("adsModeSelect").value = settings.adsMode;
  $("controllerInput").checked = settings.controller;
  $("reducedMotionInput").checked = settings.reducedMotion;
  $("colorblindSelect").value = settings.colorblind;
  applyAccessibility();
  saveSettings();
}
for (const id of ["pauseAdsMode", "pauseController", "pauseReducedMotion", "pauseColorblind", "crosshairSelect", "pauseArchetype"]) $(id).addEventListener("change", updateAdvancedSetting);
$("adsModeSelect").addEventListener("change", (event) => { settings.adsMode = event.target.value; $("pauseAdsMode").value = event.target.value; saveSettings(); });
$("controllerInput").addEventListener("change", (event) => { settings.controller = event.target.checked; $("pauseController").checked = event.target.checked; applyAccessibility(); saveSettings(); });
$("reducedMotionInput").addEventListener("change", (event) => { settings.reducedMotion = event.target.checked; $("pauseReducedMotion").checked = event.target.checked; applyAccessibility(); saveSettings(); });
$("colorblindSelect").addEventListener("change", (event) => { settings.colorblind = event.target.value; $("pauseColorblind").value = event.target.value; applyAccessibility(); saveSettings(); });
$("skinSelect").addEventListener("change", (event) => { if (progression.setSkin(event.target.value)) { local.skin = event.target.value; firstPersonWeapon.setSkin(local.skin); network.send("hello", { name: local.name, roomCode: $("roomCodeInput").value, skin: local.skin, archetype: local.archetype }); } });
$("archetypeSelect").addEventListener("change", (event) => { settings.archetype = CHARACTER_ARCHETYPES[event.target.value] ? event.target.value : "assault"; local.archetype = settings.archetype; $("pauseArchetype").value = settings.archetype; if (localAvatar) localAvatar.setArchetype(local.archetype); firstPersonWeapon.setArchetype(local.archetype); network.send("hello", { name: local.name, roomCode: $("roomCodeInput").value, skin: local.skin, archetype: local.archetype }); saveSettings(); });
for (const button of $("modeVote").querySelectorAll("button")) button.addEventListener("click", () => { network.send("mode_vote", { mode: button.dataset.mode }); button.classList.add("voted"); });
for (const button of $("mapVote").querySelectorAll("button")) button.addEventListener("click", () => { network.send("map_vote", { map: button.dataset.map }); button.classList.add("voted"); });

document.addEventListener("pointerlockchange", () => {
  const locked = isGamePointerLocked();
  setMouseLookHint(!locked && pointerStarted && local.alive && !pausedByMenu);

  if (!locked && pointerStarted && local.alive && document.activeElement !== $("chatInput")) {
    pausedByMenu = true;
    $("pauseMenu").classList.remove("hidden");
  } else if (locked) {
    pausedByMenu = false;
    setMouseLookHint(false);
    $("pauseMenu").classList.add("hidden");
  }
});

document.addEventListener("pointerlockerror", () => {
  setMouseLookHint(true, "Mouse capture was blocked · click Resume or click the game view");
});

pointerLockTarget.addEventListener("click", () => {
  if (pointerStarted && local.alive && !pausedByMenu && !isGamePointerLocked()) requestGamePointerLock();
});

function handleKey(code, active) {
  inputBindings.setCode(code, active);
  local.input.forward = inputBindings.active("forward");
  local.input.backward = inputBindings.active("backward");
  local.input.left = inputBindings.active("left");
  local.input.right = inputBindings.active("right");
  local.input.jump = inputBindings.active("jump");
  local.input.sprint = inputBindings.active("sprint");
  local.input.crouch = inputBindings.active("crouch") || keys.ControlLeft;
  local.input.steady = local.input.sprint && currentAimActive() && local.grounded && Math.hypot(local.vx, local.vz) < 1.2;
}

document.addEventListener("keydown", (event) => {
  if (pendingRebindAction) {
    event.preventDefault();
    if (event.code !== "Escape") inputBindings.set(pendingRebindAction, event.code);
    pendingRebindAction = null;
    buildKeybindGrid();
    saveSettings();
    return;
  }
  if (document.activeElement === $("chatInput")) {
    if (event.code === "Enter") {
      const text = $("chatInput").value.trim();

      if (text) {
        network.send("chat", { text });
      }

      $("chatInput").value = "";
      $("chatInput").blur();

      if (local.alive) {
        requestGamePointerLock();
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

  const action = inputBindings.actionForCode(event.code);
  if (action === "reload") reloadWeapon();
  if (action === "dash" && !event.repeat) useDash();
  if (action === "grapple" && !event.repeat) useGrapple();
  if (action === "camera" && !event.repeat) toggleCameraMode();
  if (action === "interact" && !event.repeat && !local.alive) cycleSpectatorTarget();

  if (event.code === "Space" && !event.repeat) {
    local.jumpPressedAt = performance.now();
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
  if (!isGamePointerLocked() || !local.alive) return;

  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  const levels = Array.isArray(info.zoomLevels) && info.zoomLevels.length
    ? info.zoomLevels
    : [Math.max(1, settings.fov / Math.max(1, info.fov))];
  const zoom = levels[Math.min(opticZoomIndex, levels.length - 1)] || 1;
  const adsSensitivity = 1 / THREE.MathUtils.lerp(1, Math.max(1, zoom * 0.82), adsAmount);
  const multiplier = 0.00165 * settings.sensitivity * adsSensitivity;
  local.yaw -= event.movementX * multiplier;
  local.pitch -= event.movementY * multiplier;
  $("scopeOverlay").style.setProperty("--scope-x", `${THREE.MathUtils.clamp(event.movementX * -0.16, -8, 8)}px`);
  $("scopeOverlay").style.setProperty("--scope-y", `${THREE.MathUtils.clamp(event.movementY * -0.16, -8, 8)}px`);
  local.pitch = THREE.MathUtils.clamp(local.pitch, -1.42, 1.42);
  firstPersonWeapon.addSway(event.movementX, event.movementY);
});

document.addEventListener("mousedown", (event) => {
  if (killCam.active) {
    finishKillCam(true);
    return;
  }
  if (!isGamePointerLocked()) {
    if (local.alive && pointerStarted) requestGamePointerLock();
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


document.addEventListener("wheel", (event) => {
  if (!isGamePointerLocked()) return;
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  if (currentAimActive() && Array.isArray(info.zoomLevels) && info.zoomLevels.length > 1) {
    opticZoomIndex = (opticZoomIndex + (event.deltaY > 0 ? -1 : 1) + info.zoomLevels.length) % info.zoomLevels.length;
    showCombatText(`OPTIC ${info.zoomLevels[opticZoomIndex].toFixed(1)}×`);
  } else cycleWeapon(event.deltaY > 0 ? 1 : -1);
});
document.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("blur", () => {
  leftMouseDown = false;
  rightMouseDown = false;
  setBlockOrAim(false);

  for (const key of Object.keys(keys)) keys[key] = false;
  inputBindings.clear();
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
  let spread = adsAmount > 0.5 ? Number(serverInfo.adsSpread || 0.003) : Number(serverInfo.hipSpread || 0.015);
  spread += Math.min(1, speed / MOVEMENT.sprintSpeed) * Number(serverInfo.moveSpread || 0.01);
  if (!local.grounded) spread += Number(serverInfo.airSpread || 0.02);
  if (local.input.crouch && local.grounded) spread *= 0.62;
  spread += clientBloom;
  const gap = THREE.MathUtils.lerp(6 + Math.min(18, spread * 420), 2.5, adsAmount);
  $("crosshair").style.setProperty("--gap", `${gap}px`);
  const aiming = adsAmount > 0.48 && info.kind === "gun";
  let opacity = local.blocking ? 0.45 : 1 - adsAmount * 0.92;
  if (aiming) opacity = Math.max(0, 1 - adsAmount * 2.4);
  $("crosshair").style.opacity = String(opacity);
}

function updateCameraFov(dt) {
  const info = WEAPON_INFO[local.weapon] || WEAPON_INFO.rifle;
  const aiming = currentAimActive() && info.kind === "gun" && local.alive && !killCam.active && !local.reloading;
  const sprinting = local.input.sprint && Math.hypot(local.vx, local.vz) > 4 && !aiming;
  const adsResponse = Number(info.adsSpeed || (info.scope === "sniper" || info.scope === "rail" ? 10 : 15));
  adsAmount += ((aiming ? 1 : 0) - adsAmount) * (1 - Math.exp(-dt * adsResponse));
  const easedAds = adsAmount * adsAmount * (3 - 2 * adsAmount);
  let hipFov = settings.fov;
  if (performance.now() < local.dashUntil) hipFov += 13;
  else if (sprinting) hipFov += activeLocalPower("speed") ? 10 : 7;
  const zoomLevels = Array.isArray(info.zoomLevels) && info.zoomLevels.length ? info.zoomLevels : [Math.max(1, settings.fov / Math.max(1, info.fov))];
  opticZoomIndex = Math.min(opticZoomIndex, zoomLevels.length - 1);
  const zoomMultiplier = zoomLevels[opticZoomIndex] || 1;
  const scopedFov = THREE.MathUtils.clamp(settings.fov / zoomMultiplier, 16, settings.fov);
  const targetFov = THREE.MathUtils.lerp(hipFov, scopedFov, easedAds);

  camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-dt * (aiming ? 18 : 11)));
  camera.updateProjectionMatrix();
  firstPersonWeapon.setAim(aiming);

  const scope = $("scopeOverlay");
  const scopeType = info.scope || "none";
  const sightStyle = info.sight || scopeType;
  const adsActive = adsAmount > 0.2 && settings.cameraMode === "first" && scopeType !== "none";
  const fullscreenScope = settings.cameraMode === "first" &&
    FULLSCREEN_SCOPE_WEAPONS.has(local.weapon) &&
    SCOPE_OVERLAY_TYPES.has(scopeType);
  const scopeBlend = fullscreenScope ? THREE.MathUtils.smoothstep(adsAmount, 0.32, 0.86) : 0;
  const showScope = scopeBlend > 0.001;
  scope.classList.toggle("hidden", !showScope);
  scope.classList.toggle("active", scopeBlend > 0.2);
  scope.style.setProperty("--ads", String(scopeBlend));
  scope.style.setProperty("--scope-blend", String(scopeBlend));
  scope.dataset.weapon = local.weapon;
  scope.dataset.sight = sightStyle;
  document.body.classList.toggle("ads-active", adsActive);
  for (const name of ["iron", "reflex", "optic", "sniper", "rail"]) {
    document.body.classList.toggle(`ads-${name}`, adsActive && scopeType === name);
    document.body.classList.toggle(`scope-${name}`, showScope && scopeType === name);
  }
  for (const name of ["pistol-notch", "smg-aperture", "rifle-holo", "burst-prism", "shotgun-bead", "lmg-reflex", "marksman-scope", "rail-digital"]) {
    document.body.classList.toggle(`sight-${name}`, adsActive && sightStyle === name);
  }

  const zoom = zoomMultiplier;
  $("scopeLabel").textContent = `${zoom.toFixed(1)}× · ${info.name}`;
  const estimatedRange = Math.round(18 + zoom * 24 + Math.max(0, 1 - clientBloom * 20) * 12);
  const steady = local.input.steady && local.stamina > 0;
  firstPersonWeapon.setBreath(steady ? 1 : 0);
  $("scopeTelemetry").textContent = `${steady ? "BREATH HELD" : local.input.crouch && local.grounded ? "BRACED" : "TRACKING"} · ${String(estimatedRange).padStart(3, "0")} m`;
}

function updateRemotePlayers(now, dt) {
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const cameraForward = camera.getWorldDirection(new THREE.Vector3());
  for (const remote of remotePlayers.values()) {
    remote.interpolationDelay = THREE.MathUtils.clamp(95 + network.jitter * 1.8 + network.loss * 180, 90, 210);
    remote.render(now, dt);
    if (remote.label?.material) {
      const toLabel = remote.label.getWorldPosition(new THREE.Vector3()).sub(cameraPosition);
      const distance = Math.max(0.001, toLabel.length());
      const centerDot = cameraForward.dot(toLabel.multiplyScalar(1 / distance));
      let opacity = 1 - adsAmount * 0.5;
      if (adsAmount > 0.15 && centerDot > 0.92) opacity *= THREE.MathUtils.lerp(1, 0.18, Math.min(1, (centerDot - 0.92) / 0.075));
      remote.label.material.opacity = Math.max(0.06, opacity);
    }
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
  const map = roundState?.map || "foundry";

  if (map === "nightfall") {
    sun.position.set(-34, 22, -46);
    sun.intensity = 0.72;
    hemisphere.intensity = 0.46;
    renderer.toneMappingExposure = settings.reducedMotion ? 0.82 : 0.76;
    sky.material.uniforms.topColor.value.set(0x081329);
    sky.material.uniforms.bottomColor.value.set(0x23345a);
    scene.fog.color.set(0x162442);
    return;
  }

  if (map === "storm") {
    const pulse = 0.5 + Math.sin(time * 0.0007) * 0.5;
    sun.position.set(26, 46, 16);
    sun.intensity = 0.92 + pulse * 0.12;
    hemisphere.intensity = 0.62;
    renderer.toneMappingExposure = 0.83;
    sky.material.uniforms.topColor.value.set(0x263441);
    sky.material.uniforms.bottomColor.value.set(0x667682);
    scene.fog.color.set(0x586975);
    return;
  }

  const cycle = (time * 0.000018) % 1;
  const angle = cycle * Math.PI * 2;
  const height = 34 + Math.sin(angle) * 28;
  sun.position.set(Math.cos(angle) * 58, height, Math.sin(angle) * 48);
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
  local.input.steady = local.input.sprint && currentAimActive() && local.grounded && Math.hypot(local.vx, local.vz) < 1.2 && local.stamina > 0;

  const pad = gamepad.poll();
  local.input.forward = inputBindings.active("forward") || (pad.connected && pad.moveY < -0.18);
  local.input.backward = inputBindings.active("backward") || (pad.connected && pad.moveY > 0.18);
  local.input.left = inputBindings.active("left") || (pad.connected && pad.moveX < -0.18);
  local.input.right = inputBindings.active("right") || (pad.connected && pad.moveX > 0.18);
  local.input.jump = inputBindings.active("jump") || (pad.connected && pad.jump);
  local.input.sprint = inputBindings.active("sprint") || (pad.connected && pad.sprint);
  local.input.crouch = inputBindings.active("crouch") || Boolean(keys.ControlLeft) || (pad.connected && pad.crouch);

  if (pad.connected && !pausedByMenu && !killCam.active) {
    local.yaw -= pad.lookX * settings.sensitivity * dt * 2.8;
    local.pitch = THREE.MathUtils.clamp(local.pitch - pad.lookY * settings.sensitivity * dt * 2.4, -1.42, 1.42);
    if (pad.reloadPressed) reloadWeapon();
    if (pad.cameraPressed) local.alive ? toggleCameraMode() : cycleSpectatorTarget();
    if (pad.grapplePressed) useGrapple();
    if (pad.dashPressed) useDash();
    if (pad.nextWeaponPressed) cycleWeapon(1);
    if (pad.previousWeaponPressed) cycleWeapon(-1);
    if (pad.aim !== lastGamepadAim) { setBlockOrAim(pad.aim); lastGamepadAim = pad.aim; }
    leftMouseDown = pad.fire;
    if (pad.fire && !lastGamepadFire) attemptAttack();
    lastGamepadFire = pad.fire;
  }

  const playingKillCam = updateKillCam(now, dt);
  if (pendingGrapple && Date.now() >= pendingGrapple.expiresAt) {
    pendingGrapple = null;
    if (!local.grapple) removeGrappleLine(local.id);
  }
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
  damageDirection.update(now);
  updateStaminaHud();
  effects.update(dt);
  pickupRenderer.update(now / 1000, camera, adsAmount);
  updateMatchClock();
  updateRadar();
  updateCrosshair();
  updatePowerHud();
  updateGrappleHud();
  updateGrappleLines();
  updateObjectiveMarker(now);
  for (const anchor of world.grappleAnchors || []) {
    anchor.userData.ringA.rotation.z += dt * 1.4;
    anchor.userData.ringB.rotation.z -= dt * 1.1;
    anchor.rotation.y += dt * 0.35;
  }
  const spectating = !playingKillCam && updateSpectatorCamera();
  if (!playingKillCam && !spectating) updateCameraFov(dt);
  if (!playingKillCam && !spectating) updateWeaponObstruction();
  updateDeathCountdown(now);
  updateDayNight(now);

  const speed = Math.hypot(local.vx, local.vz);
  if (!playingKillCam) {
    firstPersonWeapon.update(
      dt,
      speed,
      local.grounded,
      currentAimActive() && WEAPON_INFO[local.weapon]?.kind === "gun"
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
buildKeybindGrid();
applyAccessibility();
updateProgressionHud();
progression.onChange(() => updateProgressionHud());
setHealthArmor(100, 25);
updateStaminaHud();
updateRendererResolution();
setCameraMode(settings.cameraMode, false);
updateGrappleHud();
animate();
