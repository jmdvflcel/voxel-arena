import * as THREE from "/vendor/three.module.js";
import { COLLIDERS, MOVEMENT, PICKUP_COLORS, WEAPON_INFO, POWER_INFO, GRAPPLE_ANCHORS } from "./config.js";

const CHUNK_SIZE = 12;

function seededNoise(x, y, seed = 1) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function makePixelTexture(base, accent, seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.fillStyle = base;
  context.fillRect(0, 0, 128, 128);

  for (let y = 0; y < 128; y += 3) {
    for (let x = 0; x < 128; x += 3) {
      const noise = seededNoise(x, y, seed);
      if (noise > 0.58) {
        context.globalAlpha = 0.18 + noise * 0.2;
        context.fillStyle = accent;
        context.fillRect(x, y, 3, 3);
      }
    }
  }

  context.globalAlpha = 1;
  context.strokeStyle = "rgba(255,255,255,.05)";
  for (let i = 0; i <= 128; i += 16) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 128);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(128, i);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function createMaterials() {
  const stone = makePixelTexture("#66717c", "#9aa5b0", 4);
  const darkStone = makePixelTexture("#303945", "#4d5a67", 9);
  const grass = makePixelTexture("#3c824c", "#7cb76f", 12);
  const dirt = makePixelTexture("#6c4b36", "#9a7653", 15);
  const metal = makePixelTexture("#4f5866", "#94a0ad", 20);

  return {
    grass: new THREE.MeshStandardMaterial({
      map: grass,
      bumpMap: grass,
      bumpScale: 0.045,
      roughness: 0.86,
      metalness: 0.02
    }),
    dirt: new THREE.MeshStandardMaterial({
      map: dirt,
      bumpMap: dirt,
      bumpScale: 0.06,
      roughness: 0.94
    }),
    stone: new THREE.MeshStandardMaterial({
      map: stone,
      bumpMap: stone,
      bumpScale: 0.08,
      roughness: 0.7,
      metalness: 0.08
    }),
    darkStone: new THREE.MeshStandardMaterial({
      map: darkStone,
      bumpMap: darkStone,
      bumpScale: 0.07,
      roughness: 0.58,
      metalness: 0.16
    }),
    metal: new THREE.MeshStandardMaterial({
      map: metal,
      bumpMap: metal,
      bumpScale: 0.025,
      roughness: 0.31,
      metalness: 0.62
    }),
    red: new THREE.MeshStandardMaterial({
      color: 0x8e2433,
      roughness: 0.55,
      metalness: 0.12
    }),
    blue: new THREE.MeshStandardMaterial({
      color: 0x225f9d,
      roughness: 0.55,
      metalness: 0.12
    }),
    glowRed: new THREE.MeshStandardMaterial({
      color: 0xff5968,
      emissive: 0xff2438,
      emissiveIntensity: 1.8,
      roughness: 0.35
    }),
    glowBlue: new THREE.MeshStandardMaterial({
      color: 0x5aa9ff,
      emissive: 0x1667c4,
      emissiveIntensity: 1.8,
      roughness: 0.35
    })
  };
}

function chunkKey(x, z) {
  return `${Math.floor((x + 48) / CHUNK_SIZE)},${Math.floor((z + 48) / CHUNK_SIZE)}`;
}

function addInstance(store, material, x, y, z, scaleX = 1, scaleY = 1, scaleZ = 1) {
  const key = `${chunkKey(x, z)}:${material}`;
  if (!store.has(key)) store.set(key, []);
  store.get(key).push({ x, y, z, scaleX, scaleY, scaleZ, material });
}

function fillColliderBlocks(store, collider, material) {
  const minX = Math.ceil(collider.minX);
  const maxX = Math.floor(collider.maxX - 0.001);
  const minZ = Math.ceil(collider.minZ);
  const maxZ = Math.floor(collider.maxZ - 0.001);
  const minY = Math.ceil(collider.minY);
  const maxY = Math.floor(collider.maxY - 0.001);

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let y = minY; y <= maxY; y++) {
        addInstance(store, material, x + 0.5, y + 0.5, z + 0.5);
      }
    }
  }
}

function buildInstanceMeshes(scene, store, materials, quality) {
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const meshes = [];
  const dummy = new THREE.Object3D();

  for (const [key, items] of store) {
    const materialName = key.split(":").pop();
    const mesh = new THREE.InstancedMesh(cube, materials[materialName], items.length);
    mesh.castShadow = quality.shadows;
    mesh.receiveShadow = quality.shadows;
    mesh.frustumCulled = true;

    items.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.scale.set(item.scaleX, item.scaleY, item.scaleZ);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  return meshes;
}

function createBanner(scene, team, x, z, rotationY, materials) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 4.6, 8),
    materials.metal
  );
  pole.position.y = 2.3;
  pole.castShadow = true;

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 2.2, 4, 5),
    team === "red" ? materials.red : materials.blue
  );
  banner.position.set(0.9, 3.2, 0);
  banner.castShadow = true;

  group.add(pole, banner);
  group.position.set(x, 0, z);
  group.rotation.y = rotationY;
  scene.add(group);
  return group;
}

