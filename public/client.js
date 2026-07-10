"use strict";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bcff2);
scene.fog = new THREE.Fog(0x8bcff2, 34, 110);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
camera.rotation.order = "YXZ";
camera.position.set(0, 18, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xcfefff, 0x425b2b, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(45, 70, 35);
scene.add(sun);

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x48a83f }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8a5b32 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x777d82 }),
  wood: new THREE.MeshLambertMaterial({ color: 0x87502b }),
  sand: new THREE.MeshLambertMaterial({ color: 0xd7c37c }),
  leaves: new THREE.MeshLambertMaterial({ color: 0x2d7f35 }),
  glass: new THREE.MeshLambertMaterial({ color: 0xbde9ff, transparent: true, opacity: 0.5 }),
  water: new THREE.MeshLambertMaterial({ color: 0x2d76c9, transparent: true, opacity: 0.55 })
};

const blocks = new Map();
let blockMeshes = [];
const remotePlayers = new Map();
const keys = {};
const velocity = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

let socket;
let myId = null;
let selectedBlock = "grass";
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let canJump = false;
let lastStateSent = 0;
let frameCount = 0;
let fpsTimer = performance.now();

const WORLD_RADIUS = 40;
const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.31;
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 6.6;
const GRAVITY = 22;
const JUMP_POWER = 7.5;

const $ = (id) => document.getElementById(id);
const blockKey = (x, y, z) => `${x},${y},${z}`;

function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function terrainHeight(x, z) {
  return Math.floor(
    Math.sin(x * 0.17) * 3 +
    Math.cos(z * 0.15) * 3 +
    Math.sin((x + z) * 0.075) * 5
  );
}

function addBlock(x, y, z, type) {
  const key = blockKey(x, y, z);
  if (blocks.has(key) || !materials[type]) return;

  const mesh = new THREE.Mesh(blockGeometry, materials[type]);
  mesh.position.set(x, y, z);
  mesh.userData = { x, y, z, type };
  scene.add(mesh);
  blocks.set(key, mesh);
  blockMeshes.push(mesh);
}

function removeBlock(key) {
  const mesh = blocks.get(key);
  if (!mesh) return;
  scene.remove(mesh);
  blocks.delete(key);
  blockMeshes = blockMeshes.filter((item) => item !== mesh);
}

function addTree(x, y, z) {
  for (let i = 0; i < 4; i++) addBlock(x, y + i, z, "wood");
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) + Math.abs(dz) < 4) addBlock(x + dx, y + 4, z + dz, "leaves");
    }
  }
  addBlock(x, y + 5, z, "leaves");
}

function generateWorld() {
  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
      const h = terrainHeight(x, z);
      const beach = h <= 1;
      addBlock(x, h, z, beach ? "sand" : "grass");
      addBlock(x, h - 1, z, beach ? "sand" : "dirt");
      addBlock(x, h - 2, z, beach ? "sand" : "dirt");
      addBlock(x, h - 3, z, "stone");
      if (h < 0) addBlock(x, 0, z, "water");

      const r = hash(x, z);
      if (!beach && r > 0.986 && x % 4 === 0 && z % 4 === 0) addTree(x, h + 1, z);
    }
  }
}

function applyEdits(edits) {
  for (const [key, type] of Object.entries(edits || {})) {
    removeBlock(key);
    if (type) {
      const [x, y, z] = key.split(",").map(Number);
      addBlock(x, y, z, type);
    }
  }
}

function createLabel(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,.58)";
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#fff";
  ctx.font = "25px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 128, 40);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  sprite.scale.set(2.6, 0.65, 1);
  return sprite;
}

function createPlayer(player) {
  if (player.id === myId || remotePlayers.has(player.id)) return;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 1.05, 0.36),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(player.color || "#ffffff") })
  );
  body.position.y = 0.55;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.46),
    new THREE.MeshLambertMaterial({ color: 0xf2c49b })
  );
  head.position.y = 1.34;
  const label = createLabel(player.name || "Player");
  label.position.y = 2.0;
  group.add(body, head, label);
  scene.add(group);
  remotePlayers.set(player.id, group);
}

function updateRemotePlayer(player) {
  if (player.id === myId) return;
  if (!remotePlayers.has(player.id)) createPlayer(player);
  const group = remotePlayers.get(player.id);
  if (!group) return;
  group.position.set(player.x, player.y - PLAYER_HEIGHT, player.z);
  group.rotation.y = player.yaw || 0;
}

function removeRemotePlayer(id) {
  const group = remotePlayers.get(id);
  if (!group) return;
  scene.remove(group);
  remotePlayers.delete(id);
}

