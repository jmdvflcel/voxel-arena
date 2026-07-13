import * as THREE from "/vendor/three.module.js";
import { TEAM_COLORS, WEAPON_INFO } from "./config.js";

function createCanvasLabel(text, team) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext("2d");

  context.fillStyle = "rgba(5,8,14,.74)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = team === "red" ? "#ff7380" : "#76b8ff";
  context.fillRect(0, 0, canvas.width, 8);

  context.fillStyle = "#fff";
  context.font = "bold 30px ui-monospace,monospace";
  context.textAlign = "center";
  context.fillText(text, canvas.width / 2, 49);

  context.fillStyle = "rgba(255,255,255,.12)";
  context.fillRect(48, 64, 288, 13);

  context.fillStyle = "#5ee27a";
  context.fillRect(48, 64, 288, 13);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.2, 0.8, 1);
  sprite.userData.canvas = canvas;
  sprite.userData.context = context;
  sprite.userData.texture = texture;
  sprite.userData.lastName = text;
  sprite.userData.lastHealth = 100;
  sprite.userData.team = team;

  return sprite;
}

function updateCanvasLabel(sprite, name, health, team) {
  const data = sprite.userData;

  if (data.lastName === name &&
      data.lastHealth === Math.round(health) &&
      data.team === team) {
    return;
  }

  data.lastName = name;
  data.lastHealth = Math.round(health);
  data.team = team;

  const context = data.context;
  const canvas = data.canvas;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(5,8,14,.74)";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = team === "red" ? "#ff7380" : "#76b8ff";
  context.fillRect(0, 0, canvas.width, 8);

  context.fillStyle = "#fff";
  context.font = "bold 30px ui-monospace,monospace";
  context.textAlign = "center";
  context.fillText(name, canvas.width / 2, 49);

  context.fillStyle = "rgba(255,255,255,.12)";
  context.fillRect(48, 64, 288, 13);

  const width = 288 * Math.max(0, Math.min(1, health / 100));
  context.fillStyle = health > 55 ? "#5ee27a" : health > 25 ? "#f1c84b" : "#ef5555";
  context.fillRect(48, 64, width, 13);

  data.texture.needsUpdate = true;
}

function materialForTeam(team) {
  return new THREE.MeshStandardMaterial({
    color: TEAM_COLORS[team] || 0xffffff,
    roughness: 0.58,
    metalness: 0.18
  });
}

function darkMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x1e2632,
    roughness: 0.68,
    metalness: 0.22
  });
}

function skinMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xf0c49f,
    roughness: 0.82
  });
}