function createArenaLights(scene) {
  const lights = [];

  const positions = [
    [-20, 4.5, -14, 0xff5968],
    [-20, 4.5, 14, 0xff5968],
    [20, 4.5, -14, 0x5aa9ff],
    [20, 4.5, 14, 0x5aa9ff]
  ];

  for (const [x, y, z, color] of positions) {
    const light = new THREE.PointLight(color, 2.2, 18, 2);
    light.position.set(x, y, z);
    scene.add(light);
    lights.push(light);
  }

  return lights;
}

function buildFloor(store) {
  const radius = MOVEMENT.arenaRadius;

  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) {
      const distance = Math.hypot(x, z);
      if (distance > radius) continue;

      let material = "grass";

      if (distance > radius - 3) material = "darkStone";
      if (Math.abs(x) < 4 || Math.abs(z) < 4) material = "stone";
      if ((x + z) % 11 === 0 && distance < radius - 5) material = "dirt";

      addInstance(store, material, x, -0.5, z);

      if (distance > radius - 1.2) {
        addInstance(store, "darkStone", x, 0.5, z);
        addInstance(store, "darkStone", x, 1.5, z);
      }
    }
  }
}

function buildDecorations(scene, materials, quality) {
  const groups = [];

  for (let index = 0; index < 26; index++) {
    const angle = index / 26 * Math.PI * 2;
    const radius = 24.8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 3.4, 6),
      materials.metal
    );
    post.position.set(x, 2.2, z);
    post.castShadow = quality.shadows;
    scene.add(post);
    groups.push(post);
  }

  groups.push(createBanner(scene, "red", -22, -4, Math.PI / 2, materials));
  groups.push(createBanner(scene, "red", -22, 4, Math.PI / 2, materials));
  groups.push(createBanner(scene, "blue", 22, -4, -Math.PI / 2, materials));
  groups.push(createBanner(scene, "blue", 22, 4, -Math.PI / 2, materials));

  return groups;
}

function createGrappleAnchors(scene, materials, quality) {
  const groups = [];
  for (const anchor of GRAPPLE_ANCHORS) {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.42, 1),
      new THREE.MeshStandardMaterial({
        color: 0x8beaff,
        emissive: 0x1aaee8,
        emissiveIntensity: 2.2,
        roughness: 0.22,
        metalness: 0.7
      })
    );
    const ringA = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.055, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0x72dfff, transparent: true, opacity: 0.82 })
    );
    const ringB = ringA.clone();
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.y = Math.PI / 2;
    const light = new THREE.PointLight(0x5edaff, 2.4, 10, 2);
    group.add(core, ringA, ringB, light);
    group.position.set(anchor.x, anchor.y, anchor.z);
    group.traverse((object) => { if (object.isMesh) object.castShadow = quality.shadows; });
    group.userData.ringA = ringA;
    group.userData.ringB = ringB;
    group.userData.phase = Math.random() * Math.PI * 2;
    scene.add(group);
    groups.push(group);
  }
  return groups;
}

export function buildWorld(scene, quality) {
  const materials = createMaterials();
  const store = new Map();

  buildFloor(store);

  COLLIDERS.forEach((collider, index) => {
    fillColliderBlocks(store, collider, index === 0 ? "darkStone" : "stone");
  });

  for (let y = 0; y < 3; y++) {
    addInstance(store, "red", -25.8, y + 0.5, -3);
    addInstance(store, "red", -25.8, y + 0.5, 3);
    addInstance(store, "blue", 25.8, y + 0.5, -3);
    addInstance(store, "blue", 25.8, y + 0.5, 3);
  }

  const meshes = buildInstanceMeshes(scene, store, materials, quality);
  const decorations = buildDecorations(scene, materials, quality);
  const lights = createArenaLights(scene);
  const grappleAnchors = createGrappleAnchors(scene, materials, quality);

  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(MOVEMENT.arenaRadius + 0.8, MOVEMENT.arenaRadius + 0.8, 1.2, 96),
    materials.darkStone
  );
  ground.position.y = -1.15;
  ground.receiveShadow = quality.shadows;
  scene.add(ground);

  return {
    meshes,
    collisionMeshes: meshes,
    decorations,
    lights,
    grappleAnchors,
    materials,
    ground
  };
}

export function circleAabbOverlap(x, z, radius, box) {
  const closestX = Math.max(box.minX, Math.min(box.maxX, x));
  const closestZ = Math.max(box.minZ, Math.min(box.maxZ, z));
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz < radius * radius;
}

