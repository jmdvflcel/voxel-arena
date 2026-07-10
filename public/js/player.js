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
    color: 0x222a35,
    roughness: 0.42,
    metalness: 0.58
  });
  const accentColor = WEAPON_INFO[name]?.color || 0xffffff;
  const accent = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: firstPerson ? 0.42 : 0.2,
    roughness: 0.28,
    metalness: 0.62
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x6b4228,
    roughness: 0.82,
    metalness: 0.02
  });

  if (name === "sword") {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.25, 0.16),
      accent
    );
    blade.position.y = 0.72;

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.32, 4),
      accent
    );
    tip.position.y = 1.5;
    tip.rotation.y = Math.PI / 4;

    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.09, 0.17),
      dark
    );
    guard.position.y = 0.05;

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.44, 0.15),
      wood
    );
    grip.position.y = -0.22;

    group.add(blade, tip, guard, grip);
  } else {
    const sizes = {
      pistol: [0.28, 0.35, 0.82],
      rifle: [0.32, 0.34, 1.5],
      shotgun: [0.36, 0.38, 1.64],
      marksman: [0.31, 0.34, 1.8]
    };

    const [width, height, length] = sizes[name] || sizes.pistol;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, length),
      dark
    );
    body.position.z = -length * 0.18;

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(width * 0.18, width * 0.18, length * 0.56, 10),
      accent
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -length * 0.68);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.7, height * 1.1, length * 0.22),
      wood
    );
    grip.rotation.x = -0.3;
    grip.position.set(0, -height * 0.85, length * 0.05);

    group.add(body, barrel, grip);

    if (name !== "pistol") {
      const stock = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.9, height * 0.72, length * 0.35),
        dark
      );
      stock.position.z = length * 0.52;
      group.add(stock);
    }

    if (name === "marksman") {
      const scope = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.11, 0.58, 12),
        accent
      );
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, height * 0.72, -0.18);
      group.add(scope);
    }
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
      this.label
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
    this.fireKick = 0;
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
    this.weapon.scale.setScalar(name === "sword" ? 0.58 : 0.52);
    this.weapon.rotation.set(
      name === "sword" ? -0.2 : -0.05,
      Math.PI,
      name === "sword" ? -0.55 : 0
    );
    this.weapon.position.set(
      name === "sword" ? 0.22 : 0.12,
      name === "sword" ? -0.22 : -0.08,
      name === "sword" ? -0.15 : -0.08
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
      reloading: Boolean(player.reloading)
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
    this.swing = 1 + combo * 0.08;
  }

  triggerFire() {
    this.fireKick = 1;
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

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4.8);
      const progress = 1 - this.swing;
      this.rightArmPivot.rotation.x = -1.1 + Math.sin(progress * Math.PI) * 2.15;
      this.rightArmPivot.rotation.z = -0.25 + Math.sin(progress * Math.PI) * 0.72;
    } else if (this.blocking && this.weaponName === "sword") {
      this.rightArmPivot.rotation.x += (-1.15 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 15);
      this.rightArmPivot.rotation.z += (-0.85 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 15);
    } else {
      this.rightArmPivot.rotation.x += (-0.72 - this.rightArmPivot.rotation.x) * Math.min(1, dt * 14);
      this.rightArmPivot.rotation.z += (0.05 - this.rightArmPivot.rotation.z) * Math.min(1, dt * 14);
    }

    if (this.fireKick > 0) {
      this.fireKick = Math.max(0, this.fireKick - dt * 8);
      this.weaponHolder.position.z = -0.12 + this.fireKick * 0.16;
    } else {
      this.weaponHolder.position.z += (-0.12 - this.weaponHolder.position.z) * Math.min(1, dt * 16);
    }

    if (this.reloading && this.weaponName !== "sword") {
      this.rightArmPivot.rotation.z = -0.85 + Math.sin(now * 0.012) * 0.08;
      this.weaponHolder.rotation.x = -0.8;
    } else {
      this.weaponHolder.rotation.x += (0 - this.weaponHolder.rotation.x) * Math.min(1, dt * 12);
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.label.material.map.dispose();
    this.label.material.dispose();
  }
}

export class FirstPersonWeapon {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.camera.add(this.root);
    this.models = new Map();
    this.current = "rifle";
    this.recoil = 0;
    this.swing = 0;
    this.reload = 0;
    this.block = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.bob = 0;
    this.aim = 0;

    for (const name of Object.keys(WEAPON_INFO)) {
      const model = createWeaponModel(name, true);
      model.visible = false;
      model.scale.setScalar(name === "sword" ? 0.7 : 0.72);
      this.root.add(model);
      this.models.set(name, model);
    }

    this.setWeapon("rifle");
  }

  setWeapon(name) {
    if (!this.models.has(name)) return;

    for (const model of this.models.values()) {
      model.visible = false;
    }

    this.current = name;
    this.models.get(name).visible = true;
  }

  fire() {
    this.recoil = 1;
  }

  melee(combo) {
    this.swing = 1 + combo * 0.08;
  }

  setReloading(active) {
    this.reload = active ? 1 : 0;
  }

  setBlocking(active) {
    this.block = active ? 1 : 0;
  }

  setAim(active) {
    this.aim += ((active ? 1 : 0) - this.aim) * 0.24;
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

    const moving = movementSpeed > 0.2 && grounded;
    if (moving) this.bob += dt * (7 + movementSpeed * 0.55);

    const bobX = moving ? Math.sin(this.bob) * 0.035 * Math.min(1, movementSpeed / 5) : 0;
    const bobY = moving ? Math.abs(Math.cos(this.bob)) * 0.026 * Math.min(1, movementSpeed / 5) : 0;

    const info = WEAPON_INFO[this.current];
    const isSword = this.current === "sword";
    const hipPosition = isSword
      ? new THREE.Vector3(0.52, -0.52, -0.72)
      : new THREE.Vector3(0.42, -0.42, -0.78);
    const aimPosition = isSword
      ? hipPosition
      : new THREE.Vector3(0.02, -0.31, -0.62);

    const targetPosition = hipPosition.clone().lerp(aimPosition, this.aim);
    targetPosition.x += bobX + this.swayX;
    targetPosition.y -= bobY + this.swayY;
    targetPosition.z += this.recoil * 0.16;

    this.root.position.lerp(targetPosition, Math.min(1, dt * 18));

    const targetRotation = new THREE.Euler(
      -0.08 - this.swayY * 1.8 + this.recoil * 0.12,
      -0.12 - this.swayX * 1.8,
      isSword ? -0.22 : 0.02
    );

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4.4);
      const progress = 1 - this.swing;
      targetRotation.x -= Math.sin(progress * Math.PI) * 0.8;
      targetRotation.z -= Math.sin(progress * Math.PI) * 1.45;
      targetPosition.x -= Math.sin(progress * Math.PI) * 0.2;
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

    this.root.rotation.x += (targetRotation.x - this.root.rotation.x) * Math.min(1, dt * 18);
    this.root.rotation.y += (targetRotation.y - this.root.rotation.y) * Math.min(1, dt * 18);
    this.root.rotation.z += (targetRotation.z - this.root.rotation.z) * Math.min(1, dt * 18);

    this.recoil = Math.max(0, this.recoil - dt * (8 + info.recoil * 30));
  }

  muzzleWorldPosition() {
    const local = this.current === "sword"
      ? new THREE.Vector3(0, 1.5, 0)
      : new THREE.Vector3(0, 0, -1.2);

    return this.models.get(this.current).localToWorld(local);
  }
}
