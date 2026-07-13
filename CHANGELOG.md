const STORAGE_PREFIX = "voxelArenaV8";

export const DEFAULT_KEYBINDS = Object.freeze({
  forward: "KeyW",
  backward: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  sprint: "ShiftLeft",
  crouch: "KeyC",
  grapple: "KeyE",
  dash: "KeyQ",
  reload: "KeyR",
  camera: "KeyV",
  interact: "KeyF",
  heavy: "ShiftLeft"
});

export class InputBindings {
  constructor(saved = {}) {
    this.bindings = { ...DEFAULT_KEYBINDS, ...(saved || {}) };
    this.down = new Set();
  }

  set(action, code) {
    if (!Object.hasOwn(DEFAULT_KEYBINDS, action) || typeof code !== "string" || !code) return false;
    for (const [otherAction, otherCode] of Object.entries(this.bindings)) {
      if (otherAction !== action && otherCode === code) this.bindings[otherAction] = DEFAULT_KEYBINDS[otherAction];
    }
    this.bindings[action] = code;
    return true;
  }

  actionForCode(code) {
    return Object.keys(this.bindings).find((action) => this.bindings[action] === code) || null;
  }

  setCode(code, active) {
    if (active) this.down.add(code);
    else this.down.delete(code);
  }

  active(action) {
    const code = this.bindings[action];
    return Boolean(code && this.down.has(code));
  }

  clear() {
    this.down.clear();
  }

  serialize() {
    return { ...this.bindings };
  }
}

export class GamepadController {
  constructor() {
    this.enabled = true;
    this.index = null;
    this.previousButtons = [];
    this.state = this.emptyState();
  }

  emptyState() {
    return {
      connected: false,
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      jump: false,
      sprint: false,
      crouch: false,
      fire: false,
      aim: false,
      reloadPressed: false,
      grapplePressed: false,
      dashPressed: false,
      cameraPressed: false,
      nextWeaponPressed: false,
      previousWeaponPressed: false
    };
  }

  deadzone(value, zone = 0.16) {
    const magnitude = Math.abs(value);
    if (magnitude <= zone) return 0;
    return Math.sign(value) * (magnitude - zone) / (1 - zone);
  }

  pressed(buttons, index) {
    const active = Boolean(buttons[index]?.pressed);
    const previous = Boolean(this.previousButtons[index]);
    return active && !previous;
  }

  poll() {
    if (!this.enabled || !navigator.getGamepads) {
      this.state = this.emptyState();
      return this.state;
    }

    const pads = Array.from(navigator.getGamepads()).filter(Boolean);
    let pad = this.index == null ? pads[0] : pads.find((candidate) => candidate.index === this.index);
    if (!pad) pad = pads[0];
    if (!pad) {
      this.index = null;
      this.previousButtons = [];
      this.state = this.emptyState();
      return this.state;
    }

    this.index = pad.index;
    const buttons = pad.buttons;
    const state = {
      connected: true,
      moveX: this.deadzone(pad.axes[0] || 0),
      moveY: this.deadzone(pad.axes[1] || 0),
      lookX: this.deadzone(pad.axes[2] || 0, 0.12),
      lookY: this.deadzone(pad.axes[3] || 0, 0.12),
      jump: Boolean(buttons[0]?.pressed),
      crouch: Boolean(buttons[1]?.pressed),
      reloadPressed: this.pressed(buttons, 2),
      cameraPressed: this.pressed(buttons, 3),
      grapplePressed: this.pressed(buttons, 4),
      dashPressed: this.pressed(buttons, 5),
      aim: Boolean(buttons[6]?.pressed),
      fire: Boolean(buttons[7]?.pressed),
      previousWeaponPressed: this.pressed(buttons, 14),
      nextWeaponPressed: this.pressed(buttons, 15),
      sprint: Boolean(buttons[10]?.pressed) || Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.92
    };

    this.previousButtons = buttons.map((button) => Boolean(button.pressed));
    this.state = state;
    return state;
  }
}

