import * as THREE from "/vendor/three.module.js";
import {
  TEAM_COLORS,
  WEAPON_INFO,
  WEAPON_SKINS,
  CHARACTER_ARCHETYPES,
  WEAPON_PRESENTATION
} from "./config.js";
import { hermiteScalar } from "./systems.js";

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 14, 10);
const UNIT_CAPSULE = new THREE.CapsuleGeometry(0.5, 1, 5, 10);
const TMP_POSITION = new THREE.Vector3();
const TMP_POSITION_2 = new THREE.Vector3();

const clamp01 = (value) => THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
const damp = (current, target, speed, dt) => current + (target - current) * (1 - Math.exp(-speed * dt));
const smoothstep = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOutBack = (value) => {
  const t = clamp01(value) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};
const pulseWindow = (progress, start, end) => {
  if (progress <= start || progress >= end) return 0;
  const local = (progress - start) / Math.max(0.0001, end - start);
  return Math.sin(local * Math.PI);
};

function createCanvasLabel(text, team) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.userData = {
    canvas,
    context,
    texture,
    lastName: "",
    lastHealth: -1,
    team: ""
  };
  updateCanvasLabel(sprite, text, 100, team);
  return sprite;
}

function updateCanvasLabel(sprite, name, health, team) {
  const data = sprite.userData;
  const roundedHealth = Math.round(Number(health) || 0);
  if (data.lastName === name && data.lastHealth === roundedHealth && data.team === team) return;

  data.lastName = name;
  data.lastHealth = roundedHealth;
  data.team = team;
  const { context, canvas } = data;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(5,8,14,.78)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = team === "red" ? "#ff7380" : "#76b8ff";
  context.fillRect(0, 0, canvas.width, 8);
  context.fillStyle = "#fff";
  context.font = "700 30px ui-monospace,monospace";
  context.textAlign = "center";
  context.fillText(name, canvas.width / 2, 49);
  context.fillStyle = "rgba(255,255,255,.12)";
  context.fillRect(48, 64, 288, 13);
  const width = 288 * clamp01(roundedHealth / 100);
  context.fillStyle = roundedHealth > 55 ? "#5ee27a" : roundedHealth > 25 ? "#f1c84b" : "#ef5555";
  context.fillRect(48, 64, width, 13);
  data.texture.needsUpdate = true;
}

function armorMaterials(team) {
  const teamColor = TEAM_COLORS[team] || 0x7bb8ff;
  const armor = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.43, metalness: 0.42 });
  const armorDark = new THREE.MeshStandardMaterial({ color: 0x18222f, roughness: 0.57, metalness: 0.38 });
  const undersuit = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.82, metalness: 0.08 });
  const joint = new THREE.MeshStandardMaterial({ color: 0x283544, roughness: 0.7, metalness: 0.2 });
  const visor = new THREE.MeshStandardMaterial({
    color: team === "red" ? 0xffc2a6 : 0xbceaff,
    emissive: team === "red" ? 0xff542e : 0x3bbcff,
    emissiveIntensity: 1.15,
    roughness: 0.16,
    metalness: 0.52,
    transparent: true,
    opacity: 0.92
  });
  const glow = new THREE.MeshBasicMaterial({
    color: team === "red" ? 0xff5868 : 0x5aa9ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  return { armor, armorDark, undersuit, joint, visor, glow };
}

function weaponMaterials(name, firstPerson, skinName) {
  const skinProfile = WEAPON_SKINS[skinName] || WEAPON_SKINS.standard;
  const accentColor = WEAPON_INFO[name]?.color || 0xffffff;
  const primary = new THREE.MeshStandardMaterial({
    color: skinProfile.primary,
    roughness: 0.31,
    metalness: 0.72
  });
  const secondary = new THREE.MeshStandardMaterial({
    color: skinProfile.secondary,
    roughness: 0.48,
    metalness: 0.55
  });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1b222b, roughness: 0.9, metalness: 0.05 });
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: (firstPerson ? 0.7 : 0.34) * skinProfile.emissiveScale,
    roughness: 0.18,
    metalness: 0.68
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9de8ff,
    emissive: 0x2ea6ff,
    emissiveIntensity: firstPerson ? 0.8 : 0.35,
    roughness: 0.08,
    metalness: 0.18,
    transparent: true,
    opacity: 0.72
  });
  const heat = new THREE.MeshStandardMaterial({
    color: 0x352119,
    emissive: 0xff5b20,
    emissiveIntensity: 0,
    roughness: 0.32,
    metalness: 0.72
  });
  return { primary, secondary, grip, accent, glass, heat, skinProfile };
}

function box(parent, size, position, material, name = "", rotation = null) {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radius, length, position, material, name = "", rotation = [Math.PI / 2, 0, 0], segmentsScale = 1) {
  const mesh = new THREE.Mesh(UNIT_CYLINDER, material);
  mesh.scale.set(radius * 2 * segmentsScale, length, radius * 2 * segmentsScale);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function sphere(parent, radius, position, material, name = "", scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(UNIT_SPHERE, material);
  mesh.scale.set(radius * 2 * scale[0], radius * 2 * scale[1], radius * 2 * scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function torus(parent, radius, tube, position, material, name = "", rotation = [Math.PI / 2, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 24), material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function sightReticleMaterial(color, opacity = 0.96) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });
}

function registerSight(group, style, anchor) {
  group.userData.sightStyle = style;
  group.userData.sightAnchor = new THREE.Vector3(anchor[0], anchor[1], anchor[2]);
}

function addPistolIronSights(group, materials) {
  const rearZ = 0.1;
  const frontZ = -0.61;
  const centerY = 0.355;
  const rear = new THREE.Group();
  rear.name = "pistolRearNotch";
  box(rear, [0.055, 0.105, 0.045], [-0.085, centerY - 0.035, rearZ], materials.secondary, "pistolRearLeft");
  box(rear, [0.055, 0.105, 0.045], [0.085, centerY - 0.035, rearZ], materials.secondary, "pistolRearRight");
  box(rear, [0.22, 0.035, 0.045], [0, centerY - 0.105, rearZ], materials.secondary, "pistolRearBase");
  box(rear, [0.027, 0.105, 0.04], [0, centerY - 0.012, frontZ], materials.accent, "pistolFrontPost");
  box(rear, [0.048, 0.025, 0.043], [0, centerY + 0.045, frontZ], materials.glass, "pistolFrontHighlight");
  group.add(rear);
  registerSight(group, "pistol-notch", [0, centerY, rearZ]);
  return rear;
}

function addSmgApertureSight(group, materials) {
  const rearZ = 0.18;
  const frontZ = -1.08;
  const centerY = 0.29;
  const sight = new THREE.Group();
  sight.name = "smgApertureSight";
  torus(sight, 0.092, 0.018, [0, centerY, rearZ], materials.secondary, "smgRearRing", [0, 0, 0]);
  box(sight, [0.24, 0.045, 0.11], [0, centerY - 0.11, rearZ], materials.primary, "smgRearMount");
  box(sight, [0.032, 0.115, 0.045], [0, centerY - 0.012, frontZ], materials.accent, "smgFrontPost");
  sphere(sight, 0.027, [0, centerY + 0.055, frontZ], materials.glass, "smgFrontOrb");
  group.add(sight);
  registerSight(group, "smg-aperture", [0, centerY, rearZ]);
  return sight;
}

function addShotgunBeadSight(group, materials) {
  const rearZ = 0.15;
  const frontZ = -1.64;
  const centerY = 0.315;
  const sight = new THREE.Group();
  sight.name = "shotgunBeadSight";
  box(sight, [0.19, 0.045, 0.04], [-0.115, centerY - 0.045, rearZ], materials.secondary, "shotgunRearLeft");
  box(sight, [0.19, 0.045, 0.04], [0.115, centerY - 0.045, rearZ], materials.secondary, "shotgunRearRight");
  box(sight, [0.11, 0.028, 1.55], [0, centerY - 0.09, -0.73], materials.primary, "shotgunSightRib");
  sphere(sight, 0.042, [0, centerY, frontZ], materials.accent, "shotgunFrontBead");
  group.add(sight);
  registerSight(group, "shotgun-bead", [0, centerY, rearZ]);
  return sight;
}

function addReflexSight(group, z, materials, variant = "rifle") {
  const isLmg = variant === "lmg";
  const centerY = isLmg ? 0.39 : 0.38;
  const sight = new THREE.Group();
  sight.name = isLmg ? "lmgReflexSight" : "rifleHoloSight";
  sight.position.set(0, centerY, z);
  const frameColor = materials.primary;
  box(sight, [isLmg ? 0.28 : 0.23, 0.06, 0.25], [0, -0.12, 0], materials.secondary, "reflexMount");
  if (isLmg) {
    torus(sight, 0.145, 0.025, [0, 0.015, 0], frameColor, "lmgProtectiveHood", [0, 0, 0]);
    box(sight, [0.04, 0.22, 0.045], [-0.15, -0.015, 0], frameColor, "lmgReflexLeft");
    box(sight, [0.04, 0.22, 0.045], [0.15, -0.015, 0], frameColor, "lmgReflexRight");
  } else {
    box(sight, [0.04, 0.22, 0.04], [-0.105, 0.01, 0], frameColor, "holoFrameLeft");
    box(sight, [0.04, 0.22, 0.04], [0.105, 0.01, 0], frameColor, "holoFrameRight");
    box(sight, [0.25, 0.04, 0.04], [0, 0.13, 0], frameColor, "holoFrameTop");
  }
  box(sight, [isLmg ? 0.22 : 0.18, isLmg ? 0.19 : 0.17, 0.012], [0, 0.015, -0.018], materials.glass, "reflexGlass");
  if (isLmg) {
    const chevron = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 3), sightReticleMaterial(0xffbd5b));
    chevron.name = "lmgAmberChevron";
    chevron.position.set(0, 0.005, -0.043);
    chevron.rotation.z = Math.PI;
    chevron.renderOrder = 25;
    sight.add(chevron);
  } else {
    sphere(sight, 0.016, [0, 0.015, -0.045], sightReticleMaterial(0x6feaff), "holoDot");
    const halo = torus(sight, 0.048, 0.005, [0, 0.015, -0.044], sightReticleMaterial(0x52dfff, 0.66), "holoRing", [0, 0, 0]);
    halo.renderOrder = 24;
  }
  group.add(sight);
  registerSight(group, isLmg ? "lmg-reflex" : "rifle-holo", [0, centerY + 0.015, z]);
  return sight;
}

