export const QUALITY_PRESETS = {
  low: {
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 512,
    particles: 80,
    viewDistance: 72,
    antialias: false
  },
  medium: {
    pixelRatio: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    particles: 150,
    viewDistance: 95,
    antialias: true
  },
  high: {
    pixelRatio: 1.35,
    shadows: true,
    shadowMapSize: 1536,
    particles: 240,
    viewDistance: 120,
    antialias: true
  }
};

export const WEAPON_ORDER = ["sword", "pistol", "rifle", "shotgun", "marksman"];

export const WEAPON_INFO = {
  sword: {
    name: "Arc Blade",
    icon: "⚔",
    kind: "melee",
    automatic: false,
    localCooldown: 420,
    color: 0x8ce8ff,
    recoil: 0.0,
    fov: 76
  },
  pistol: {
    name: "Pulse Pistol",
    icon: "◈",
    kind: "gun",
    automatic: false,
    localCooldown: 310,
    color: 0x83ddff,
    recoil: 0.025,
    fov: 70
  },
  rifle: {
    name: "Vector Rifle",
    icon: "▰",
    kind: "gun",
    automatic: true,
    localCooldown: 92,
    color: 0xffcf70,
    recoil: 0.018,
    fov: 68
  },
  shotgun: {
    name: "Scatter Cannon",
    icon: "◆",
    kind: "gun",
    automatic: false,
    localCooldown: 840,
    color: 0xff8d65,
    recoil: 0.06,
    fov: 72
  },
  marksman: {
    name: "Longshot",
    icon: "✦",
    kind: "gun",
    automatic: false,
    localCooldown: 920,
    color: 0xe8a5ff,
    recoil: 0.045,
    fov: 58
  }
};

export const MOVEMENT = {
  playerRadius: 0.34,
  standHeight: 1.8,
  crouchHeight: 1.25,
  gravity: 22,
  walkSpeed: 5.1,
  sprintSpeed: 8.0,
  crouchSpeed: 2.8,
  slideSpeed: 10.5,
  moveAccel: 31,
  airAccel: 8,
  groundFriction: 12,
  airFriction: 1.2,
  jumpSpeed: 7.7,
  arenaRadius: 29
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
  { minX: -5, maxX: 1, minY: 0, maxY: 1, minZ: -7, maxZ: -5 }
];

export const TEAM_COLORS = {
  red: 0xff5968,
  blue: 0x5aa9ff
};

export const PICKUP_COLORS = {
  health: 0x62ff88,
  armor: 0x6ac7ff,
  ammo: 0xffd86a,
  shotgun: 0xff8d65,
  marksman: 0xe8a5ff
};