export class ProgressionStore {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
  }

  defaults() {
    return {
      xp: 0,
      level: 1,
      lifetime: {
        kills: 0,
        assists: 0,
        deaths: 0,
        damage: 0,
        headshots: 0,
        captures: 0,
        wins: 0,
        grapples: 0,
        parries: 0
      },
      challenges: {
        eliminator: { label: "Eliminate 25 opponents", current: 0, target: 25, reward: 350, complete: false },
        sharpshooter: { label: "Land 15 headshots", current: 0, target: 15, reward: 300, complete: false },
        pathfinder: { label: "Use the grapple 40 times", current: 0, target: 40, reward: 250, complete: false },
        guardian: { label: "Capture or defend objectives 10 times", current: 0, target: 10, reward: 300, complete: false }
      },
      unlockedSkins: ["standard"],
      selectedSkin: "standard"
    };
  }

  load() {
    const fallback = this.defaults();
    try {
      const parsed = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:progression`) || "null");
      if (!parsed) return fallback;
      return {
        ...fallback,
        ...parsed,
        lifetime: { ...fallback.lifetime, ...(parsed.lifetime || {}) },
        challenges: { ...fallback.challenges, ...(parsed.challenges || {}) },
        unlockedSkins: Array.isArray(parsed.unlockedSkins) ? parsed.unlockedSkins : fallback.unlockedSkins
      };
    } catch {
      return fallback;
    }
  }

  save() {
    localStorage.setItem(`${STORAGE_PREFIX}:progression`, JSON.stringify(this.data));
    for (const listener of this.listeners) listener(this.data);
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  xpForLevel(level) {
    return 500 + Math.max(0, level - 1) * 175;
  }

  addXp(amount) {
    let gained = Math.max(0, Math.round(Number(amount) || 0));
    this.data.xp += gained;
    let leveled = false;
    while (this.data.xp >= this.xpForLevel(this.data.level)) {
      this.data.xp -= this.xpForLevel(this.data.level);
      this.data.level += 1;
      leveled = true;
      if (this.data.level >= 3 && !this.data.unlockedSkins.includes("carbon")) this.data.unlockedSkins.push("carbon");
      if (this.data.level >= 6 && !this.data.unlockedSkins.includes("neon")) this.data.unlockedSkins.push("neon");
      if (this.data.level >= 10 && !this.data.unlockedSkins.includes("royal")) this.data.unlockedSkins.push("royal");
    }
    this.save();
    return leveled;
  }

  record(stat, amount = 1) {
    if (!Object.hasOwn(this.data.lifetime, stat)) return { completed: [] };
    const value = Math.max(0, Number(amount) || 0);
    this.data.lifetime[stat] += value;
    const map = {
      kills: "eliminator",
      headshots: "sharpshooter",
      grapples: "pathfinder",
      captures: "guardian"
    };
    const challengeName = map[stat];
    const completed = [];
    if (challengeName) {
      const challenge = this.data.challenges[challengeName];
      if (challenge && !challenge.complete) {
        challenge.current = Math.min(challenge.target, challenge.current + value);
        if (challenge.current >= challenge.target) {
          challenge.complete = true;
          completed.push({ name: challengeName, ...challenge });
          this.data.xp += challenge.reward;
        }
      }
    }
    this.save();
    return { completed };
  }

  setSkin(name) {
    if (!this.data.unlockedSkins.includes(name)) return false;
    this.data.selectedSkin = name;
    this.save();
    return true;
  }
}

export class DamageDirectionSystem {
  constructor(container) {
    this.container = container;
    this.indicators = [];
  }

  add(relativeAngle, armor = false, intensity = 1) {
    if (!this.container) return;
    const indicator = document.createElement("i");
    indicator.className = armor ? "armor-hit" : "health-hit";
    indicator.style.setProperty("--angle", `${relativeAngle}rad`);
    indicator.style.setProperty("--strength", String(Math.max(0.35, Math.min(1.4, intensity))));
    indicator.dataset.expires = String(performance.now() + 820);
    this.container.appendChild(indicator);
    this.indicators.push(indicator);
    while (this.indicators.length > 8) this.indicators.shift()?.remove();
  }

  update(now = performance.now()) {
    this.indicators = this.indicators.filter((indicator) => {
      const alive = now < Number(indicator.dataset.expires || 0);
      if (!alive) indicator.remove();
      return alive;
    });
  }
}

export function hermiteScalar(p0, p1, v0, v1, alpha, seconds) {
  const t = Math.max(0, Math.min(1, alpha));
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * v0 * seconds + h01 * p1 + h11 * v1 * seconds;
}

export function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