function addPrismSight(group, z, materials) {
  const centerY = 0.405;
  const sight = new THREE.Group();
  sight.name = "burstPrismSight";
  sight.position.set(0, centerY, z);
  box(sight, [0.31, 0.25, 0.5], [0, 0, 0], materials.secondary, "prismHousing");
  box(sight, [0.23, 0.18, 0.018], [0, 0, -0.265], materials.glass, "prismFrontGlass");
  box(sight, [0.22, 0.17, 0.018], [0, 0, 0.265], materials.glass, "prismRearGlass");
  box(sight, [0.16, 0.055, 0.14], [0, -0.16, 0], materials.primary, "prismMount");
  box(sight, [0.006, 0.12, 0.008], [0, 0, 0.245], sightReticleMaterial(0xb6b0ff), "prismVertical");
  box(sight, [0.12, 0.006, 0.008], [0, 0, 0.245], sightReticleMaterial(0xb6b0ff), "prismHorizontal");
  sphere(sight, 0.014, [0, 0, 0.235], sightReticleMaterial(0xffd36f), "prismCenterDot");
  group.add(sight);
  registerSight(group, "burst-prism", [0, centerY, z + 0.245]);
  return sight;
}

function addMagnifiedScope(group, z, length, materials, variant = "marksman") {
  const rail = variant === "rail";
  const centerY = rail ? 0.405 : 0.385;
  const sight = new THREE.Group();
  sight.name = rail ? "railDigitalScope" : "marksmanScope";
  sight.position.set(0, centerY, z);
  if (rail) {
    box(sight, [0.42, 0.28, length], [0, 0, 0], materials.secondary, "railScopeHousing");
    box(sight, [0.34, 0.21, 0.018], [0, 0, length * 0.52], materials.glass, "railScopeRearDisplay");
    box(sight, [0.34, 0.21, 0.018], [0, 0, -length * 0.52], materials.glass, "railScopeFrontGlass");
    box(sight, [0.025, 0.14, 0.008], [0, 0, length * 0.535], sightReticleMaterial(0x64f3ff), "railReticleVertical");
    box(sight, [0.17, 0.025, 0.008], [0, 0, length * 0.535], sightReticleMaterial(0x64f3ff), "railReticleHorizontal");
    sphere(sight, 0.018, [0, 0, length * 0.54], sightReticleMaterial(0xffffff), "railReticleCore");
  } else {
    cylinder(sight, 0.13, length, [0, 0, 0], materials.secondary, "scopeBody");
    cylinder(sight, 0.115, 0.03, [0, 0, -length * 0.52], materials.glass, "scopeFrontLens");
    cylinder(sight, 0.105, 0.03, [0, 0, length * 0.52], materials.glass, "scopeRearLens");
    torus(sight, 0.13, 0.018, [0, 0, length * 0.54], materials.primary, "scopeEyepiece", [0, 0, 0]);
    box(sight, [0.055, 0.08, 0.16], [-0.15, 0.02, 0], materials.primary, "scopeKnob");
  }
  box(sight, [0.18, 0.045, 0.16], [0, -0.16, 0], materials.secondary, "scopeMount");
  group.add(sight);
  registerSight(group, rail ? "rail-digital" : "marksman-scope", [0, centerY, z + length * 0.52]);
  return sight;
}

function hideExistingSightParts(group) {
  group.traverse((object) => {
    const key = String(object.name || "").toLowerCase();
    if (key.includes("optic") || key.includes("sight") || key.includes("scope") || key.includes("reticle")) {
      object.visible = false;
    }
  });
}

function installWeaponSight(group, name, materials) {
  if (name === "pistol") return addPistolIronSights(group, materials);
  if (name === "smg") return addSmgApertureSight(group, materials);
  if (name === "rifle") return addReflexSight(group, -0.26, materials, "rifle");
  if (name === "burst") return addPrismSight(group, -0.26, materials);
  if (name === "shotgun") return addShotgunBeadSight(group, materials);
  if (name === "lmg") return addReflexSight(group, -0.2, materials, "lmg");
  if (name === "marksman") return addMagnifiedScope(group, -0.3, 0.84, materials, "marksman");
  if (name === "railgun") return addMagnifiedScope(group, -0.25, 0.88, materials, "rail");
  return null;
}

function addVentArray(group, count, startZ, spacing, y, materials) {
  const vents = [];
  for (let index = 0; index < count; index++) {
    const vent = box(group, [0.035, 0.06, 0.16], [0.18, y, startZ - index * spacing], materials.heat, `heatVent_${index}`);
    vents.push(vent);
    const mirrored = vent.clone();
    mirrored.position.x = -0.18;
    mirrored.name = `heatVentMirror_${index}`;
    group.add(mirrored);
    vents.push(mirrored);
  }
  return vents;
}

function buildPistol(group, m) {
  box(group, [0.25, 0.24, 0.68], [0, 0.02, -0.18], m.primary, "receiver");
  const slide = box(group, [0.27, 0.14, 0.72], [0, 0.18, -0.22], m.secondary, "slide");
  box(group, [0.17, 0.04, 0.48], [0, 0.265, -0.24], m.accent, "topEnergyRail");
  cylinder(group, 0.055, 0.5, [0, 0.11, -0.65], m.heat, "barrel");
  const grip = box(group, [0.2, 0.52, 0.25], [0, -0.32, 0.05], m.grip, "grip", [-0.22, 0, 0]);
  const magazine = box(group, [0.14, 0.38, 0.16], [0, -0.45, 0.02], m.secondary, "magazine", [-0.22, 0, 0]);
  addPistolIronSights(group, m);
  box(group, [0.3, 0.05, 0.2], [0, -0.03, -0.42], m.accent, "powerCell");
  group.userData.parts = { slide, magazine, grip };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.11, -0.93);
}

function buildRifle(group, m, burst = false) {
  box(group, [0.34, 0.32, 0.92], [0, 0.02, -0.22], m.primary, "receiver");
  box(group, [0.29, 0.18, 0.92], [0, 0.26, -0.25], m.accent, "energySpine");
  box(group, [0.3, 0.23, 0.75], [0, -0.03, -0.98], m.secondary, "handguard");
  cylinder(group, 0.065, 0.95, [0, 0.02, -1.52], m.heat, "barrel");
  cylinder(group, 0.105, 0.18, [0, 0.02, -2.05], m.secondary, "muzzleBrake");
  const magazine = box(group, [0.24, 0.52, 0.3], [0, -0.48, -0.28], m.grip, "magazine", [-0.14, 0, 0]);
  box(group, [0.23, 0.58, 0.22], [0, -0.42, 0.1], m.grip, "pistolGrip", [-0.32, 0, 0]);
  box(group, [0.32, 0.28, 0.72], [0, 0.03, 0.62], m.secondary, "stockBeam");
  box(group, [0.36, 0.5, 0.16], [0, 0.01, 1.02], m.primary, "stockPad");
  const bolt = box(group, [0.06, 0.08, 0.26], [0.2, 0.18, -0.05], m.accent, "bolt");
  box(group, [0.48, 0.04, 1.1], [0, 0.39, -0.35], m.secondary, "topRail");
  if (burst) addPrismSight(group, -0.26, m);
  else addReflexSight(group, -0.26, m, "rifle");
  const vents = addVentArray(group, 4, -0.65, 0.18, 0.12, m);
  if (burst) {
    box(group, [0.07, 0.07, 0.82], [-0.18, 0.18, -1.15], m.accent, "channelLeft");
    box(group, [0.07, 0.07, 0.82], [0, 0.22, -1.18], m.accent, "channelCenter");
    box(group, [0.07, 0.07, 0.82], [0.18, 0.18, -1.15], m.accent, "channelRight");
  }
  group.userData.parts = { magazine, bolt, vents };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -2.18);
}

function buildShotgun(group, m) {
  box(group, [0.38, 0.38, 0.82], [0, 0.02, -0.12], m.primary, "receiver");
  cylinder(group, 0.09, 1.35, [-0.105, 0.08, -1.12], m.heat, "barrelLeft");
  cylinder(group, 0.09, 1.35, [0.105, 0.08, -1.12], m.heat, "barrelRight");
  const pump = box(group, [0.37, 0.29, 0.58], [0, -0.1, -1.05], m.grip, "pump");
  for (let i = -2; i <= 2; i++) box(pump, [0.025, 0.31, 0.52], [i * 0.065, 0, 0], m.secondary, `pumpRib_${i}`);
  box(group, [0.23, 0.58, 0.24], [0, -0.42, 0.16], m.grip, "pistolGrip", [-0.3, 0, 0]);
  box(group, [0.34, 0.32, 0.82], [0, 0.02, 0.7], m.secondary, "stock");
  box(group, [0.4, 0.52, 0.16], [0, 0.01, 1.14], m.primary, "stockPad");
  const shellCarrier = new THREE.Group();
  shellCarrier.name = "shellCarrier";
  shellCarrier.position.set(0.25, -0.05, -0.03);
  for (let index = 0; index < 4; index++) cylinder(shellCarrier, 0.035, 0.18, [0, -0.12 + index * 0.08, 0], m.accent, `shell_${index}`, [0, 0, Math.PI / 2]);
  group.add(shellCarrier);
  addShotgunBeadSight(group, m);
  group.userData.parts = { pump, shellCarrier };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.08, -1.82);
}