export function createWeaponModel(name, firstPerson = false) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({
    color: 0x1b2531,
    roughness: 0.34,
    metalness: 0.68
  });
  const black = new THREE.MeshStandardMaterial({
    color: 0x0d1219,
    roughness: 0.48,
    metalness: 0.5
  });
  const accentColor = WEAPON_INFO[name]?.color || 0xffffff;
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: firstPerson ? 0.55 : 0.25,
    roughness: 0.22,
    metalness: 0.72
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x65412d,
    roughness: 0.8,
    metalness: 0.03
  });

  const addBox = (size, position, material = dark, rotation = null) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  const addBarrel = (radius, length, z, material = accent) => {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 12),
      material
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, z);
    group.add(barrel);
    return barrel;
  };

  if (name === "sword" || name === "voidblade") {
    const rare = name === "voidblade";
    if (rare) {
      accent.color.setHex(0xff35e8);
      accent.emissive.setHex(0x8f006f);
      accent.emissiveIntensity = firstPerson ? 1.25 : 0.75;
    }
    const blade = addBox([rare ? 0.12 : 0.09, rare ? 1.5 : 1.32, 0.17], [0, rare ? 0.84 : 0.75, 0], accent);
    const fuller = addBox([0.025, rare ? 1.2 : 1.05, 0.185], [0, rare ? 0.86 : 0.77, 0], black);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 4), accent);
    tip.position.y = rare ? 1.78 : 1.58;
    tip.rotation.y = Math.PI / 4;
    const guard = addBox([0.62, 0.1, 0.19], [0, 0.05, 0], dark);
    const grip = addBox([0.14, 0.46, 0.16], [0, -0.23, 0], wood);
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), accent);
    pommel.position.y = -0.5;
    group.add(tip, pommel);
    if (rare) {
      const aura = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.035, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xff35e8, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending })
      );
      aura.position.y = 1.02;
      aura.rotation.x = Math.PI / 2;
      group.add(aura);
      group.userData.rareAura = aura;
    }
    group.userData.muzzleLocal = new THREE.Vector3(0, rare ? 1.9 : 1.7, 0);
  } else {
    const profiles = {
      pistol: { w: 0.28, h: 0.34, l: 0.82, barrel: 0.5, stock: 0, mag: 0.25 },
      smg: { w: 0.31, h: 0.34, l: 1.15, barrel: 0.68, stock: 0.28, mag: 0.38 },
      rifle: { w: 0.33, h: 0.35, l: 1.5, barrel: 0.88, stock: 0.45, mag: 0.42 },
      burst: { w: 0.34, h: 0.37, l: 1.55, barrel: 0.92, stock: 0.46, mag: 0.46 },
      shotgun: { w: 0.37, h: 0.39, l: 1.68, barrel: 1.08, stock: 0.5, mag: 0.22 },
      lmg: { w: 0.4, h: 0.43, l: 1.72, barrel: 0.94, stock: 0.5, mag: 0.62 },
      marksman: { w: 0.32, h: 0.34, l: 1.84, barrel: 1.15, stock: 0.54, mag: 0.35 },
      railgun: { w: 0.38, h: 0.4, l: 1.95, barrel: 1.22, stock: 0.52, mag: 0.32 }
    };
    const profile = profiles[name] || profiles.pistol;
    const { w, h, l } = profile;

    addBox([w, h, l * 0.68], [0, 0, -l * 0.16], dark);
    addBox([w * 0.82, h * 0.45, l * 0.72], [0, h * 0.42, -l * 0.2], accent);
    addBarrel(w * 0.16, profile.barrel, -l * 0.58 - profile.barrel * 0.25, accent);
    addBox([w * 0.68, h * 1.05, profile.mag], [0, -h * 0.84, -l * 0.04], wood, [-0.18, 0, 0]);
    addBox([w * 0.45, h * 1.1, l * 0.2], [0, -h * 0.75, l * 0.08], black, [-0.3, 0, 0]);

    if (profile.stock > 0) {
      addBox([w * 0.92, h * 0.75, profile.stock], [0, -h * 0.02, l * 0.46], dark);
    }

    if (["rifle", "burst", "marksman", "railgun"].includes(name)) {
      const scopeLength = name === "marksman" || name === "railgun" ? 0.66 : 0.38;
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(w * 0.23, w * 0.23, scopeLength, 12),
        black
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, h * 0.83, -l * 0.12);
      group.add(scope);
    }

    // Layered rails, sights, receiver panels, and muzzle hardware make the
    // procedural weapons read more clearly in first person without external assets.
    addBox([w * 0.78, 0.035, l * 0.55], [0, h * 0.69, -l * 0.18], black);
    addBox([w * 1.03, h * 0.08, l * 0.18], [0, -h * 0.12, -l * 0.43], accent);
    addBox([w * 0.08, h * 0.22, 0.035], [0, h * 0.78, -l * 0.53], accent);
    addBox([w * 0.12, h * 0.16, 0.035], [0, h * 0.78, l * 0.08], black);

    const muzzleBrake = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.22, w * 0.18, 0.16, 16),
      black
    );
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.position.z = -l * 0.72 - profile.barrel * 0.5;
    group.add(muzzleBrake);

    if (name === "lmg") {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.28, 16), dark);
      drum.rotation.z = Math.PI / 2;
      drum.position.set(0, -0.38, -0.05);
      group.add(drum);
      addBox([0.07, 0.58, 0.07], [-0.2, -0.42, -0.62], black, [0.2, 0, 0.15]);
      addBox([0.07, 0.58, 0.07], [0.2, -0.42, -0.62], black, [0.2, 0, -0.15]);
    }

    if (name === "shotgun") {
      addBox([w * 0.82, h * 0.56, 0.42], [0, -0.08, -0.56], wood);
    }

    if (name === "railgun") {
      addBox([0.08, 0.08, 1.45], [-0.2, 0.2, -0.32], accent);
      addBox([0.08, 0.08, 1.45], [0.2, 0.2, -0.32], accent);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 18), accent);
      coil.rotation.x = Math.PI / 2;
      coil.position.z = -0.83;
      group.add(coil);
    }

    group.userData.muzzleLocal = new THREE.Vector3(0, 0.02, -l * 0.72 - profile.barrel * 0.5);
  }

  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return group;
}

