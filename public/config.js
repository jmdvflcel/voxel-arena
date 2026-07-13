export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.68, shadows: false, shadowMapSize: 512, particles: 90, decals: 24, shellCasings: 12, postFx: false, viewDistance: 82, antialias: false },
  medium: { pixelRatio: 1.0, shadows: true, shadowMapSize: 1024, particles: 210, decals: 56, shellCasings: 28, postFx: true, viewDistance: 118, antialias: true },
  high: { pixelRatio: 1.35, shadows: true, shadowMapSize: 2048, particles: 360, decals: 96, shellCasings: 48, postFx: true, viewDistance: 148, antialias: true },
  ultra: { pixelRatio: 1.65, shadows: true, shadowMapSize: 3072, particles: 480, decals: 128, shellCasings: 64, postFx: true, viewDistance: 170, antialias: true }
};

export const WEAPON_ORDER = [
  "sword", "pistol", "smg", "rifle", "burst", "shotgun", "lmg", "marksman", "railgun", "voidblade"
];

export const WEAPON_INFO = {
  sword: { name: "Arc Blade", icon: "⚔", kind: "melee", automatic: false, localCooldown: 365, heavyCooldown: 760, color: 0x8ce8ff, recoil: 0, fov: 76, scope: "none", adsSpeed: 1 },
  pistol: { name: "Pulse Pistol", icon: "◈", kind: "gun", automatic: false, localCooldown: 280, color: 0x83ddff, recoil: 0.018, fov: 62, scope: "holo", adsSpeed: 18, zoomLevels: [1.25] },
  smg: { name: "Viper SMG", icon: "▥", kind: "gun", automatic: true, localCooldown: 68, color: 0x72ffc5, recoil: 0.011, fov: 60, scope: "holo", adsSpeed: 19, zoomLevels: [1.3] },
  rifle: { name: "Vector Rifle", icon: "▰", kind: "gun", automatic: true, localCooldown: 94, color: 0xffcf70, recoil: 0.014, fov: 52, scope: "optic", adsSpeed: 15, zoomLevels: [1.5, 1.8] },
  burst: { name: "Trident Burst", icon: "≋", kind: "gun", automatic: false, localCooldown: 390, color: 0x9aa7ff, recoil: 0.025, fov: 48, scope: "optic", adsSpeed: 14, zoomLevels: [1.6, 2.0] },
  shotgun: { name: "Scatter Cannon", icon: "◆", kind: "gun", automatic: false, localCooldown: 820, color: 0xff8d65, recoil: 0.052, fov: 58, scope: "holo", adsSpeed: 12, zoomLevels: [1.25] },
  lmg: { name: "Titan LMG", icon: "▣", kind: "gun", automatic: true, localCooldown: 118, color: 0xffb35f, recoil: 0.022, fov: 54, scope: "optic", adsSpeed: 10, zoomLevels: [1.45] },
  marksman: { name: "Longshot", icon: "✦", kind: "gun", automatic: false, localCooldown: 900, color: 0xe8a5ff, recoil: 0.038, fov: 31, scope: "sniper", adsSpeed: 9, zoomLevels: [2.5, 4.0, 6.0], breathDrain: 24 },
  railgun: { name: "Apex Railgun", icon: "⌁", kind: "gun", automatic: false, localCooldown: 1450, color: 0x65f3ff, recoil: 0.065, fov: 24, scope: "rail", adsSpeed: 7.5, zoomLevels: [3.0, 5.0, 8.0], breathDrain: 30 },
  voidblade: { name: "Void Reaper", icon: "☠", kind: "melee", automatic: false, localCooldown: 500, heavyCooldown: 900, color: 0xff35e8, recoil: 0, fov: 76, scope: "none", rare: true, adsSpeed: 1 }
};