function buildMarksman(group, m) {
  box(group, [0.31, 0.31, 0.92], [0, 0.02, -0.12], m.primary, "receiver");
  box(group, [0.28, 0.19, 1.0], [0, -0.03, -0.98], m.secondary, "handguard");
  cylinder(group, 0.055, 1.45, [0, 0.05, -1.78], m.heat, "barrel");
  cylinder(group, 0.09, 0.22, [0, 0.05, -2.62], m.secondary, "muzzleBrake");
  const magazine = box(group, [0.22, 0.42, 0.24], [0, -0.42, -0.25], m.grip, "magazine", [-0.12, 0, 0]);
  box(group, [0.2, 0.58, 0.22], [0, -0.4, 0.12], m.grip, "pistolGrip", [-0.3, 0, 0]);
  box(group, [0.3, 0.29, 0.92], [0, 0.02, 0.82], m.secondary, "stock");
  box(group, [0.36, 0.5, 0.15], [0, 0.02, 1.33], m.primary, "stockPad");
  const bolt = box(group, [0.07, 0.08, 0.34], [0.2, 0.2, 0.02], m.accent, "bolt");
  box(group, [0.16, 0.05, 0.06], [0.32, 0.18, 0.16], m.secondary, "boltHandle");
  addMagnifiedScope(group, -0.3, 0.84, m, "marksman");
  const bipod = new THREE.Group();
  bipod.name = "bipod";
  bipod.position.set(0, -0.13, -1.3);
  box(bipod, [0.045, 0.72, 0.045], [-0.13, -0.3, 0], m.secondary, "bipodLeft", [0.18, 0, -0.18]);
  box(bipod, [0.045, 0.72, 0.045], [0.13, -0.3, 0], m.secondary, "bipodRight", [0.18, 0, 0.18]);
  group.add(bipod);
  group.userData.parts = { magazine, bolt, bipod };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.05, -2.78);
}

function buildRailgun(group, m) {
  box(group, [0.4, 0.42, 1.04], [0, 0.02, -0.2], m.primary, "receiver");
  box(group, [0.36, 0.25, 0.92], [0, -0.02, -1.12], m.secondary, "railHousing");
  const rails = [];
  for (const x of [-0.2, 0.2]) rails.push(box(group, [0.075, 0.075, 1.6], [x, 0.2, -1.12], m.accent, x < 0 ? "railLeft" : "railRight"));
  const coil = torus(group, 0.27, 0.045, [0, 0.1, -1.38], m.accent, "chargeCoil");
  torus(group, 0.24, 0.035, [0, 0.1, -0.86], m.accent, "chargeCoilRear");
  const cell = cylinder(group, 0.17, 0.52, [0, -0.38, -0.15], m.glass, "energyCell", [0, 0, Math.PI / 2]);
  box(group, [0.24, 0.58, 0.24], [0, -0.45, 0.2], m.grip, "pistolGrip", [-0.28, 0, 0]);
  box(group, [0.38, 0.34, 0.88], [0, 0.02, 0.82], m.secondary, "stock");
  addMagnifiedScope(group, -0.25, 0.88, m, "rail");
  const vents = addVentArray(group, 5, -0.55, 0.2, -0.02, m);
  group.userData.parts = { cell, coil, rails, vents };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.16, -2.12);
}

function buildSword(group, m, rare) {
  const grip = cylinder(group, 0.09, 0.48, [0, -0.25, 0], m.grip, "grip", [0, 0, 0]);
  const pommel = sphere(group, 0.12, [0, -0.55, 0], m.accent, "pommel");
  box(group, [0.66, 0.1, 0.19], [0, 0.04, 0], m.primary, "guard");
  box(group, [0.22, 0.18, 0.22], [0, 0.18, 0], m.secondary, "emitter");
  const bladeRoot = new THREE.Group();
  bladeRoot.name = "bladeRoot";
  bladeRoot.position.y = 0.2;
  group.add(bladeRoot);
  const bladeSegments = [];
  const segmentCount = rare ? 7 : 5;
  for (let index = 0; index < segmentCount; index++) {
    const width = (rare ? 0.18 : 0.14) * (1 - index * 0.055);
    const length = rare ? 0.26 : 0.29;
    const segment = box(bladeRoot, [width, length, rare ? 0.18 : 0.13], [rare ? Math.sin(index * 1.7) * 0.035 : 0, 0.18 + index * (length * 0.94), 0], m.accent, `bladeSegment_${index}`, [0, 0, rare ? Math.sin(index * 1.4) * 0.07 : 0]);
    bladeSegments.push(segment);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(rare ? 0.18 : 0.14, rare ? 0.42 : 0.36, 4), m.accent);
  tip.name = "bladeTip";
  tip.position.y = rare ? 2.02 : 1.78;
  tip.rotation.y = Math.PI / 4;
  bladeRoot.add(tip);
  const core = box(bladeRoot, [0.035, rare ? 1.55 : 1.35, rare ? 0.2 : 0.15], [0, rare ? 0.97 : 0.88, 0], m.glass, "bladeCore");
  const aura = rare ? torus(group, 0.24, 0.035, [0, 1.15, 0], new THREE.MeshBasicMaterial({ color: 0xff35e8, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }), "rareAura") : null;
  group.userData.parts = { grip, pommel, bladeRoot, bladeSegments, core, aura };
  group.userData.rareAura = aura;
  group.userData.muzzleLocal = new THREE.Vector3(0, rare ? 2.45 : 2.15, 0);
}

function buildFallbackGun(group, name, m) {
  const profile = {
    smg: [0.3, 0.32, 1.22],
    burst: [0.34, 0.36, 1.55],
    lmg: [0.42, 0.45, 1.78]
  }[name] || [0.3, 0.32, 1.2];
  const [width, height, length] = profile;
  box(group, [width, height, length * 0.64], [0, 0, -0.15], m.primary, "receiver");
  box(group, [width * 0.84, height * 0.45, length * 0.7], [0, height * 0.45, -0.2], m.accent, "energySpine");
  cylinder(group, width * 0.18, length * 0.55, [0, 0.02, -length * 0.68], m.heat, "barrel");
  const magazine = box(group, [width * 0.7, height * 1.1, 0.34], [0, -height * 0.85, -0.04], m.grip, "magazine", [-0.18, 0, 0]);
  box(group, [width * 0.5, height * 1.1, 0.22], [0, -height * 0.75, 0.2], m.grip, "pistolGrip", [-0.3, 0, 0]);
  box(group, [width * 0.95, height * 0.72, 0.5], [0, 0, length * 0.4], m.secondary, "stock");
  if (name === "smg") addSmgApertureSight(group, m);
  else if (name === "lmg") addReflexSight(group, -0.2, m, "lmg");
  else addPrismSight(group, -0.2, m);
  const bolt = box(group, [0.06, 0.07, 0.24], [width * 0.62, 0.15, -0.04], m.accent, "bolt");
  group.userData.parts = { magazine, bolt };
  group.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -length * 0.98);
}

function cachePartTransforms(group) {
  const parts = group.userData.parts || {};
  const list = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value.isObject3D) return;
    value.userData.bindPosition = value.position.clone();
    value.userData.bindRotation = value.rotation.clone();
    value.userData.bindScale = value.scale.clone();
    list.push(value);
  };
  for (const value of Object.values(parts)) visit(value);
  group.userData.animatedParts = list;
}

function discoverAuthoredParts(model) {
  const parts = { vents: [], rails: [], bladeSegments: [] };
  model.traverse((object) => {
    const key = String(object.name || "").toLowerCase();
    if (!key) return;
    if (key.includes("magazine") || key === "mag") parts.magazine = object;
    else if (key.includes("slide")) parts.slide = object;
    else if (key === "bolt" || key.includes("charging")) parts.bolt = object;
    else if (key.includes("pump")) parts.pump = object;
    else if (key.includes("cell")) parts.cell = object;
    else if (key.includes("coil")) parts.coil = object;
    else if (key.includes("aura")) parts.aura = object;
    if (key.includes("vent")) parts.vents.push(object);
    if (key.includes("rail")) parts.rails.push(object);
    if (key.includes("bladesegment")) parts.bladeSegments.push(object);
  });
  model.userData.parts = parts;
  if (parts.aura) model.userData.rareAura = parts.aura;
  cachePartTransforms(model);
}

export function createWeaponModel(name, firstPerson = false, skinName = "standard") {
  const group = new THREE.Group();
  group.name = `Weapon_${name}`;
  const materials = weaponMaterials(name, firstPerson, skinName);
  if (name === "pistol") buildPistol(group, materials);
  else if (name === "rifle") buildRifle(group, materials, false);
  else if (name === "burst") buildRifle(group, materials, true);
  else if (name === "shotgun") buildShotgun(group, materials);
  else if (name === "marksman") buildMarksman(group, materials);
  else if (name === "railgun") buildRailgun(group, materials);
  else if (name === "sword" || name === "voidblade") buildSword(group, materials, name === "voidblade");
  else buildFallbackGun(group, name, materials);

  group.userData.skinName = skinName;
  group.userData.skinMaterials = materials;
  group.userData.weaponName = name;
  cachePartTransforms(group);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = !firstPerson;
    object.receiveShadow = !firstPerson;
    if (firstPerson) {
      object.frustumCulled = false;
      object.material.depthTest = false;
      object.material.depthWrite = false;
      object.renderOrder = 20;
    }
  });
  return group;
}