export class RemotePlayer {
  constructor(scene, player, quality) {
    this.scene = scene;
    this.id = player.id;
    this.group = new THREE.Group();
    this.group.position.set(player.x, player.y, player.z);
    this.group.rotation.y = player.yaw || 0;

    this.bodyMaterial = materialForTeam(player.team);
    this.darkMaterial = darkMaterial();
    this.skin = skinMaterial();

    this.torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.92, 0.38),
      this.bodyMaterial
    );
    this.torso.position.y = 1.12;

    this.head = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.48, 0.48),
      this.skin
    );
    this.head.position.y = 1.82;

    this.leftArmPivot = new THREE.Group();
    this.rightArmPivot = new THREE.Group();
    this.leftLegPivot = new THREE.Group();
    this.rightLegPivot = new THREE.Group();

    this.leftArmPivot.position.set(-0.49, 1.48, 0);
    this.rightArmPivot.position.set(0.49, 1.48, 0);
    this.leftLegPivot.position.set(-0.2, 0.72, 0);
    this.rightLegPivot.position.set(0.2, 0.72, 0);

    const leftArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.82, 0.26),
      this.bodyMaterial
    );
    leftArm.position.y = -0.4;

    const rightArm = leftArm.clone();
    rightArm.position.y = -0.4;

    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.74, 0.29),
      this.darkMaterial
    );
    leftLeg.position.y = -0.36;

    const rightLeg = leftLeg.clone();
    rightLeg.position.y = -0.36;

    this.leftArmPivot.add(leftArm);
    this.rightArmPivot.add(rightArm);
    this.leftLegPivot.add(leftLeg);
    this.rightLegPivot.add(rightLeg);

    this.label = createCanvasLabel(player.name, player.team);
    this.label.position.y = 2.55;

    this.powerAura = new THREE.Mesh(
      new THREE.SphereGeometry(0.72, 16, 10),
      new THREE.MeshBasicMaterial({
        color: 0x6fe7ff,
        transparent: true,
        opacity: 0,
        wireframe: true,
        depthWrite: false
      })
    );
    this.powerAura.position.y = 1.05;

    this.weaponHolder = new THREE.Group();
    this.weaponHolder.position.set(0.12, -0.65, -0.12);
    this.rightArmPivot.add(this.weaponHolder);

    this.group.add(
      this.torso,
      this.head,
      this.leftArmPivot,
      this.rightArmPivot,
      this.leftLegPivot,
      this.rightLegPivot,
      this.label,
      this.powerAura
    );

    this.group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = quality.shadows;
        object.receiveShadow = quality.shadows;
      }
    });

    this.scene.add(this.group);

    this.weapon = null;
    this.weaponName = "";
    this.samples = [];
    this.lastRenderedPosition = new THREE.Vector3(player.x, player.y, player.z);
    this.swing = 0;
    this.swingCombo = 0;
    this.fireKick = 0;
    this.fireKickVelocity = 0;
    this.blocking = false;
    this.reloading = false;
    this.alive = player.alive !== false;
    this.team = player.team;
    this.name = player.name;

    this.setWeapon(player.weapon || "rifle");
    this.pushSample(player, performance.now());
  }

  setWeapon(name) {
    if (name === this.weaponName) return;

    if (this.weapon) {
      this.weaponHolder.remove(this.weapon);
    }

    this.weaponName = name;
    this.weapon = createWeaponModel(name);
    this.weapon.scale.setScalar((name === "sword" || name === "voidblade") ? 0.58 : 0.52);
    this.weapon.rotation.set(
      (name === "sword" || name === "voidblade") ? -0.2 : -0.05,
      Math.PI,
      (name === "sword" || name === "voidblade") ? -0.55 : 0
    );
    this.weapon.position.set(
      (name === "sword" || name === "voidblade") ? 0.22 : 0.12,
      (name === "sword" || name === "voidblade") ? -0.22 : -0.08,
      (name === "sword" || name === "voidblade") ? -0.15 : -0.08
    );
    this.weaponHolder.add(this.weapon);
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
      powers: player.powers || {}
    });

    while (this.samples.length > 12) this.samples.shift();

    this.setWeapon(player.weapon || this.weaponName);
    this.name = player.name;
    this.team = player.team;
    this.alive = player.alive !== false;
    this.group.visible = this.alive;
    this.blocking = Boolean(player.blocking);
    this.reloading = Boolean(player.reloading);
    updateCanvasLabel(this.label, player.name, player.health, player.team);
  }

  triggerSwing(combo = 0) {
    this.swing = 1;
    this.swingCombo = Math.max(0, Math.min(2, Number(combo) || 0));
  }

  triggerFire() {
    this.fireKickVelocity += 7.5;
  }

  render(now, dt) {
    if (!this.samples.length) return;

    const renderTime = now - 110;
    let older = this.samples[0];
    let newer = this.samples[this.samples.length - 1];

    for (let i = 0; i < this.samples.length - 1; i++) {
      if (this.samples[i].time <= renderTime &&
          this.samples[i + 1].time >= renderTime) {
        older = this.samples[i];
        newer = this.samples[i + 1];
        break;
      }
    }

    const range = Math.max(1, newer.time - older.time);
    const alpha = THREE.MathUtils.clamp((renderTime - older.time) / range, 0, 1);

    const targetPosition = new THREE.Vector3(
      THREE.MathUtils.lerp(older.x, newer.x, alpha),
      THREE.MathUtils.lerp(older.y, newer.y, alpha),
      THREE.MathUtils.lerp(older.z, newer.z, alpha)
    );

    this.group.position.lerp(targetPosition, Math.min(1, dt * 18));

    let yawDelta = newer.yaw - this.group.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    this.group.rotation.y += yawDelta * Math.min(1, dt * 16);

    const speed = Math.hypot(newer.vx, newer.vz);
    const stride = now * 0.008 * Math.max(1, speed);
    const strideAmount = Math.min(0.75, speed * 0.09);

    this.leftLegPivot.rotation.x = Math.sin(stride) * strideAmount;
    this.rightLegPivot.rotation.x = -Math.sin(stride) * strideAmount;
    this.leftArmPivot.rotation.x = -Math.sin(stride) * strideAmount * 0.62;

    const crouchOffset = newer.crouching || newer.sliding ? -0.36 : 0;
    this.torso.position.y = 1.12 + crouchOffset;
    this.head.position.y = 1.82 + crouchOffset;
    this.label.position.y = 2.55 + crouchOffset;
    const activePowers = newer.powers || {};
    const powerActive = Object.entries(activePowers).some(([key, value]) => key !== "dashReadyAt" && Number(value) > Date.now());
    this.powerAura.material.opacity += ((powerActive ? 0.22 : 0) - this.powerAura.material.opacity) * Math.min(1, dt * 10);
    this.powerAura.rotation.y += dt * 1.8;

    if (this.swing > 0) {
      const duration = this.swingCombo === 2 ? 0.42 : 0.33;
      this.swing = Math.max(0, this.swing - dt / duration);
      const progress = 1 - this.swing;
      const strike = Math.sin(Math.min(1, progress) * Math.PI);
      if (this.swingCombo === 0) {
        this.rightArmPivot.rotation.x = -1.0 + strike * 1.65;
        this.rightArmPivot.rotation.z = -0.82 + progress * 1.55;
      } else if (this.swingCombo === 1) {
        this.rightArmPivot.rotation.x = -0.86 + strike * 1.75;
        this.rightArmPivot.rotation.z = 0.78 - progress * 1.5;
      } else {
        this.rightArmPivot.rotation.x = -2.0 + progress * 2.75;
        this.rightArmPivot.rotation.z = -0.12 + Math.sin(progress * Math.PI * 2) * 0.22;
      }
    } else if (this.blocking && (this.weaponName === "sword" || this.weaponName === "voidblade")) {
      this.rightArmPivot.rotation.x += (-1.15 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 15);
      this.rightArmPivot.rotation.z += (-0.85 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 15);
    } else {
      this.rightArmPivot.rotation.x += (-0.72 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 14);
      this.rightArmPivot.rotation.z += (0.05 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 14);
    }

    // Damped recoil spring for smoother remote gun animation.
    this.fireKickVelocity += (-92 * this.fireKick - 17 * this.fireKickVelocity) * dt;
    this.fireKick += this.fireKickVelocity * dt;
    this.fireKick = THREE.MathUtils.clamp(this.fireKick, -0.08, 0.7);
    this.weaponHolder.position.z += (-0.12 + this.fireKick * 0.14 - this.weaponHolder.position.z) * Math.min(1, dt * 22);

    if (this.reloading && this.weaponName !== "sword") {
      this.rightArmPivot.rotation.z = -0.85 + Math.sin(now * 0.012) * 0.08;
      this.weaponHolder.rotation.x = -0.8;
    } else {
      this.weaponHolder.rotation.x += (0 - this.weaponHolder.rotation.x) * Math.min(1, dt * 12);
    }
  }

  renderLocal(player, now, dt, visible = true) {
    this.group.visible = visible && player.alive !== false;
    if (!this.group.visible) return;

    this.setWeapon(player.weapon || this.weaponName);
    this.name = player.name || this.name;
    this.team = player.team || this.team;
    this.blocking = Boolean(player.blocking);
    this.reloading = Boolean(player.reloading);
    updateCanvasLabel(this.label, this.name, player.health ?? 100, this.team);

    this.group.position.set(player.x, player.y, player.z);
    this.group.rotation.y = player.yaw || 0;

    const speed = Math.hypot(player.vx || 0, player.vz || 0);
    const stride = now * 0.008 * Math.max(1, speed);
    const strideAmount = Math.min(0.75, speed * 0.09);

    this.leftLegPivot.rotation.x = Math.sin(stride) * strideAmount;
    this.rightLegPivot.rotation.x = -Math.sin(stride) * strideAmount;
    this.leftArmPivot.rotation.x = -Math.sin(stride) * strideAmount * 0.62;

    const crouchOffset = player.crouching || player.sliding ? -0.36 : 0;
    this.torso.position.y = 1.12 + crouchOffset;
    this.head.position.y = 1.82 + crouchOffset;
    this.label.position.y = 2.55 + crouchOffset;
    const activePowers = player.powers || {};
    const powerActive = Object.entries(activePowers).some(([key, value]) => key !== "dashReadyAt" && Number(value) > Date.now());
    this.powerAura.material.opacity += ((powerActive ? 0.22 : 0) - this.powerAura.material.opacity) * Math.min(1, dt * 10);
    this.powerAura.rotation.y += dt * 1.8;

    if (this.swing > 0) {
      const duration = this.swingCombo === 2 ? 0.42 : 0.33;
      this.swing = Math.max(0, this.swing - dt / duration);
      const progress = 1 - this.swing;
      const strike = Math.sin(Math.min(1, progress) * Math.PI);
      if (this.swingCombo === 0) {
        this.rightArmPivot.rotation.x = -1.0 + strike * 1.65;
        this.rightArmPivot.rotation.z = -0.82 + progress * 1.55;
      } else if (this.swingCombo === 1) {
        this.rightArmPivot.rotation.x = -0.86 + strike * 1.75;
        this.rightArmPivot.rotation.z = 0.78 - progress * 1.5;
      } else {
        this.rightArmPivot.rotation.x = -2.0 + progress * 2.75;
        this.rightArmPivot.rotation.z = -0.12 + Math.sin(progress * Math.PI * 2) * 0.22;
      }
    } else if (this.blocking && (this.weaponName === "sword" || this.weaponName === "voidblade")) {
      this.rightArmPivot.rotation.x += (-1.15 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 15);
      this.rightArmPivot.rotation.z += (-0.85 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 15);
    } else {
      this.rightArmPivot.rotation.x += (-0.72 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 14);
      this.rightArmPivot.rotation.z += (0.05 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 14);
    }

    this.fireKickVelocity += (-92 * this.fireKick - 17 * this.fireKickVelocity) * dt;
    this.fireKick += this.fireKickVelocity * dt;
    this.fireKick = THREE.MathUtils.clamp(this.fireKick, -0.08, 0.7);
    this.weaponHolder.position.z += (-0.12 + this.fireKick * 0.14 - this.weaponHolder.position.z) * Math.min(1, dt * 22);

    if (this.reloading && this.weaponName !== "sword") {
      this.rightArmPivot.rotation.z = -0.85 + Math.sin(now * 0.012) * 0.08;
      this.weaponHolder.rotation.x += (-0.8 - this.weaponHolder.rotation.x) * Math.min(1, dt * 14);
    } else {
      this.weaponHolder.rotation.x += (0 - this.weaponHolder.rotation.x) * Math.min(1, dt * 12);
    }
  }

  muzzleWorldPosition() {
    this.group.updateMatrixWorld(true);
    if (!this.weapon) {
      return new THREE.Vector3(this.group.position.x, this.group.position.y + 1.45, this.group.position.z);
    }

    const local = this.weapon.userData.muzzleLocal
      ? this.weapon.userData.muzzleLocal.clone()
      : (this.weaponName === "sword" || this.weaponName === "voidblade") ? new THREE.Vector3(0, 1.45, 0) : new THREE.Vector3(0, 0, -1.25);

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
  pistol: [0.34, -0.39, -0.67], smg: [0.41, -0.43, -0.8], rifle: [0.43, -0.43, -0.84],
  burst: [0.43, -0.43, -0.84], shotgun: [0.45, -0.46, -0.88], lmg: [0.47, -0.48, -0.9],
  marksman: [0.43, -0.43, -0.88], railgun: [0.45, -0.46, -0.92]
});