export const CHARACTER_ARCHETYPES = Object.freeze({
  assault: {
    name: "Assault Frame",
    description: "Balanced tactical armor with a strong, readable silhouette.",
    torsoWidth: 1,
    shoulderScale: 1,
    limbScale: 1,
    backpackScale: 1,
    visorShape: "standard"
  },
  scout: {
    name: "Scout Frame",
    description: "Lean reconnaissance armor with a compact grapple harness.",
    torsoWidth: 0.9,
    shoulderScale: 0.84,
    limbScale: 0.92,
    backpackScale: 0.78,
    visorShape: "wide"
  },
  heavy: {
    name: "Heavy Frame",
    description: "Reinforced plating and broad armor while preserving the same gameplay hitbox.",
    torsoWidth: 1.1,
    shoulderScale: 1.18,
    limbScale: 1.06,
    backpackScale: 1.18,
    visorShape: "narrow"
  }
});

export const WEAPON_PRESENTATION = Object.freeze({
  sword: { reloadStyle: "none", scale: 0.72, kick: 0, rightGrip: [0.30, -0.28, -0.43], leftGrip: [-0.18, -0.32, -0.49] },
  voidblade: { reloadStyle: "none", scale: 0.72, kick: 0, rightGrip: [0.30, -0.28, -0.43], leftGrip: [-0.18, -0.32, -0.49] },
  pistol: { reloadStyle: "pistol", scale: 0.78, kick: 0.72, rightGrip: [0.25, -0.29, -0.39], leftGrip: [-0.08, -0.31, -0.44] },
  smg: { reloadStyle: "magazine", scale: 0.72, kick: 0.62, rightGrip: [0.31, -0.29, -0.43], leftGrip: [-0.22, -0.27, -0.56] },
  rifle: { reloadStyle: "rifle", scale: 0.72, kick: 0.74, rightGrip: [0.31, -0.29, -0.43], leftGrip: [-0.24, -0.27, -0.60] },
  burst: { reloadStyle: "rifle", scale: 0.71, kick: 0.82, rightGrip: [0.31, -0.29, -0.43], leftGrip: [-0.24, -0.27, -0.61] },
  shotgun: { reloadStyle: "shotgun", scale: 0.68, kick: 1.18, rightGrip: [0.32, -0.31, -0.45], leftGrip: [-0.25, -0.29, -0.66] },
  lmg: { reloadStyle: "lmg", scale: 0.61, kick: 0.98, rightGrip: [0.34, -0.32, -0.46], leftGrip: [-0.27, -0.29, -0.63] },
  marksman: { reloadStyle: "marksman", scale: 0.67, kick: 1.12, rightGrip: [0.31, -0.30, -0.45], leftGrip: [-0.25, -0.28, -0.66] },
  railgun: { reloadStyle: "cell", scale: 0.60, kick: 1.45, rightGrip: [0.34, -0.33, -0.47], leftGrip: [-0.28, -0.30, -0.66] }
});

export const POWER_INFO = {
  speed: { name: "Overdrive", short: "SPEED", color: 0x56ff9a, duration: 12000, description: "35% faster movement" },
  dash: { name: "Blink Core", short: "DASH", color: 0x6fe7ff, duration: 18000, description: "Press Q to dash" },
  overshield: { name: "Aegis Shield", short: "SHIELD", color: 0x69a7ff, duration: 0, description: "Gain up to 200 armor" },
  rapid: { name: "Accelerator", short: "RAPID", color: 0xffd65e, duration: 11000, description: "30% faster fire rate" },
  damage: { name: "Amplifier", short: "DAMAGE", color: 0xff6363, duration: 10000, description: "25% more damage" },
  regen: { name: "Regen Field", short: "REGEN", color: 0x8dff70, duration: 14000, description: "Regenerate health" },
  jump: { name: "Gravity Coil", short: "JUMP", color: 0xc58cff, duration: 14000, description: "Higher jumps and air control" }
};

export const ABILITY_INFO = {
  grapple: { name: "Momentum Grapple", short: "E", color: 0x72dfff, cooldown: 1900, range: 46, description: "Magnetic anchors, swing momentum, and release boost" }
};