function characterMesh(parent, geometry, scale, position, material, name = "") {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function createLimb(materials, side, limbScale, isLeg = false) {
  const root = new THREE.Group();
  const upper = new THREE.Group();
  const lower = new THREE.Group();
  const end = new THREE.Group();
  root.name = `${side}${isLeg ? "Leg" : "Arm"}Root`;
  upper.name = `${side}${isLeg ? "Thigh" : "UpperArm"}`;
  lower.name = `${side}${isLeg ? "Shin" : "Forearm"}`;
  end.name = `${side}${isLeg ? "Foot" : "Hand"}`;
  root.add(upper);
  upper.add(lower);
  lower.add(end);

  if (isLeg) {
    characterMesh(upper, UNIT_CAPSULE, [0.19 * limbScale, 0.42, 0.19 * limbScale], [0, -0.28, 0], materials.undersuit, `${side}ThighMesh`);
    characterMesh(upper, UNIT_BOX, [0.27 * limbScale, 0.24, 0.3 * limbScale], [0, -0.05, -0.01], materials.armor, `${side}ThighPlate`);
    lower.position.y = -0.58;
    characterMesh(lower, UNIT_CAPSULE, [0.17 * limbScale, 0.4, 0.17 * limbScale], [0, -0.26, 0.02], materials.undersuit, `${side}ShinMesh`);
    characterMesh(lower, UNIT_BOX, [0.25 * limbScale, 0.23, 0.29 * limbScale], [0, -0.1, -0.09], materials.armorDark, `${side}KneePlate`);
    end.position.y = -0.54;
    characterMesh(end, UNIT_BOX, [0.28 * limbScale, 0.18, 0.46], [0, -0.05, -0.11], materials.armorDark, `${side}Boot`);
  } else {
    characterMesh(upper, UNIT_CAPSULE, [0.15 * limbScale, 0.38, 0.15 * limbScale], [0, -0.24, 0], materials.undersuit, `${side}UpperArmMesh`);
    characterMesh(upper, UNIT_BOX, [0.28 * limbScale, 0.22, 0.32 * limbScale], [0, -0.02, 0], materials.armor, `${side}ShoulderPad`);
    lower.position.y = -0.52;
    characterMesh(lower, UNIT_CAPSULE, [0.14 * limbScale, 0.35, 0.14 * limbScale], [0, -0.23, 0], materials.undersuit, `${side}ForearmMesh`);
    characterMesh(lower, UNIT_BOX, [0.24 * limbScale, 0.3, 0.25 * limbScale], [0, -0.15, -0.02], materials.armorDark, `${side}Gauntlet`);
    end.position.y = -0.48;
    characterMesh(end, UNIT_BOX, [0.2 * limbScale, 0.18, 0.24 * limbScale], [0, -0.04, -0.04], materials.joint, `${side}Glove`);
  }
  return { root, upper, lower, end };
}

function createCharacterRig(team, archetypeName, quality) {
  const profile = CHARACTER_ARCHETYPES[archetypeName] || CHARACTER_ARCHETYPES.assault;
  const materials = armorMaterials(team);
  const root = new THREE.Group();
  root.name = `CharacterRig_${archetypeName}`;
  const pelvis = new THREE.Group();
  pelvis.position.y = 0.83;
  const spine = new THREE.Group();
  spine.position.y = 0.34;
  const chest = new THREE.Group();
  chest.position.y = 0.28;
  const head = new THREE.Group();
  head.position.y = 0.52;
  root.add(pelvis);
  pelvis.add(spine);
  spine.add(chest);
  chest.add(head);

  characterMesh(pelvis, UNIT_BOX, [0.48 * profile.torsoWidth, 0.34, 0.32], [0, 0, 0], materials.armorDark, "PelvisArmor");
  characterMesh(spine, UNIT_CAPSULE, [0.42 * profile.torsoWidth, 0.52, 0.28], [0, 0.13, 0], materials.undersuit, "TorsoSuit");
  characterMesh(chest, UNIT_BOX, [0.76 * profile.torsoWidth, 0.58, 0.38], [0, 0.06, 0], materials.armor, "ChestArmor");
  characterMesh(chest, UNIT_BOX, [0.55 * profile.torsoWidth, 0.36, 0.07], [0, 0.08, -0.23], materials.armorDark, "ChestPlate");
  characterMesh(chest, UNIT_BOX, [0.08, 0.3, 0.045], [0, 0.08, -0.285], materials.glow, "ChestLight");
  characterMesh(chest, UNIT_BOX, [0.48 * profile.backpackScale, 0.55, 0.22 * profile.backpackScale], [0, 0.08, 0.27], materials.armorDark, "Backpack");
  characterMesh(chest, UNIT_CYLINDER, [0.12, 0.36, 0.12], [-0.23, 0.03, 0.39], materials.armor, "GrappleCanisterLeft");
  characterMesh(chest, UNIT_CYLINDER, [0.12, 0.36, 0.12], [0.23, 0.03, 0.39], materials.armor, "GrappleCanisterRight");

  characterMesh(head, UNIT_SPHERE, [0.48, 0.49, 0.47], [0, 0.03, 0], materials.armorDark, "Helmet");
  characterMesh(head, UNIT_BOX, [0.42, profile.visorShape === "narrow" ? 0.11 : 0.16, 0.055], [0, 0.05, -0.24], materials.visor, "Visor");
  if (profile.visorShape === "wide") characterMesh(head, UNIT_BOX, [0.54, 0.07, 0.05], [0, 0.04, -0.25], materials.glow, "VisorGlow");
  characterMesh(head, UNIT_BOX, [0.12, 0.22, 0.09], [0, -0.18, -0.24], materials.armor, "Respirator");
  if (archetypeName === "heavy") {
    characterMesh(head, UNIT_BOX, [0.55, 0.14, 0.4], [0, 0.3, 0.02], materials.armor, "HeavyHelmetCrown");
    characterMesh(chest, UNIT_BOX, [0.18, 0.68, 0.5], [-0.48, 0.05, 0], materials.armorDark, "HeavyShoulderLeft");
    characterMesh(chest, UNIT_BOX, [0.18, 0.68, 0.5], [0.48, 0.05, 0], materials.armorDark, "HeavyShoulderRight");
  } else if (archetypeName === "scout") {
    characterMesh(head, UNIT_BOX, [0.08, 0.24, 0.18], [-0.3, 0.14, 0.04], materials.glow, "ScoutAntenna");
    characterMesh(chest, UNIT_BOX, [0.05, 0.45, 0.05], [-0.33, 0.08, -0.25], materials.glow, "ScoutLightLeft");
    characterMesh(chest, UNIT_BOX, [0.05, 0.45, 0.05], [0.33, 0.08, -0.25], materials.glow, "ScoutLightRight");
  }

  const leftArm = createLimb(materials, "Left", profile.limbScale, false);
  const rightArm = createLimb(materials, "Right", profile.limbScale, false);
  leftArm.root.position.set(-0.47 * profile.shoulderScale, 0.26, 0);
  rightArm.root.position.set(0.47 * profile.shoulderScale, 0.26, 0);
  chest.add(leftArm.root, rightArm.root);

  const leftLeg = createLimb(materials, "Left", profile.limbScale, true);
  const rightLeg = createLimb(materials, "Right", profile.limbScale, true);
  leftLeg.root.position.set(-0.2, -0.08, 0);
  rightLeg.root.position.set(0.2, -0.08, 0);
  pelvis.add(leftLeg.root, rightLeg.root);

  const weaponMount = new THREE.Group();
  weaponMount.name = "WeaponMount";
  weaponMount.position.set(0.12, 0.02, -0.34);
  weaponMount.rotation.y = Math.PI;
  chest.add(weaponMount);

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = Boolean(quality.shadows);
    object.receiveShadow = Boolean(quality.shadows);
  });

  return {
    root,
    pelvis,
    spine,
    chest,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    materials,
    archetype: archetypeName
  };
}

function resetPart(part) {
  if (!part?.userData?.bindPosition) return;
  part.position.copy(part.userData.bindPosition);
  part.rotation.copy(part.userData.bindRotation);
  part.scale.copy(part.userData.bindScale);
  part.visible = true;
}

function animateWeaponParts(model, name, fireCycle, reloadProgress, heat, dt) {
  if (!model) return;
  const parts = model.userData.parts || {};
  for (const part of model.userData.animatedParts || []) resetPart(part);
  const cycle = clamp01(fireCycle);
  const kick = Math.sin(cycle * Math.PI);
  if (parts.slide) parts.slide.position.z += kick * 0.16;
  if (parts.bolt) parts.bolt.position.z += kick * 0.13;
  if (parts.pump && cycle > 0) parts.pump.position.z += Math.sin(cycle * Math.PI) * 0.3;
  if (parts.coil) {
    parts.coil.rotation.z += performance.now() * 0.0006;
    parts.coil.scale.multiplyScalar(1 + heat * 0.07);
  }
  for (const rail of parts.rails || []) rail.scale.x *= 1 + heat * 0.12;
  for (const vent of parts.vents || []) {
    vent.rotation.y += heat * 0.35;
    if (vent.material?.emissiveIntensity !== undefined) vent.material.emissiveIntensity = heat * 2.4;
  }
  const accent = model.userData.skinMaterials?.accent;
  if (accent?.emissiveIntensity !== undefined) {
    const base = model.userData.authored ? 0.5 : 0.65;
    accent.emissiveIntensity = base + heat * 1.2;
  }

  if (!(reloadProgress > 0)) return;
  const p = clamp01(reloadProgress);
  const style = WEAPON_PRESENTATION[name]?.reloadStyle || "magazine";
  const magOut = pulseWindow(p, 0.12, 0.62);
  const magIn = smoothstep((p - 0.52) / 0.32);
  if (parts.magazine) {
    parts.magazine.position.y -= magOut * 0.58;
    parts.magazine.rotation.z += magOut * 0.35;
    parts.magazine.visible = !(p > 0.34 && p < 0.52);
    if (p >= 0.52) {
      parts.magazine.visible = true;
      parts.magazine.position.y -= (1 - magIn) * 0.45;
    }
  }
  if (style === "pistol" && parts.slide && p > 0.79) parts.slide.position.z += pulseWindow(p, 0.79, 0.98) * 0.2;
  if ((style === "rifle" || style === "marksman") && parts.bolt && p > 0.78) parts.bolt.position.z += pulseWindow(p, 0.78, 0.98) * 0.22;
  if (style === "shotgun" && parts.pump) parts.pump.position.z += pulseWindow(p, 0.66, 0.98) * 0.34;
  if (style === "cell" && parts.cell) {
    parts.cell.position.x += pulseWindow(p, 0.18, 0.7) * 0.48;
    parts.cell.rotation.x += p * Math.PI * 2;
  }
  if (style === "lmg" && parts.magazine) {
    parts.magazine.rotation.x += pulseWindow(p, 0.12, 0.88) * 0.6;
    parts.magazine.position.z += pulseWindow(p, 0.12, 0.88) * 0.25;
  }
}

