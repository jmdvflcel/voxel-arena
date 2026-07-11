export const QUALITY_PRESETS = {
  low: { pixelRatio: 0.72, shadows: false, shadowMapSize: 512, particles: 100, viewDistance: 82, antialias: false },
  medium: { pixelRatio: 1.08, shadows: true, shadowMapSize: 1024, particles: 210, viewDistance: 118, antialias: true },
  high: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, particles: 360, viewDistance: 148, antialias: true }
};

export const WEAPON_ORDER = [
  "sword", "pistol", "smg", "rifle", "burst", "shotgun", "lmg", "marksman", "railgun", "voidblade"
];

export const WEAPON_INFO = {
  sword: { name: "Arc Blade", icon: "⚔", kind: "melee", automatic: false, localCooldown: 390, color: 0x8ce8ff, recoil: 0, fov: 76, scope: "none" },
  pistol: { name: "Pulse Pistol", icon: "◈", kind: "gun", automatic: false, localCooldown: 280, color: 0x83ddff, recoil: 0.018, fov: 62, scope: "holo" },
  smg: { name: "Viper SMG", icon: "▥", kind: "gun", automatic: true, localCooldown: 68, color: 0x72ffc5, recoil: 0.011, fov: 60, scope: "holo" },
  rifle: { name: "Vector Rifle", icon: "▰", kind: "gun", automatic: true, localCooldown: 94, color: 0xffcf70, recoil: 0.014, fov: 52, scope: "optic" },
  burst: { name: "Trident Burst", icon: "≋", kind: "gun", automatic: false, localCooldown: 390, color: 0x9aa7ff, recoil: 0.025, fov: 48, scope: "optic" },
  shotgun: { name: "Scatter Cannon", icon: "◆", kind: "gun", automatic: false, localCooldown: 820, color: 0xff8d65, recoil: 0.052, fov: 58, scope: "holo" },
  lmg: { name: "Titan LMG", icon: "▣", kind: "gun", automatic: true, localCooldown: 118, color: 0xffb35f, recoil: 0.022, fov: 54, scope: "optic" },
  marksman: { name: "Longshot", icon: "✦", kind: "gun", automatic: false, localCooldown: 900, color: 0xe8a5ff, recoil: 0.038, fov: 31, scope: "sniper" },
  railgun: { name: "Apex Railgun", icon: "⌁", kind: "gun", automatic: false, localCooldown: 1450, color: 0x65f3ff, recoil: 0.065, fov: 24, scope: "rail" },
  voidblade: { name: "Void Reaper", icon: "☠", kind: "melee", automatic: false, localCooldown: 520, color: 0xff35e8, recoil: 0, fov: 76, scope: "none", rare: true }
};

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
  grapple: { name: "Grapple", short: "E", color: 0x72dfff, cooldown: 2800, range: 38, description: "Every player spawns with it" }
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
  grappleRange: 38,
  grapplePull: 34,
  grappleMaxSpeed: 18,
  grappleDuration: 1.85,
  grappleCooldown: 2.8
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
  { minX: 16.55, maxX: 17.45, minY: 7, maxY: 7.9, minZ: 16.55, maxZ: 17.45 }
];

export const GRAPPLE_ANCHORS = [
  { x: 0, y: 8.45, z: -23 }, { x: 0, y: 8.45, z: 23 },
  { x: -23, y: 8.45, z: 0 }, { x: 23, y: 8.45, z: 0 },
  { x: -17, y: 7.45, z: -17 }, { x: 17, y: 7.45, z: -17 },
  { x: -17, y: 7.45, z: 17 }, { x: 17, y: 7.45, z: 17 }
];

export const TEAM_COLORS = { red: 0xff5968, blue: 0x5aa9ff };

export const PICKUP_COLORS = {
  health: 0x62ff88, armor: 0x6ac7ff, ammo: 0xffd86a,
  smg: 0x72ffc5, burst: 0x9aa7ff, shotgun: 0xff8d65, lmg: 0xffb35f,
  marksman: 0xe8a5ff, railgun: 0x65f3ff, voidblade: 0xff35e8,
  speed: 0x56ff9a, dash: 0x6fe7ff, overshield: 0x69a7ff,
  rapid: 0xffd65e, damage: 0xff6363, regen: 0x8dff70, jump: 0xc58cff
};