function addChat(name, text) {
  const line = document.createElement("div");
  line.textContent = `${name}: ${text}`;
  $("messages").appendChild(line);
  while ($("messages").children.length > 8) $("messages").firstChild.remove();
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => addChat("System", "Connected"));
  socket.addEventListener("close", () => {
    addChat("System", "Disconnected. Reconnecting...");
    setTimeout(connect, 1500);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "init") {
      myId = message.id;
      $("az").textContent = message.az;
      $("instance").textContent = message.instanceId;
      applyEdits(message.edits);
      message.players.forEach(updateRemotePlayer);
      socket.send(JSON.stringify({
        type: "hello",
        name: $("nameInput").value || "EC2 Player"
      }));
    }

    if (message.type === "player_join" || message.type === "player_update") {
      updateRemotePlayer(message.player);
    }

    if (message.type === "state") updateRemotePlayer(message.player);
    if (message.type === "player_leave") removeRemotePlayer(message.id);

    if (message.type === "block") {
      removeBlock(message.key);
      if (message.action === "add") {
        const [x, y, z] = message.key.split(",").map(Number);
        addBlock(x, y, z, message.block);
      }
    }

    if (message.type === "chat") addChat(message.name, message.text);
    $("playerCount").textContent = remotePlayers.size + 1;
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function solidAt(x, y, z) {
  const mesh = blocks.get(blockKey(Math.round(x), Math.round(y), Math.round(z)));
  return mesh && mesh.userData.type !== "water";
}

function collides(x, y, z) {
  const foot = y - PLAYER_HEIGHT;
  const horizontal = [
    [x - PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, z + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z + PLAYER_RADIUS]
  ];
  const vertical = [foot + 0.15, foot + 0.9, y - 0.12];
  return horizontal.some(([sx, sz]) => vertical.some((sy) => solidAt(sx, sy, sz)));
}

function groundHeight() {
  const x = Math.round(camera.position.x);
  const z = Math.round(camera.position.z);
  for (let y = 45; y > -30; y--) {
    const mesh = blocks.get(blockKey(x, y, z));
    if (mesh && mesh.userData.type !== "water") return y + 0.5 + PLAYER_HEIGHT;
  }
  return -99;
}

function updateMovement(dt) {
  let inputX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let inputZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const length = Math.hypot(inputX, inputZ);
  if (length) { inputX /= length; inputZ /= length; }

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

  const speed = keys.ShiftLeft || keys.ShiftRight ? SPRINT_SPEED : WALK_SPEED;
  const target = new THREE.Vector3()
    .add(forward.multiplyScalar(inputZ * speed))
    .add(right.multiplyScalar(inputX * speed));

  velocity.x += (target.x - velocity.x) * Math.min(1, dt * 9);
  velocity.z += (target.z - velocity.z) * Math.min(1, dt * 9);

  const nextX = camera.position.x + velocity.x * dt;
  if (!collides(nextX, camera.position.y, camera.position.z)) camera.position.x = nextX;
  else velocity.x = 0;

  const nextZ = camera.position.z + velocity.z * dt;
  if (!collides(camera.position.x, camera.position.y, nextZ)) camera.position.z = nextZ;
  else velocity.z = 0;

  verticalVelocity -= GRAVITY * dt;
  camera.position.y += verticalVelocity * dt;

  const floor = groundHeight();
  if (camera.position.y < floor) {
    camera.position.y = floor;
    verticalVelocity = 0;
    canJump = true;
  }

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -WORLD_RADIUS + 2, WORLD_RADIUS - 2);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -WORLD_RADIUS + 2, WORLD_RADIUS - 2);
}

function selectBlock(type) {
  selectedBlock = type;
  document.querySelectorAll("#hotbar button").forEach((button) => {
    button.classList.toggle("active", button.dataset.block === type);
  });
}

function handleBlockAction(event) {
  if (document.pointerLockElement !== document.body) {
    document.body.requestPointerLock();
    return;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hit = raycaster.intersectObjects(blockMeshes, false)[0];
  if (!hit || hit.distance > 8) return;

  const target = hit.object;
  const key = blockKey(target.userData.x, target.userData.y, target.userData.z);

  if (event.button === 0 && target.userData.type !== "water") {
    removeBlock(key);
    send({ type: "block", action: "remove", key });
  }

  if (event.button === 2) {
    const normal = hit.face.normal.clone().transformDirection(target.matrixWorld);
    const x = Math.round(target.position.x + normal.x);
    const y = Math.round(target.position.y + normal.y);
    const z = Math.round(target.position.z + normal.z);
    const placeKey = blockKey(x, y, z);
    if (!blocks.has(placeKey)) {
      addBlock(x, y, z, selectedBlock);
      send({ type: "block", action: "add", key: placeKey, block: selectedBlock });
    }
  }
}

$("playButton").addEventListener("click", () => {
  $("loading").style.display = "none";
  document.body.requestPointerLock();
});

document.querySelectorAll("#hotbar button").forEach((button) => {
  button.addEventListener("click", () => selectBlock(button.dataset.block));
});

document.addEventListener("keydown", (event) => {
  if (document.activeElement === $("chatInput")) {
    if (event.code === "Enter") {
      const text = $("chatInput").value.trim();
      if (text) send({ type: "chat", text });
      $("chatInput").value = "";
      $("chatInput").blur();
      document.body.requestPointerLock();
    }
    return;
  }

  keys[event.code] = true;
  if (event.code === "Space" && canJump) {
    verticalVelocity = JUMP_POWER;
    canJump = false;
  }
  if (event.code === "Enter") {
    document.exitPointerLock();
    $("chatInput").focus();
  }

  const map = {
    Digit1: "grass", Digit2: "dirt", Digit3: "stone", Digit4: "wood",
    Digit5: "sand", Digit6: "leaves", Digit7: "glass"
  };
  if (map[event.code]) selectBlock(map[event.code]);
});

document.addEventListener("keyup", (event) => { keys[event.code] = false; });
document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== document.body) return;
  yaw -= event.movementX * 0.0017;
  pitch -= event.movementY * 0.0017;
  pitch = THREE.MathUtils.clamp(pitch, -1.53, 1.53);
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
});
document.addEventListener("mousedown", handleBlockAction);
document.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateMovement(dt);

  const now = performance.now();
  if (now - lastStateSent > 50) {
    send({
      type: "state",
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      yaw,
      pitch
    });
    lastStateSent = now;
  }

  $("position").textContent = [
    Math.round(camera.position.x),
    Math.round(camera.position.y),
    Math.round(camera.position.z)
  ].join(", ");

  frameCount++;
  if (now - fpsTimer >= 1000) {
    $("fps").textContent = frameCount;
    frameCount = 0;
    fpsTimer = now;
  }

  renderer.render(scene, camera);
}

generateWorld();
camera.position.y = groundHeight() + 1;
connect();
animate();