function applyRemotePose(actor, state, now, dt) {
  const rig = actor.rig;
  if (!rig) return;
  const speed = Math.hypot(state.vx || 0, state.vz || 0);
  const sprint = speed > 6.6;
  const crouched = Boolean(state.crouching);
  const sliding = Boolean(state.sliding);
  const airborne = Math.abs(state.vy || 0) > 0.6;
  const forwardX = -Math.sin(state.yaw || 0);
  const forwardZ = -Math.cos(state.yaw || 0);
  const rightX = Math.cos(state.yaw || 0);
  const rightZ = -Math.sin(state.yaw || 0);
  const forwardSpeed = (state.vx || 0) * forwardX + (state.vz || 0) * forwardZ;
  const strafeSpeed = (state.vx || 0) * rightX + (state.vz || 0) * rightZ;
  const cadence = sprint ? 11.5 : 8.2;
  actor.animPhase += dt * cadence * Math.max(0.18, Math.min(1.4, speed / 5.5));
  const stride = Math.sin(actor.animPhase);
  const strideOpposite = Math.sin(actor.animPhase + Math.PI);
  const strideAmount = Math.min(0.95, speed * 0.12) * (crouched ? 0.55 : 1);
  const crouchOffset = crouched ? -0.34 : sliding ? -0.42 : 0;
  const breath = Math.sin(now * 0.0022) * (speed < 0.25 ? 0.018 : 0.006);

  rig.pelvis.position.y = damp(rig.pelvis.position.y, 0.83 + crouchOffset + breath, 16, dt);
  rig.pelvis.rotation.x = damp(rig.pelvis.rotation.x, sliding ? -0.38 : -forwardSpeed * 0.022, 13, dt);
  rig.pelvis.rotation.z = damp(rig.pelvis.rotation.z, -strafeSpeed * 0.025, 13, dt);
  rig.spine.rotation.x = damp(rig.spine.rotation.x, (state.pitch || 0) * 0.32 + (sprint ? -0.12 : 0), 16, dt);
  rig.spine.rotation.z = damp(rig.spine.rotation.z, -strafeSpeed * 0.018, 16, dt);
  rig.head.rotation.x = damp(rig.head.rotation.x, (state.pitch || 0) * 0.55, 18, dt);
  rig.head.rotation.y = damp(rig.head.rotation.y, Math.sin(now * 0.0013 + actor.id.length) * (speed < 0.2 ? 0.05 : 0), 6, dt);

  let leftHip = stride * strideAmount;
  let rightHip = strideOpposite * strideAmount;
  let leftKnee = Math.max(0, -stride) * strideAmount * 0.9;
  let rightKnee = Math.max(0, -strideOpposite) * strideAmount * 0.9;
  if (airborne) {
    leftHip = state.vy > 0 ? -0.52 : 0.18;
    rightHip = state.vy > 0 ? 0.38 : -0.22;
    leftKnee = 0.72;
    rightKnee = 0.45;
  }
  if (sliding) {
    leftHip = -0.72;
    rightHip = -0.35;
    leftKnee = 1.05;
    rightKnee = 0.72;
  }
  rig.leftLeg.root.rotation.x = damp(rig.leftLeg.root.rotation.x, leftHip, 20, dt);
  rig.rightLeg.root.rotation.x = damp(rig.rightLeg.root.rotation.x, rightHip, 20, dt);
  rig.leftLeg.lower.rotation.x = damp(rig.leftLeg.lower.rotation.x, leftKnee, 22, dt);
  rig.rightLeg.lower.rotation.x = damp(rig.rightLeg.lower.rotation.x, rightKnee, 22, dt);
  rig.leftLeg.root.rotation.z = damp(rig.leftLeg.root.rotation.z, strafeSpeed * 0.025, 14, dt);
  rig.rightLeg.root.rotation.z = damp(rig.rightLeg.root.rotation.z, strafeSpeed * 0.025, 14, dt);

  const sword = actor.weaponName === "sword" || actor.weaponName === "voidblade";
  const aimPitch = state.pitch || 0;
  // Positive X rotation points the arms toward the rig's forward axis (-Z).
  // The previous negative values placed both hands behind the character.
  let rightShoulderX = sword ? 0.78 : 1.2 - aimPitch * 0.7;
  let leftShoulderX = sword ? 0.52 : 1.08 - aimPitch * 0.65;
  let rightShoulderZ = sword ? -0.18 : 0.08;
  let leftShoulderZ = sword ? 0.24 : -0.22;
  let rightElbow = sword ? 0.28 : 0.62;
  let leftElbow = sword ? 0.34 : 0.76;

  if (actor.swing > 0 && sword) {
    const progress = 1 - actor.swing;
    const strike = Math.sin(progress * Math.PI);
    if (actor.swingCombo === 0) {
      rightShoulderX = 1.1 - strike * 1.45;
      rightShoulderZ = -1.0 + progress * 1.9;
      leftShoulderX = 0.75 - strike * 0.6;
    } else if (actor.swingCombo === 1) {
      rightShoulderX = 0.95 - strike * 1.55;
      rightShoulderZ = 0.95 - progress * 1.9;
      leftShoulderX = 0.8 - strike * 0.55;
    } else {
      rightShoulderX = 2.15 - progress * 3.0;
      leftShoulderX = 1.55 - progress * 1.3;
      rightShoulderZ = -0.18;
    }
    rig.spine.rotation.y = damp(rig.spine.rotation.y, Math.sin(progress * Math.PI * 2) * 0.25, 24, dt);
  } else if (state.blocking && sword) {
    rightShoulderX = 1.3;
    rightShoulderZ = -0.82;
    leftShoulderX = 1.05;
    leftShoulderZ = 0.5;
  } else if (state.reloading && !sword) {
    const reloadWave = Math.sin(now * 0.006);
    rightShoulderX = 0.82;
    rightShoulderZ = -0.62;
    leftShoulderX = 0.48 - reloadWave * 0.12;
    leftShoulderZ = 0.48;
    rightElbow = 0.95;
    leftElbow = 1.18;
  } else if (speed > 0.4 && !state.aiming && !sword) {
    rightShoulderX += -stride * strideAmount * 0.12;
    leftShoulderX += -strideOpposite * strideAmount * 0.12;
  }

  rig.rightArm.root.rotation.x = damp(rig.rightArm.root.rotation.x, rightShoulderX, 20, dt);
  rig.rightArm.root.rotation.z = damp(rig.rightArm.root.rotation.z, rightShoulderZ, 20, dt);
  rig.leftArm.root.rotation.x = damp(rig.leftArm.root.rotation.x, leftShoulderX, 20, dt);
  rig.leftArm.root.rotation.z = damp(rig.leftArm.root.rotation.z, leftShoulderZ, 20, dt);
  rig.rightArm.lower.rotation.x = damp(rig.rightArm.lower.rotation.x, rightElbow, 22, dt);
  rig.leftArm.lower.rotation.x = damp(rig.leftArm.lower.rotation.x, leftElbow, 22, dt);

  actor.fireKickVelocity += (-94 * actor.fireKick - 18 * actor.fireKickVelocity) * dt;
  actor.fireKick += actor.fireKickVelocity * dt;
  actor.fireKick = THREE.MathUtils.clamp(actor.fireKick, -0.08, 0.72);
  rig.weaponMount.position.z = damp(rig.weaponMount.position.z, -0.34 + actor.fireKick * 0.14, 24, dt);
  rig.weaponMount.rotation.x = damp(rig.weaponMount.rotation.x, state.reloading && !sword ? -0.65 : actor.fireKick * 0.05, 18, dt);
  actor.weaponFireCycle = Math.max(0, actor.weaponFireCycle - dt * 8);
  actor.weaponHeat = Math.max(0, actor.weaponHeat - dt * 0.42);
  animateWeaponParts(actor.weapon, actor.weaponName, actor.weaponFireCycle, state.reloading ? (now % 1600) / 1600 : 0, actor.weaponHeat, dt);
}

export class RemotePlayer {
  constructor(scene, player, quality) {
    this.scene = scene;
    this.quality = quality;
    this.id = player.id;
    this.group = new THREE.Group();
    this.group.position.set(player.x, player.y, player.z);
    this.group.rotation.y = player.yaw || 0;
    this.archetype = CHARACTER_ARCHETYPES[player.archetype] ? player.archetype : "assault";
    this.rig = createCharacterRig(player.team, this.archetype, quality);
    this.group.add(this.rig.root);

    this.label = createCanvasLabel(player.name, player.team);
    this.label.position.y = 2.58;
    this.powerAura = new THREE.Mesh(
      new THREE.SphereGeometry(0.74, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x6fe7ff, transparent: true, opacity: 0, wireframe: true, depthWrite: false })
    );
    this.powerAura.position.y = 1.05;
    this.scopeGlint = new THREE.Sprite(new THREE.SpriteMaterial({
      color: 0xdff8ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    }));
    this.scopeGlint.position.set(0, 1.58, -0.42);
    this.scopeGlint.scale.set(0.18, 0.18, 1);
    this.group.add(this.label, this.powerAura, this.scopeGlint);
    this.scene.add(this.group);