export const MOVEMENT = {
  playerRadius: 0.32,
  standHeight: 1.8,
  crouchHeight: 1.22,
  gravity: 22,
  walkSpeed: 5.35,
  sprintSpeed: 8.25,
  crouchSpeed: 3.1,
  slideSpeed: 10.9,
  moveAccel: 40,
  airAccel: 11,
  groundFriction: 14,
  airFriction: 1.0,
  jumpSpeed: 7.8,
  arenaRadius: 34,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  dashSpeed: 18,
  dashDuration: 0.15,
  grappleRange: 46,
  grapplePull: 42,
  grappleMaxSpeed: 23,
  grappleDuration: 3.2,
  grappleCooldown: 1.9,
  grappleStopDistance: 1.7,
  grappleReelSpeed: 9.5,
  grappleReleaseBoost: 1.08,
  grappleReleaseUp: 1.25,
  grappleProjectileSpeed: 72,
  grappleReelOutSpeed: 7.0,
  mantleDuration: 0.28,
  hardLandingSpeed: 11.5,
  slideCooldown: 0.55,
  staminaRegen: 28,
  staminaBlockDrain: 17,
  staminaHeavyCost: 34,
  breathRegen: 22
};

export const COLLIDERS = [
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

export const GRAPPLE_ANCHORS = [
  { x: 0, y: 8.45, z: -23 }, { x: 0, y: 8.45, z: 23 },
  { x: -23, y: 8.45, z: 0 }, { x: 23, y: 8.45, z: 0 },
  { x: -17, y: 7.45, z: -17 }, { x: 17, y: 7.45, z: -17 },
  { x: -17, y: 7.45, z: 17 }, { x: 17, y: 7.45, z: 17 }
];

export const RECOIL_PATTERNS = {
  pistol: [[1.0, 0.0], [1.05, -0.12], [1.08, 0.14], [1.12, -0.08]],
  smg: [[0.62, 0.0], [0.67, -0.18], [0.72, 0.22], [0.76, -0.28], [0.8, 0.3], [0.84, -0.16]],
  rifle: [[0.82, 0.0], [0.9, -0.12], [0.96, 0.16], [1.02, -0.2], [1.08, 0.24], [1.12, -0.1]],
  burst: [[1.0, -0.12], [1.05, 0.0], [1.12, 0.12]],
  shotgun: [[1.5, 0.0]],
  lmg: [[0.9, -0.1], [0.96, 0.12], [1.0, -0.18], [1.04, 0.22], [1.08, -0.24], [1.1, 0.16]],
  marksman: [[1.45, 0.0], [1.55, -0.08], [1.6, 0.08]],
  railgun: [[2.1, 0.0]]
};

export const TEAM_COLORS = { red: 0xff5968, blue: 0x5aa9ff };

export const PICKUP_COLORS = {
  health: 0x62ff88, armor: 0x6ac7ff, ammo: 0xffd86a,
  smg: 0x72ffc5, burst: 0x9aa7ff, shotgun: 0xff8d65, lmg: 0xffb35f,
  marksman: 0xe8a5ff, railgun: 0x65f3ff, voidblade: 0xff35e8,
  speed: 0x56ff9a, dash: 0x6fe7ff, overshield: 0x69a7ff,
  rapid: 0xffd65e, damage: 0xff6363, regen: 0x8dff70, jump: 0xc58cff
};


export const GAME_MODES = {
  tdm: { name: "TEAM DEATHMATCH", short: "TDM", scoreLimit: 30, description: "Eliminate the opposing team." },
  koth: { name: "KING OF THE HILL", short: "KOTH", scoreLimit: 100, description: "Control the rotating arena core." },
  ffa: { name: "FREE FOR ALL", short: "FFA", scoreLimit: 20, description: "Every fighter is an enemy." }
};

export const WEAPON_SKINS = {
  standard: { name: "Standard", primary: 0x1b2531, secondary: 0x0d1219, emissiveScale: 1 },
  carbon: { name: "Carbon", primary: 0x11151b, secondary: 0x05070a, emissiveScale: 0.75 },
  neon: { name: "Neon Circuit", primary: 0x182431, secondary: 0x07111b, emissiveScale: 1.75 },
  royal: { name: "Royal Alloy", primary: 0x3b2b55, secondary: 0x171020, emissiveScale: 1.35 }
};

export const OBJECTIVE_POINTS = [
  { id: "core", x: 0, y: 2.05, z: 0 },
  { id: "north", x: 0, y: 0.05, z: 17 },
  { id: "south", x: 0, y: 0.05, z: -17 },
  { id: "west", x: -17, y: 0.05, z: 0 },
  { id: "east", x: 17, y: 0.05, z: 0 }
];
