export const QUALITY_PRESETS = {
  low: {
    pixelRatio: 0.72,
    shadows: false,
    shadowMapSize: 512,
    particles: 90,
    viewDistance: 72,
    antialias: false
  },
  medium: {
    pixelRatio: 1.0,
    shadows: true,
    shadowMapSize: 1024,
    particles: 180,
    viewDistance: 100,
    antialias: true
  },
  high: {
    pixelRatio: 1.35,
    shadows: true,
    shadowMapSize: 1536,
    particles: 300,
    viewDistance: 126,
    antialias: true
  }
};

export const WEAPON_ORDER = [
  "sword",
  "pistol",
  "smg",
  "rifle",
  "burst",
  "shotgun",
  "lmg",
  "marksman",
  "railgun"
];

export const WEAPON_INFO = {
  sword: {
    name: "Arc Blade",
    icon: "⚔",
    kind: "melee",
    automatic: false,
    localCooldown: 390,
    color: 0x8ce8ff,
    recoil: 0,
    fov: 76
  },
  pistol: {
    name: "Pulse Pistol",
    icon: "◈",
    kind: "gun",
    automatic: false,
    localCooldown: 280,
    color: 0x83ddff,
    recoil: 0.022,
    fov: 70
  },
  smg: {
    name: "Viper SMG",
    icon: "▥",
    kind: "gun",
    automatic: true,
    localCooldown: 68,
    color: 0x72ffc5,
    recoil: 0.014,
    fov: 70
  },
  rifle: {
    name: "Vector Rifle",
    icon: "▰",
    kind: "gun",
    automatic: true,
    localCooldown: 94,
    color: 0xffcf70,
    recoil: 0.018,
    fov: 68
  },
  burst: {
    name: "Trident Burst",
    icon: "≋",
    kind: "gun",
    automatic: false,
    localCooldown: 390,
    color: 0x9aa7ff,
    recoil: 0.032,
    fov: 66
  },
  shotgun: {
    name: "Scatter Cannon",
    icon: "◆",
    kind: "gun",
    automatic: false,
    localCooldown: 820,
    color: 0xff8d65,
    recoil: 0.06,
    fov: 72
  },
  lmg: {
    name: "Titan LMG",
    icon: "▣",
    kind: "gun",
    automatic: true,
    localCooldown: 118,
    color: 0xffb35f,
    recoil: 0.028,
    fov: 69
  },
  marksman: {
    name: "Longshot",
    icon: "✦",
    kind: "gun",
    automatic: false,
    localCooldown: 900,
    color: 0xe8a5ff,
    recoil: 0.045,
    fov: 58
  },
  railgun: {
    name: "Apex Railgun",
    icon: "⌁",
    kind: "gun",
    automatic: false,
    localCooldown: 1450,
    color: 0x65f3ff,
    recoil: 0.075,
    fov: 52
  }
};

export const POWER_INFO = {
  speed: {
    name: "Overdrive",
    short: "SPEED",
    color: 0x56ff9a,
    duration: 12000,
    description: "35% faster movement"
  },
  dash: {
    name: "Blink Core",
    short: "DASH",
    color: 0x6fe7ff,
    duration: 18000,
    description: "Press Q to dash"
  },
  overshield: {
    name: "Aegis Shield",
    short: "SHIELD",
    color: 0x69a7ff,
    duration: 0,
    description: "Gain up to 200 armor"
  },
  rapid: {
    name: "Accelerator",
    short: "RAPID",
    color: 0xffd65e,
    duration: 11000,
    description: "30% faster fire rate"
  },
  damage: {
    name: "Amplifier",
    short: "DAMAGE",
    color: 0xff6363,
    duration: 10000,
    description: "25% more damage"
  },
  regen: {
    name: "Regen Field",
    short: "REGEN",
    color: 0x8dff70,
    duration: 14000,
    description: "Regenerate health"
  },
  jump: {
    name: "Gravity Coil",
    short: "JUMP",
    color: 0xc58cff,
    duration: 14000,
    description: "Higher jumps and air control"
  }
};

export const MOVEMENT = {
  playerRadius: 0.33,
  standHeight: 1.8,
  crouchHeight: 1.22,
  gravity: 22,
  walkSpeed: 5.25,
  sprintSpeed: 8.15,
  crouchSpeed: 3.05,
  slideSpeed: 10.8,
  moveAccel: 38,
  airAccel: 10,
  groundFriction: 13.5,
  airFriction: 1.05,
  jumpSpeed: 7.75,
  arenaRadius: 29,
  coyoteTime: 0.11,
  jumpBuffer: 0.13,
  dashSpeed: 18,
  dashDuration: 0.15
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
  smg: 0x72ffc5,
  burst: 0x9aa7ff,
  shotgun: 0xff8d65,
  lmg: 0xffb35f,
  marksman: 0xe8a5ff,
  railgun: 0x65f3ff,
  speed: 0x56ff9a,
  dash: 0x6fe7ff,
  overshield: 0x69a7ff,
  rapid: 0xffd65e,
  damage: 0xff6363,
  regen: 0x8dff70,
  jump: 0xc58cff
};