    this.weapon = null;
    this.weaponName = "";
    this.samples = [];
    this.swing = 0;
    this.swingCombo = 0;
    this.swingType = "light";
    this.fireKick = 0;
    this.fireKickVelocity = 0;
    this.weaponFireCycle = 0;
    this.weaponHeat = 0;
    this.blocking = false;
    this.reloading = false;
    this.alive = player.alive !== false;
    this.team = player.team;
    this.name = player.name;
    this.skinName = player.skin || "standard";
    this.interpolationDelay = 120;
    this.animPhase = Math.random() * Math.PI * 2;
    this.targetPosition = new THREE.Vector3(player.x, player.y, player.z);
    this.setWeapon(player.weapon || "rifle");
    this.pushSample(player, performance.now());
  }

  setArchetype(name) {
    const next = CHARACTER_ARCHETYPES[name] ? name : "assault";
    if (next === this.archetype && this.rig) return;
    const oldRig = this.rig;
    if (oldRig) this.group.remove(oldRig.root);
    this.archetype = next;
    this.rig = createCharacterRig(this.team, next, this.quality);
    this.group.add(this.rig.root);
    this.weapon = null;
    const weaponName = this.weaponName || "rifle";
    this.weaponName = "";
    this.setWeapon(weaponName);
  }

  setWeapon(name) {
    if (name === this.weaponName && this.weapon) return;
    if (this.weapon) this.rig.weaponMount.remove(this.weapon);
    this.weaponName = name;
    this.weapon = createWeaponModel(name, false, this.skinName);
    const presentation = WEAPON_PRESENTATION[name] || WEAPON_PRESENTATION.rifle;
    this.weapon.scale.setScalar((presentation?.scale || 0.7) * 0.74);
    const sword = name === "sword" || name === "voidblade";
    this.weapon.rotation.set(sword ? -0.16 : -0.03, sword ? 0 : 0, sword ? -0.58 : 0);
    this.weapon.position.set(sword ? 0.32 : 0.04, sword ? -0.22 : -0.04, sword ? -0.02 : 0);
    this.rig.weaponMount.rotation.y = 0;
    this.rig.weaponMount.add(this.weapon);
  }

  setSkin(name) {
    const next = WEAPON_SKINS[name] ? name : "standard";
    if (next === this.skinName) return;
    this.skinName = next;
    const weaponName = this.weaponName;
    this.weaponName = "";
    this.setWeapon(weaponName || "rifle");
  }

  pushSample(player, receivedAt) {
    this.samples.push({
      time: receivedAt,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw || 0,
      pitch: player.pitch || 0,
      vx: player.vx || 0,
      vy: player.vy || 0,
      vz: player.vz || 0,
      health: player.health,
      team: player.team,
      name: player.name,
      weapon: player.weapon,
      alive: player.alive !== false,
      blocking: Boolean(player.blocking),
      sliding: Boolean(player.sliding),
      crouching: Boolean(player.crouching),
      reloading: Boolean(player.reloading),
      aiming: Boolean(player.aiming),
      stamina: Number(player.stamina ?? 100),
      skin: player.skin || "standard",
      archetype: player.archetype || "assault",
      powers: player.powers || {}
    });
    while (this.samples.length > 12) this.samples.shift();
    this.team = player.team;
    this.setArchetype(player.archetype || this.archetype);
    this.setSkin(player.skin || this.skinName);
    this.setWeapon(player.weapon || this.weaponName);
    this.name = player.name;
    this.alive = player.alive !== false;
    this.group.visible = this.alive;
    this.blocking = Boolean(player.blocking);
    this.reloading = Boolean(player.reloading);
    updateCanvasLabel(this.label, player.name, player.health, player.team);
  }

  triggerSwing(combo = 0, type = "light") {
    this.swing = 1;
    this.swingCombo = Math.max(0, Math.min(2, Number(combo) || 0));
    this.swingType = type;
  }

  triggerFire() {
    const presentation = WEAPON_PRESENTATION[this.weaponName] || WEAPON_PRESENTATION.rifle;
    this.fireKickVelocity += 6.5 * (presentation?.kick || 0.8);
    this.weaponFireCycle = 1;
    this.weaponHeat = Math.min(1, this.weaponHeat + 0.18);
  }

  render(now, dt, interpolationDelay = this.interpolationDelay) {
    if (!this.samples.length) return;
    this.interpolationDelay += (THREE.MathUtils.clamp(interpolationDelay, 85, 210) - this.interpolationDelay) * Math.min(1, dt * 3);
    const renderTime = now - this.interpolationDelay;
    let older = this.samples[0];
    let newer = this.samples[this.samples.length - 1];
    for (let index = 0; index < this.samples.length - 1; index++) {
      if (this.samples[index].time <= renderTime && this.samples[index + 1].time >= renderTime) {
        older = this.samples[index];
        newer = this.samples[index + 1];
        break;
      }
    }
    const range = Math.max(1, newer.time - older.time);
    const seconds = range / 1000;
    const alpha = clamp01((renderTime - older.time) / range);
    if (newer === older || seconds <= 0.001) {
      const extrapolation = THREE.MathUtils.clamp((renderTime - newer.time) / 1000, 0, 0.1);
      this.targetPosition.set(newer.x + newer.vx * extrapolation, newer.y + newer.vy * extrapolation, newer.z + newer.vz * extrapolation);
    } else {
      this.targetPosition.set(
        hermiteScalar(older.x, newer.x, older.vx, newer.vx, alpha, seconds),
        hermiteScalar(older.y, newer.y, older.vy, newer.vy, alpha, seconds),
        hermiteScalar(older.z, newer.z, older.vz, newer.vz, alpha, seconds)
      );
    }
    const error = this.targetPosition.distanceTo(this.group.position);
    if (error > 4.5) this.group.position.copy(this.targetPosition);
    else this.group.position.lerp(this.targetPosition, Math.min(1, dt * (error > 1.2 ? 24 : 15)));
    let yawDelta = newer.yaw - this.group.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    this.group.rotation.y += yawDelta * Math.min(1, dt * 16);

    if (this.swing > 0) {
      const duration = this.swingType === "heavy" ? 0.68 : this.swingType === "aerial" ? 0.48 : this.swingCombo === 2 ? 0.42 : 0.34;
      this.swing = Math.max(0, this.swing - dt / duration);
    }
    applyRemotePose(this, newer, now, dt);
    const crouchOffset = newer.crouching || newer.sliding ? -0.34 : 0;
    this.label.position.y = damp(this.label.position.y, 2.58 + crouchOffset, 15, dt);
    const powerActive = Object.entries(newer.powers || {}).some(([key, value]) => key !== "dashReadyAt" && Number(value) > Date.now());
    this.powerAura.material.opacity = damp(this.powerAura.material.opacity, powerActive ? 0.2 : 0, 10, dt);
    this.powerAura.rotation.y += dt * 1.8;
    const scoped = newer.aiming && (newer.weapon === "marksman" || newer.weapon === "railgun");
    this.scopeGlint.material.opacity = damp(this.scopeGlint.material.opacity, scoped ? 0.78 : 0, 12, dt);
    if (scoped) {
      const pulse = 0.16 + Math.sin(now * 0.012) * 0.035;
      this.scopeGlint.scale.set(pulse, pulse, 1);
    }
  }

  renderLocal(player, now, dt, visible = true) {
    this.group.visible = visible && player.alive !== false;
    if (!this.group.visible) return;
    this.setArchetype(player.archetype || this.archetype);
    this.setWeapon(player.weapon || this.weaponName);
    this.blocking = Boolean(player.blocking);
    this.reloading = Boolean(player.reloading);
    this.group.position.set(player.x, player.y, player.z);
    this.group.rotation.y = player.yaw || 0;
    updateCanvasLabel(this.label, player.name || this.name, player.health ?? 100, player.team || this.team);
    if (this.swing > 0) {
      const duration = this.swingType === "heavy" ? 0.68 : this.swingType === "aerial" ? 0.48 : this.swingCombo === 2 ? 0.42 : 0.34;
      this.swing = Math.max(0, this.swing - dt / duration);
    }
    applyRemotePose(this, player, now, dt);
    this.scopeGlint.material.opacity = 0;
  }

  muzzleWorldPosition() {
    this.group.updateMatrixWorld(true);
    if (!this.weapon) return new THREE.Vector3(this.group.position.x, this.group.position.y + 1.45, this.group.position.z);
    const local = this.weapon.userData.muzzleLocal?.clone() || new THREE.Vector3(0, 0, -1.25);
    return this.weapon.localToWorld(local);
  }

  dispose() {
    this.scene.remove(this.group);
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}

export class LocalPlayerAvatar extends RemotePlayer {
  constructor(scene, player, quality) {
    super(scene, { ...player, id: "__local_avatar__" }, quality);
    this.samples.length = 0;
  }
}

const FP_HIP_LAYOUTS = Object.freeze({
  pistol: [0.33, -0.37, -0.66], smg: [0.4, -0.42, -0.8], rifle: [0.43, -0.43, -0.86],
  burst: [0.43, -0.43, -0.86], shotgun: [0.46, -0.46, -0.91], lmg: [0.48, -0.49, -0.94],
  marksman: [0.43, -0.43, -0.91], railgun: [0.46, -0.48, -0.96]
});
const FP_AIM_FALLBACKS = Object.freeze({
  pistol: [0, -0.29, -0.50], smg: [0, -0.23, -0.58], rifle: [0, -0.29, -0.63],
  burst: [0, -0.30, -0.67], shotgun: [0, -0.23, -0.66], lmg: [0, -0.25, -0.72],
  marksman: [0, -0.26, -0.78], railgun: [0, -0.25, -0.82]
});

function firstPersonMaterials() {
  return {
    sleeve: new THREE.MeshStandardMaterial({ color: 0x23364b, roughness: 0.7, metalness: 0.18 }),
    armor: new THREE.MeshStandardMaterial({ color: 0x405b78, roughness: 0.46, metalness: 0.42 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x121a22, roughness: 0.88, metalness: 0.04 }),
    light: new THREE.MeshStandardMaterial({ color: 0x8ce8ff, emissive: 0x42c9ff, emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.3 })
  };
}