const FP_AIM_LAYOUTS = Object.freeze({
  pistol: [0.0, -0.285, -0.55], smg: [0.0, -0.29, -0.59], rifle: [0.0, -0.305, -0.61],
  burst: [0.0, -0.305, -0.61], shotgun: [0.0, -0.32, -0.64], lmg: [0.0, -0.32, -0.65],
  marksman: [0.0, -0.34, -0.7], railgun: [0.0, -0.35, -0.72]
});

export class FirstPersonWeapon {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.models = new Map();
    this.current = "rifle";
    this.swing = 0;
    this.swingCombo = 0;
    this.swingDuration = 0.33;
    this.reload = 0;
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
    this.switchBlend = 1;
    this.muzzlePulse = 0;
    this.hipPosition = new THREE.Vector3();
    this.aimPosition = new THREE.Vector3();
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();

    const sleeve = new THREE.MeshStandardMaterial({ color: 0x26374b, roughness: 0.72 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xefc29e, roughness: 0.84 });
    this.leftForearm = new THREE.Group();
    this.rightForearm = new THREE.Group();
    const makeArm = () => {
      const arm = new THREE.Group();
      const sleeveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.56), sleeve);
      sleeveMesh.position.z = 0.2;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.15, 0.2), skin);
      hand.position.z = -0.18;
      arm.add(sleeveMesh, hand);
      return arm;
    };
    this.leftForearm = makeArm();
    this.rightForearm = makeArm();
    this.leftForearm.position.set(-0.24, -0.23, -0.45);
    this.rightForearm.position.set(0.31, -0.28, -0.42);
    this.leftForearm.rotation.set(-0.3, 0.1, 0.08);
    this.rightForearm.rotation.set(-0.25, -0.1, -0.08);
    this.root.add(this.leftForearm, this.rightForearm);

    for (const name of Object.keys(WEAPON_INFO)) {
      const model = createWeaponModel(name, true);
      model.visible = false;
      const scale = (name === "sword" || name === "voidblade") ? 0.7 : name === "railgun" || name === "lmg" ? 0.62 : 0.72;
      model.scale.setScalar(scale);
      this.root.add(model);
      this.models.set(name, model);
    }

    this.setWeapon("rifle");
  }

  setVisible(visible) {
    this.root.visible = Boolean(visible);
  }

  setWeapon(name) {
    if (!this.models.has(name)) return;

    for (const model of this.models.values()) {
      model.visible = false;
    }

    this.current = name;
    this.models.get(name).visible = true;
    this.switchBlend = 0;
  }

  fire() {
    const info = WEAPON_INFO[this.current] || WEAPON_INFO.rifle;
    const impulse = 5.6 + info.recoil * 78;
    this.recoilVelocity += impulse;
    this.recoilYawVelocity += (Math.random() - 0.5) * (1.3 + info.recoil * 15);
    this.muzzlePulse = 1;
  }

  melee(combo) {
    this.swingCombo = Math.max(0, Math.min(2, Number(combo) || 0));
    this.swingDuration = this.swingCombo === 2 ? 0.42 : 0.33;
    this.swing = 1;
  }

  setReloading(active) {
    this.reload = active ? 1 : 0;
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

  update(dt, movementSpeed, grounded, aiming) {
    const model = this.models.get(this.current);
    if (!model) return;

    this.swayX *= Math.pow(0.03, dt);
    this.swayY *= Math.pow(0.03, dt);
    this.setAim(aiming);
    this.aim += (this.targetAim - this.aim) * (1 - Math.exp(-dt * 15));
    this.switchBlend += (1 - this.switchBlend) * (1 - Math.exp(-dt * 13));

    // Critically damped recoil springs make automatic fire feel fluid instead
    // of snapping the gun instantly between two poses.
    this.recoilVelocity += (-118 * this.recoilPosition - 19 * this.recoilVelocity) * dt;
    this.recoilPosition += this.recoilVelocity * dt;
    this.recoilYawVelocity += (-105 * this.recoilYaw - 18 * this.recoilYawVelocity) * dt;
    this.recoilYaw += this.recoilYawVelocity * dt;
    this.recoilPosition = THREE.MathUtils.clamp(this.recoilPosition, -0.12, 1.1);
    this.recoilYaw = THREE.MathUtils.clamp(this.recoilYaw, -0.16, 0.16);

    const moving = movementSpeed > 0.2 && grounded;
    if (moving) this.bob += dt * (7 + movementSpeed * 0.55);

    const bobX = moving ? Math.sin(this.bob) * 0.035 * Math.min(1, movementSpeed / 5) : 0;
    const bobY = moving ? Math.abs(Math.cos(this.bob)) * 0.026 * Math.min(1, movementSpeed / 5) : 0;

    const isSword = this.current === "sword" || this.current === "voidblade";
    const hip = FP_HIP_LAYOUTS[this.current] || [0.42, -0.42, -0.78];
    const ads = FP_AIM_LAYOUTS[this.current] || [0.0, -0.31, -0.62];
    if (isSword) {
      this.hipPosition.set(0.52, -0.52, -0.72);
      this.aimPosition.copy(this.hipPosition);
    } else {
      this.hipPosition.set(hip[0], hip[1], hip[2]);
      this.aimPosition.set(ads[0], ads[1], ads[2]);
    }

    const targetPosition = this.targetPosition.copy(this.hipPosition).lerp(this.aimPosition, this.aim);
    targetPosition.x += bobX + this.swayX + this.recoilYaw * 0.16;
    targetPosition.y -= bobY + this.swayY;
    targetPosition.z += this.recoilPosition * 0.095;
    targetPosition.y -= (1 - this.switchBlend) * 0.34;

    const hipYaw = -0.12 - this.swayX * 1.8 + this.recoilYaw;
    const targetRotation = this.targetRotation.set(
      -0.08 - this.swayY * 1.8 + this.recoilPosition * 0.075,
      THREE.MathUtils.lerp(hipYaw, this.recoilYaw * 0.32, this.aim),
      isSword ? -0.22 : THREE.MathUtils.lerp(0.02, 0, this.aim)
    );

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt / this.swingDuration);
      const progress = 1 - this.swing;
      const strike = Math.sin(Math.min(1, progress) * Math.PI);
      const windup = Math.min(1, progress / 0.18);
      if (this.swingCombo === 0) {
        targetRotation.x -= strike * 0.58;
        targetRotation.y -= strike * 0.28;
        targetRotation.z += 0.82 - progress * 1.82;
        targetPosition.x -= strike * 0.23;
      } else if (this.swingCombo === 1) {
        targetRotation.x -= strike * 0.7;
        targetRotation.y += strike * 0.3;
        targetRotation.z += -0.92 + progress * 1.9;
        targetPosition.x += strike * 0.2;
      } else {
        targetRotation.x += -1.35 + progress * 2.25;
        targetRotation.z -= strike * 0.28;
        targetPosition.y += (1 - windup) * 0.2 - strike * 0.27;
        targetPosition.z -= strike * 0.16;
      }
    }

    if (this.block > 0 && isSword) {
      targetRotation.x = -0.9;
      targetRotation.z = -1.05;
      targetPosition.set(0.12, -0.18, -0.56);
    }

    if (this.reload > 0 && !isSword) {
      targetRotation.x = -0.8 + Math.sin(performance.now() * 0.012) * 0.08;
      targetRotation.z = -0.65;
      targetPosition.set(0.18, -0.7, -0.55);
    }

    this.muzzlePulse = Math.max(0, this.muzzlePulse - dt * 12);
    const handKick = this.recoilPosition * 0.035;
    this.rightForearm.position.z += ((-0.42 + handKick) - this.rightForearm.position.z) * (1 - Math.exp(-dt * 24));
    this.leftForearm.position.z += ((-0.45 + handKick * 0.55) - this.leftForearm.position.z) * (1 - Math.exp(-dt * 20));
    this.leftForearm.visible = !isSword;
    this.rightForearm.visible = true;
    const adsHandShift = this.aim * 0.08;
    this.leftForearm.position.x += ((-0.24 + adsHandShift) - this.leftForearm.position.x) * (1 - Math.exp(-dt * 18));
    this.rightForearm.position.x += ((0.31 - adsHandShift) - this.rightForearm.position.x) * (1 - Math.exp(-dt * 18));

    if (model.userData.rareAura) {
      model.userData.rareAura.rotation.z += dt * 2.8;
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
    const local = model.userData.muzzleLocal
      ? model.userData.muzzleLocal.clone()
      : (this.current === "sword" || this.current === "voidblade") ? new THREE.Vector3(0, 1.7, 0) : new THREE.Vector3(0, 0, -1.2);

    this.camera.updateMatrixWorld(true);
    return model.localToWorld(local);
  }
}