export function collidingBox(position, crouching) {
  const height = crouching ? MOVEMENT.crouchHeight : MOVEMENT.standHeight;

  for (const box of COLLIDERS) {
    if (position.y < box.maxY &&
        position.y + height > box.minY &&
        circleAabbOverlap(position.x, position.z, MOVEMENT.playerRadius, box)) {
      return box;
    }
  }

  return null;
}

export function supportHeight(x, z, currentY) {
  let support = 0;

  for (const box of COLLIDERS) {
    if (currentY + 1.3 >= box.maxY &&
        circleAabbOverlap(x, z, MOVEMENT.playerRadius * 0.8, box)) {
      support = Math.max(support, box.maxY);
    }
  }

  return support;
}

function createPickupLabel(pickup, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  const text = pickup.type === "weapon"
    ? WEAPON_INFO[pickup.weapon]?.name || pickup.weapon
    : pickup.type === "power"
      ? POWER_INFO[pickup.power]?.name || pickup.power
      : pickup.type.toUpperCase();

  context.fillStyle = "rgba(4,8,14,.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  context.lineWidth = 4;
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
  context.fillStyle = "white";
  context.font = "bold 27px ui-monospace,monospace";
  context.textAlign = "center";
  context.fillText(text, canvas.width / 2, 44);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false
  }));
  sprite.scale.set(2.8, 0.63, 1);
  sprite.position.y = 1.25;
  return sprite;
}

export class PickupRenderer {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.items = new Map();
    this.geometry = new THREE.OctahedronGeometry(0.45, 0);
  }

  create(pickup) {
    const colorKey = pickup.type === "weapon" ? pickup.weapon : pickup.type === "power" ? pickup.power : pickup.type;
    const color = PICKUP_COLORS[colorKey] || 0xffffff;
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.25,
      metalness: 0.35,
      roughness: 0.22
    });

    const group = new THREE.Group();
    const coreGeometry = pickup.rare
      ? new THREE.OctahedronGeometry(0.62, 2)
      : pickup.type === "power"
        ? new THREE.IcosahedronGeometry(0.48, 1)
        : this.geometry;
    const core = new THREE.Mesh(coreGeometry, material);
    core.castShadow = this.quality.shadows;

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.055, 8, 28),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8
      })
    );
    ring.rotation.x = Math.PI / 2;

    const light = new THREE.PointLight(color, 1.7, 7, 2);
    light.position.y = 0.45;

    const label = createPickupLabel(pickup, color);
    group.add(core, ring, light, label);
    group.position.set(pickup.x, pickup.y, pickup.z);
    group.visible = pickup.active;
    group.userData.baseY = pickup.y;
    group.userData.phase = Math.random() * Math.PI * 2;
    group.userData.type = pickup.type;
    group.userData.power = pickup.power || null;
    group.userData.rare = Boolean(pickup.rare);
    this.scene.add(group);
    this.items.set(pickup.id, group);
  }

  setPickups(pickups) {
    for (const pickup of pickups) {
      if (!this.items.has(pickup.id)) this.create(pickup);
      this.setActive(pickup.id, pickup.active);
    }
  }

  setActive(id, active) {
    const group = this.items.get(id);
    if (group) group.visible = active;
  }

  updatePickup(pickup) {
    if (!this.items.has(pickup.id)) this.create(pickup);
    const group = this.items.get(pickup.id);
    if (!group) return;
    group.visible = Boolean(pickup.active);
    if (Number.isFinite(pickup.x) && Number.isFinite(pickup.y) && Number.isFinite(pickup.z)) {
      group.position.set(pickup.x, pickup.y, pickup.z);
      group.userData.baseY = pickup.y;
    }
  }

  update(time) {
    for (const group of this.items.values()) {
      group.rotation.y = time * 1.2 + group.userData.phase;
      group.position.y = group.userData.baseY + Math.sin(time * 2 + group.userData.phase) * 0.14;
      const ring = group.children[1];
      ring.rotation.z = time * (group.userData.type === "power" ? 1.7 : 0.8);
      if (group.userData.type === "power" || group.userData.rare) {
        const pulse = 1 + Math.sin(time * (group.userData.rare ? 6 : 4) + group.userData.phase) * (group.userData.rare ? 0.16 : 0.1);
        group.children[0].scale.setScalar(pulse);
      }
    }
  }
}

export function createSky(scene) {
  const geometry = new THREE.SphereGeometry(180, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x2d5f95) },
      bottomColor: { value: new THREE.Color(0xb9e6ff) },
      offset: { value: 28 },
      exponent: { value: 0.65 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `
  });

  const sky = new THREE.Mesh(geometry, material);
  scene.add(sky);
  return sky;
}