function createFirstPersonArm(side, materials) {
  const root = new THREE.Group();
  const upper = new THREE.Group();
  const elbow = new THREE.Group();
  const wrist = new THREE.Group();
  root.add(upper);
  upper.add(elbow);
  elbow.add(wrist);
  const direction = side === "left" ? -1 : 1;
  const upperMesh = box(upper, [0.2, 0.22, 0.58], [0, 0, -0.16], materials.sleeve, `${side}UpperArm`, [-0.16, 0, 0]);
  box(upper, [0.24, 0.12, 0.24], [0, 0.01, 0.13], materials.armor, `${side}ShoulderArmor`);
  elbow.position.z = -0.48;
  box(elbow, [0.18, 0.19, 0.52], [0, 0, -0.2], materials.sleeve, `${side}Forearm`, [-0.08, 0, 0]);
  box(elbow, [0.22, 0.22, 0.3], [0, 0.01, -0.22], materials.armor, `${side}Gauntlet`);
  box(elbow, [0.035, 0.1, 0.2], [direction * 0.13, 0.02, -0.21], materials.light, `${side}ArmLight`);
  wrist.position.z = -0.48;
  box(wrist, [0.18, 0.14, 0.22], [0, 0, -0.04], materials.glove, `${side}Hand`);
  for (let index = 0; index < 4; index++) {
    box(wrist, [0.035, 0.045, 0.18], [(-0.065 + index * 0.043), -0.03, -0.15], materials.glove, `${side}Finger${index}`, [0.18, 0, 0]);
  }
  root.userData = { upper, elbow, wrist, upperMesh, direction };
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.castShadow = false;
    object.receiveShadow = false;
    object.material.depthTest = false;
    object.material.depthWrite = false;
    object.renderOrder = 21;
  });
  return root;
}

export class FirstPersonWeapon {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.models = new Map();
    this.current = "rifle";
    this.skinName = "standard";
    this.archetype = "assault";
    this.swing = 0;
    this.swingCombo = 0;
    this.swingDuration = 0.34;
    this.meleeType = "light";
    this.block = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bob = 0;
    this.aim = 0;
    this.targetAim = 0;
    this.recoilPosition = 0;
    this.recoilVelocity = 0;
    this.recoilYaw = 0;
    this.recoilYawVelocity = 0;
    this.recoilRoll = 0;
    this.recoilRollVelocity = 0;
    this.switchBlend = 1;
    this.obstruction = 0;
    this.breath = 0;
    this.fireCycle = 0;
    this.heat = 0;
    this.reloadActive = false;
    this.reloadElapsed = 0;
    this.reloadDuration = 1.6;
    this.reloadProgress = 0;
    this.hipPosition = new THREE.Vector3();
    this.aimPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
    this.armTargetLeft = new THREE.Vector3();
    this.armTargetRight = new THREE.Vector3();

    const armMaterials = firstPersonMaterials();
    this.leftArm = createFirstPersonArm("left", armMaterials);
    this.rightArm = createFirstPersonArm("right", armMaterials);
    this.root.add(this.leftArm, this.rightArm);

    for (const name of Object.keys(WEAPON_INFO)) {
      const model = createWeaponModel(name, true, this.skinName);
      model.visible = false;
      model.scale.setScalar(WEAPON_PRESENTATION[name]?.scale || 0.7);
      this.root.add(model);
      this.models.set(name, model);
    }
    this.setWeapon("rifle");
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  setArchetype(name) {
    const next = CHARACTER_ARCHETYPES[name] ? name : "assault";
    this.archetype = next;
    const profile = CHARACTER_ARCHETYPES[next];
    const scale = profile.limbScale || 1;
    this.leftArm.scale.setScalar(scale);
    this.rightArm.scale.setScalar(scale);
    const heavy = next === "heavy";
    const scout = next === "scout";
    for (const arm of [this.leftArm, this.rightArm]) {
      arm.traverse((object) => {
        if (!object.isMesh || !object.material?.metalness) return;
        if (String(object.name).includes("Gauntlet") || String(object.name).includes("ShoulderArmor")) {
          object.material.metalness = heavy ? 0.58 : scout ? 0.3 : 0.42;
          object.material.roughness = heavy ? 0.38 : scout ? 0.56 : 0.46;
        }
      });
    }
  }

  installAuthoredModel(name, source) {
    if (!source || !this.models.has(name)) return false;
    const previous = this.models.get(name);
    const model = source.clone(true);
    model.visible = previous.visible;
    model.position.copy(previous.position);
    model.rotation.copy(previous.rotation);
    model.scale.setScalar(WEAPON_PRESENTATION[name]?.scale || previous.scale.x || 0.7);
    model.userData.authored = true;
    model.userData.weaponName = name;
    model.userData.skinMaterials = {};
    const muzzleMap = {
      pistol: [0, 0.11, -0.93], rifle: [0, 0.02, -2.18], shotgun: [0, 0.08, -1.82],
      marksman: [0, 0.05, -2.78], sword: [0, 2.15, 0], voidblade: [0, 2.45, 0]
    };
    model.userData.muzzleLocal = new THREE.Vector3(...(muzzleMap[name] || [0, 0, -1.25]));
    discoverAuthoredParts(model);
    if (WEAPON_INFO[name]?.kind === "gun") {
      hideExistingSightParts(model);
      const materials = weaponMaterials(name, true, this.skinName);
      installWeaponSight(model, name, materials);
    }
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;
      if (object.material) {
        object.material = object.material.clone();
        object.material.depthTest = false;
        object.material.depthWrite = false;
        object.material.toneMapped = true;
      }
      object.renderOrder = 20;
    });
    this.root.remove(previous);
    this.root.add(model);
    this.models.set(name, model);
    return true;
  }

  setSkin(name) {
    const next = WEAPON_SKINS[name] ? name : "standard";
    if (next === this.skinName) return;
    this.skinName = next;
    for (const [weaponName, oldModel] of this.models) {
      if (oldModel.userData.authored) {
        const skin = WEAPON_SKINS[next] || WEAPON_SKINS.standard;
        oldModel.traverse((object) => {
          if (!object.isMesh || !object.material?.color) return;
          const key = String(object.name || "").toLowerCase();
          if (["blade", "energy", "accent", "light", "sight", "reticle", "glass", "optic", "scope", "holo", "prism", "bead", "post", "ring", "chevron"].some((token) => key.includes(token))) return;
          object.material.color.setHex(key.includes("grip") || key.includes("stock") ? skin.secondary : skin.primary);
        });
        continue;
      }
      const replacement = createWeaponModel(weaponName, true, next);
      replacement.visible = oldModel.visible;
      replacement.scale.setScalar(WEAPON_PRESENTATION[weaponName]?.scale || oldModel.scale.x);
      this.root.remove(oldModel);
      this.root.add(replacement);
      this.models.set(weaponName, replacement);
    }
  }

  setObstruction(value) {
    this.obstruction = clamp01(value);
  }

  setBreath(value) {
    this.breath = clamp01(value);
  }

  setWeapon(name) {
    if (!this.models.has(name)) return;
    for (const model of this.models.values()) model.visible = false;
    this.current = name;
    this.models.get(name).visible = true;
    this.switchBlend = 0;
    this.reloadActive = false;
    this.reloadProgress = 0;
    this.fireCycle = 0;
  }

  fire() {
    const info = WEAPON_INFO[this.current] || WEAPON_INFO.rifle;
    const presentation = WEAPON_PRESENTATION[this.current] || WEAPON_PRESENTATION.rifle;
    const impulse = (5.4 + info.recoil * 78) * (presentation?.kick || 0.8);
    this.recoilVelocity += impulse;
    this.recoilYawVelocity += (Math.random() - 0.5) * (1.1 + info.recoil * 12);
    this.recoilRollVelocity += (Math.random() - 0.5) * (0.8 + info.recoil * 8);
    this.fireCycle = 1;
    this.heat = Math.min(1, this.heat + (this.current === "railgun" ? 0.65 : this.current === "shotgun" ? 0.35 : 0.14));
  }

  melee(combo, type = "light") {
    this.swingCombo = Math.max(0, Math.min(2, Number(combo) || 0));
    this.meleeType = type;
    this.swingDuration = type === "heavy" ? 0.68 : type === "aerial" ? 0.48 : this.swingCombo === 2 ? 0.42 : 0.34;
    this.swing = 1;
  }

  setReloading(active, durationMs = 1600) {
    const next = Boolean(active);
    if (next && !this.reloadActive) {
      this.reloadActive = true;
      this.reloadElapsed = 0;
      this.reloadDuration = Math.max(0.45, Number(durationMs || 1600) / 1000);
      this.reloadProgress = 0.001;
    } else if (next && this.reloadActive && Number.isFinite(Number(durationMs))) {
      this.reloadDuration = Math.max(this.reloadElapsed + 0.1, Number(durationMs) / 1000);
    } else if (!next) {
      this.reloadActive = false;
      this.reloadElapsed = 0;
      this.reloadProgress = 0;
    }
  }

  setBlocking(active) {
    this.block = active ? 1 : 0;
  }

  setAim(active) {
    this.targetAim = active ? 1 : 0;
  }

  addSway(deltaX, deltaY) {
    this.swayX += deltaX * 0.00035;
    this.swayY += deltaY * 0.00035;
  }

  updateArmPose(dt, isSword, reloadProgress, aiming, meleeProgress) {
    const presentation = WEAPON_PRESENTATION[this.current] || WEAPON_PRESENTATION.rifle;
    const rightBase = presentation.rightGrip || [0.31, -0.29, -0.43];
    const leftBase = presentation.leftGrip || [-0.24, -0.27, -0.6];
    this.armTargetRight.set(rightBase[0], rightBase[1], rightBase[2]);
    this.armTargetLeft.set(leftBase[0], leftBase[1], leftBase[2]);
    let rightRotX = -0.22;
    let leftRotX = -0.3;
    let rightRotY = -0.1;
    let leftRotY = 0.12;
    let rightRotZ = -0.08;
    let leftRotZ = 0.08;

    if (aiming && !isSword) {
      this.armTargetRight.x += 0.04;
      this.armTargetLeft.x -= 0.04;
      this.armTargetRight.y -= 0.035;
      this.armTargetLeft.y -= 0.035;
      rightRotX = -0.3;
      leftRotX = -0.38;
    }
    if (reloadProgress > 0 && !isSword) {
      const style = presentation.reloadStyle;
      const reach = pulseWindow(reloadProgress, 0.08, 0.78);
      if (style === "pistol") this.armTargetLeft.set(-0.02 + reach * 0.13, -0.5 + reach * 0.18, -0.42 - reach * 0.1);
      else if (style === "shotgun") this.armTargetLeft.set(-0.05, -0.38, -0.73 + reach * 0.24);
      else if (style === "cell") this.armTargetLeft.set(-0.04, -0.42, -0.48 + reach * 0.08);
      else this.armTargetLeft.set(-0.03, -0.48 + reach * 0.15, -0.48 - reach * 0.08);
      this.armTargetRight.set(0.23, -0.39, -0.4);
      leftRotX = -0.8;
      leftRotZ = 0.5;
      rightRotX = -0.58;
      rightRotZ = -0.38;
    }
    if (isSword) {
      this.armTargetRight.set(0.29, -0.32, -0.44);
      this.armTargetLeft.set(-0.05, -0.38, -0.5);
      leftRotX = -0.62;
      rightRotX = -0.48;
      if (meleeProgress > 0) {
        const strike = Math.sin(meleeProgress * Math.PI);
        this.armTargetRight.x -= strike * 0.18;
        this.armTargetRight.y += strike * 0.16;
        this.armTargetLeft.x += strike * 0.1;
        rightRotZ += (this.swingCombo === 1 ? -1 : 1) * strike * 0.55;
        leftRotZ -= strike * 0.32;
      }
    }

    const armBlend = 1 - Math.exp(-dt * 22);
    this.rightArm.position.lerp(this.armTargetRight, armBlend);
    this.leftArm.position.lerp(this.armTargetLeft, armBlend);
    this.rightArm.rotation.x = damp(this.rightArm.rotation.x, rightRotX + this.recoilPosition * 0.035, 22, dt);
    this.rightArm.rotation.y = damp(this.rightArm.rotation.y, rightRotY, 22, dt);
    this.rightArm.rotation.z = damp(this.rightArm.rotation.z, rightRotZ + this.recoilRoll * 0.2, 22, dt);
    this.leftArm.rotation.x = damp(this.leftArm.rotation.x, leftRotX + this.recoilPosition * 0.018, 22, dt);
    this.leftArm.rotation.y = damp(this.leftArm.rotation.y, leftRotY, 22, dt);
    this.leftArm.rotation.z = damp(this.leftArm.rotation.z, leftRotZ, 22, dt);
    this.leftArm.visible = true;
    this.rightArm.visible = true;
  }

  update(dt, movementSpeed, grounded, aiming) {
    const model = this.models.get(this.current);
    if (!model) return;
    const swayDamping = THREE.MathUtils.lerp(0.03, 0.002, this.breath);
    this.swayX *= Math.pow(swayDamping, dt);
    this.swayY *= Math.pow(swayDamping, dt);
    this.setAim(aiming);
    const adsSpeed = WEAPON_INFO[this.current]?.adsSpeed || 15;
    this.aim += (this.targetAim - this.aim) * (1 - Math.exp(-dt * adsSpeed));
    this.switchBlend += (1 - this.switchBlend) * (1 - Math.exp(-dt * 13));

    this.recoilVelocity += (-122 * this.recoilPosition - 20 * this.recoilVelocity) * dt;
    this.recoilPosition += this.recoilVelocity * dt;
    this.recoilYawVelocity += (-108 * this.recoilYaw - 18 * this.recoilYawVelocity) * dt;
    this.recoilYaw += this.recoilYawVelocity * dt;
    this.recoilRollVelocity += (-104 * this.recoilRoll - 18 * this.recoilRollVelocity) * dt;
    this.recoilRoll += this.recoilRollVelocity * dt;
    this.recoilPosition = THREE.MathUtils.clamp(this.recoilPosition, -0.12, 1.15);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw, -0.17, 0.17);
    this.recoilRoll = THREE.MathUtils.clamp(this.recoilRoll, -0.13, 0.13);

    if (this.reloadActive) {
      this.reloadElapsed += dt;
      this.reloadProgress = Math.min(0.995, this.reloadElapsed / this.reloadDuration);
    }
    this.fireCycle = Math.max(0, this.fireCycle - dt * (this.current === "shotgun" ? 2.6 : 9.5));
    this.heat = Math.max(0, this.heat - dt * (this.current === "lmg" ? 0.18 : 0.34));

    const moving = movementSpeed > 0.2 && grounded;
    if (moving) this.bob += dt * (7 + movementSpeed * 0.55);
    const motionScale = Math.min(1, movementSpeed / 5);
    const bobX = moving ? Math.sin(this.bob) * 0.034 * motionScale : 0;
    const bobY = moving ? Math.abs(Math.cos(this.bob)) * 0.026 * motionScale : 0;
    const isSword = this.current === "sword" || this.current === "voidblade";
    const hip = FP_HIP_LAYOUTS[this.current] || [0.42, -0.42, -0.78];
    const fallbackAds = FP_AIM_FALLBACKS[this.current] || [0, -0.28, -0.62];
    const presentation = WEAPON_PRESENTATION[this.current] || WEAPON_PRESENTATION.rifle;
    if (isSword) {
      this.hipPosition.set(0.53, -0.52, -0.74);
      this.aimPosition.copy(this.hipPosition);
    } else {
      this.hipPosition.set(hip[0], hip[1], hip[2]);
      const sight = model.userData.sightAnchor;
      const modelScale = Number(model.scale.x || presentation.scale || 1);
      if (sight?.isVector3) {
        this.aimPosition.set(
          -sight.x * modelScale,
          -sight.y * modelScale + Number(presentation.adsYOffset || 0),
          Number(presentation.adsZ || fallbackAds[2])
        );
      } else {
        this.aimPosition.set(fallbackAds[0], fallbackAds[1], fallbackAds[2]);
      }
    }

    const targetPosition = this.targetPosition.copy(this.hipPosition).lerp(this.aimPosition, this.aim);
    const adsMotion = 1 - this.aim * 0.88;
    targetPosition.x += (bobX + this.swayX) * adsMotion + this.recoilYaw * 0.16;
    targetPosition.y -= (bobY + this.swayY) * adsMotion;
    targetPosition.z += this.recoilPosition * 0.1;
    targetPosition.y -= (1 - this.switchBlend) * 0.34;
    targetPosition.z += this.obstruction * 0.42;
    targetPosition.y -= this.obstruction * 0.18;
    const targetRotation = this.targetRotation.set(
      THREE.MathUtils.lerp(-0.08 - this.swayY * 1.8, 0, this.aim) + this.recoilPosition * 0.08,
      THREE.MathUtils.lerp(-0.12 - this.swayX * 1.8 + this.recoilYaw, this.recoilYaw * 0.32, this.aim),
      isSword ? -0.22 : THREE.MathUtils.lerp(0.02, 0, this.aim) + this.obstruction * 0.58 + this.recoilRoll
    );

    let meleeProgress = 0;
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt / this.swingDuration);
      meleeProgress = 1 - this.swing;
      const strike = Math.sin(meleeProgress * Math.PI);
      const windup = Math.min(1, meleeProgress / (this.meleeType === "heavy" ? 0.34 : 0.18));
      if (this.meleeType === "heavy") {
        targetRotation.x += -1.7 + meleeProgress * 2.85;
        targetRotation.y -= strike * 0.2;
        targetRotation.z -= strike * 0.48;
        targetPosition.y += (1 - windup) * 0.34 - strike * 0.39;
        targetPosition.z -= strike * 0.28;
      } else if (this.meleeType === "aerial") {
        targetRotation.x += -0.95 + meleeProgress * 2.15;
        targetRotation.z += 0.6 - meleeProgress * 1.2;
        targetPosition.y -= strike * 0.36;
        targetPosition.z -= strike * 0.31;
      } else if (this.swingCombo === 0) {
        targetRotation.x -= strike * 0.62;
        targetRotation.y -= strike * 0.32;
        targetRotation.z += 0.9 - meleeProgress * 1.98;
        targetPosition.x -= strike * 0.25;
      } else if (this.swingCombo === 1) {
        targetRotation.x -= strike * 0.74;
        targetRotation.y += strike * 0.34;
        targetRotation.z += -0.98 + meleeProgress * 2.04;
        targetPosition.x += strike * 0.23;
      } else {
        targetRotation.x += -1.42 + meleeProgress * 2.4;
        targetRotation.z -= strike * 0.32;
        targetPosition.y += (1 - windup) * 0.22 - strike * 0.3;
        targetPosition.z -= strike * 0.19;
      }
    }

    if (this.block > 0 && isSword) {
      targetRotation.x = -0.94;
      targetRotation.z = -1.08;
      targetPosition.set(0.12, -0.18, -0.57);
    }
    if (this.reloadProgress > 0 && !isSword) {
      const p = this.reloadProgress;
      const down = Math.sin(Math.min(1, p * 1.7) * Math.PI) * 0.2;
      targetRotation.x += -0.5 - down;
      targetRotation.z += -0.45 * pulseWindow(p, 0.04, 0.9);
      targetRotation.y += 0.18 * pulseWindow(p, 0.05, 0.86);
      targetPosition.set(0.17, -0.58 - down * 0.55, -0.56);
    }

    animateWeaponParts(model, this.current, this.fireCycle, this.reloadProgress, this.heat, dt);
    this.updateArmPose(dt, isSword, this.reloadProgress, this.aim, meleeProgress);
    if (model.userData.rareAura) {
      model.userData.rareAura.rotation.z += dt * 3.1;
      model.userData.rareAura.material.opacity = 0.58 + Math.sin(performance.now() * 0.008) * 0.2;
    }
    const positionBlend = 1 - Math.exp(-dt * 21);
    const rotationBlend = 1 - Math.exp(-dt * 22);
    this.root.position.lerp(targetPosition, positionBlend);
    this.root.rotation.x += (targetRotation.x - this.root.rotation.x) * rotationBlend;
    this.root.rotation.y += (targetRotation.y - this.root.rotation.y) * rotationBlend;
    this.root.rotation.z += (targetRotation.z - this.root.rotation.z) * rotationBlend;
  }

  muzzleWorldPosition() {
    const model = this.models.get(this.current);
    const local = model.userData.muzzleLocal?.clone() || ((this.current === "sword" || this.current === "voidblade") ? new THREE.Vector3(0, 2.15, 0) : new THREE.Vector3(0, 0, -1.2));
    this.camera.updateMatrixWorld(true);
    return model.localToWorld(local);
  }
}
