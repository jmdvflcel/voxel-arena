"use strict";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bcff2);
scene.fog = new THREE.Fog(0x8bcff2, 32, 105);

const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.1, 400);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd7f1ff, 0x384a28, 1.05));

const sun = new THREE.DirectionalLight(0xffffff, 1.12);
sun.position.set(45, 70, 35);
scene.add(sun);

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x4ca844 }),
  dirt: new THREE.MeshLambertMaterial({ color: 0x8b5b31 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x737980 }),
  darkStone: new THREE.MeshLambertMaterial({ color: 0x4d555e }),
  wood: new THREE.MeshLambertMaterial({ color: 0x83502e }),
  sand: new THREE.MeshLambertMaterial({ color: 0xd6c17d }),
  water: new THREE.MeshLambertMaterial({ color: 0x2c74be, transparent: true, opacity: 0.55 }),
  redBanner: new THREE.MeshLambertMaterial({ color: 0x8f1e2c }),
  blueBanner: new THREE.MeshLambertMaterial({ color: 0x1f4f94 })
};

const blocks = new Map();
const players = new Map();
const remoteMeshes = new Map();
const keys = {};
const velocity = new THREE.Vector3();
const clock = new THREE.Clock();

let socket = null;
let myId = null;
let myPlayer = null;
let yaw = 0;
let pitch = 0;
let verticalVelocity = 0;
let canJump = false;
let alive = true;
let lastStateSent = 0;
let lastAttackAt = 0;
let attackAnimation = 0;
let fpsFrames = 0;
let fpsStart = performance.now();

const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.31;
const WALK_SPEED = 4.7;
const SPRINT_SPEED = 7.0;
const GRAVITY = 22;
const JUMP_POWER = 7.6;

const $ = (id) => document.getElementById(id);
const keyFor = (x, y, z) => `${x},${y},${z}`;

function addBlock(x, y, z, materialName) {
  const key = keyFor(x, y, z);
  if (blocks.has(key)) return;

  const mesh = new THREE.Mesh(blockGeometry, materials[materialName]);
  mesh.position.set(x, y, z);
  mesh.userData = { x, y, z, type: materialName };
  scene.add(mesh);
  blocks.set(key, mesh);
}

function buildWall(x1, z1, x2, z2, y1, y2, materialName) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x1 + (x2 - x1) * (i / Math.max(steps, 1)));
    const z = Math.round(z1 + (z2 - z1) * (i / Math.max(steps, 1)));
    for (let y = y1; y <= y2; y++) addBlock(x, y, z, materialName);
  }
}

function buildArena() {
  const radius = 24;

  for (let x = -radius; x <= radius; x++) {
    for (let z = -radius; z <= radius; z++) {
      const distance = Math.hypot(x, z);

      if (distance <= radius) {
        addBlock(x, 0, z, distance > 20 ? "stone" : "grass");
        addBlock(x, -1, z, "dirt");
        addBlock(x, -2, z, "darkStone");
      }
    }
  }

  for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    for (let y = 1; y <= 4; y++) addBlock(x, y, z, "darkStone");
  }

  const pillars = [
    [-10, -10], [10, -10], [-10, 10], [10, 10],
    [0, -14], [0, 14], [-14, 0], [14, 0]
  ];

  for (const [x, z] of pillars) {
    for (let y = 1; y <= 5; y++) addBlock(x, y, z, "stone");
    addBlock(x, 6, z, "darkStone");
  }

  buildWall(-5, -4, 5, -4, 1, 2, "stone");
  buildWall(-5, 4, 5, 4, 1, 2, "stone");
  buildWall(-4, -3, -4, 3, 1, 2, "stone");
  buildWall(4, -3, 4, 3, 1, 2, "stone");

  for (let y = 1; y <= 3; y++) {
    addBlock(-18, y, 0, "redBanner");
    addBlock(18, y, 0, "blueBanner");
  }

  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 2; z++) {
      addBlock(x, 1, z, "darkStone");
    }
  }
}

function createSword() {
  const group = new THREE.Group();

  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 1.25, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xd9e4ed,
      metalness: 0.72,
      roughness: 0.25
    })
  );
  blade.position.y = 0.78;

  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.28, 4),
    blade.material
  );
  tip.position.y = 1.54;
  tip.rotation.y = Math.PI / 4;

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.08, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0xb38a37,
      metalness: 0.48,
      roughness: 0.35
    })
  );
  guard.position.y = 0.13;

  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.38, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x5a351f,
      roughness: 0.75
    })
  );
  handle.position.y = -0.1;

  group.add(blade, tip, guard, handle);
  return group;
}

const viewSword = createSword();
viewSword.position.set(0.48, -0.48, -0.78);
viewSword.rotation.set(-0.34, 0.18, -0.18);
camera.add(viewSword);
scene.add(camera);

function createNameSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "rgba(0,0,0,.62)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "28px monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, 46);

  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }));
  sprite.scale.set(2.8, 0.64, 1);
  sprite.userData.labelText = text;
  return sprite;
}

function createRemotePlayer(player) {
  if (player.id === myId || remoteMeshes.has(player.id)) return;

  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshLambertMaterial({
    color: new THREE.Color(player.color || "#ffffff")
  });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.0, 0.38), bodyMaterial);
  torso.position.y = 0.62;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.46, 0.46),
    new THREE.MeshLambertMaterial({ color: 0xf1c49d })
  );
  head.position.y = 1.37;

  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), bodyMaterial);
  leftLeg.position.set(-0.18, -0.22, 0);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.18;

  const sword = createSword();
  sword.scale.setScalar(0.72);
  sword.position.set(0.57, 0.58, -0.05);
  sword.rotation.set(0, 0, -0.42);
  sword.userData.baseRotationZ = -0.42;

  const label = createNameSprite(player.name || "Fighter");
  label.position.y = 2.18;

  group.add(torso, head, leftLeg, rightLeg, sword, label);
  group.userData.sword = sword;
  group.userData.label = label;
  group.userData.targetPosition = new THREE.Vector3(player.x, player.y - PLAYER_HEIGHT, player.z);
  group.userData.targetYaw = player.yaw || 0;
  group.userData.swing = 0;

  scene.add(group);
  remoteMeshes.set(player.id, group);
}

function refreshLabel(group, name) {
  if (!group?.userData?.label) return;
  if (group.userData.label.userData.labelText === name) return;

  group.remove(group.userData.label);
  group.userData.label.material.map.dispose();
  group.userData.label.material.dispose();

  const label = createNameSprite(name);
  label.position.y = 2.18;
  group.add(label);
  group.userData.label = label;
}

function updateRemotePlayer(player, immediate = false) {
  if (player.id === myId) return;
  if (!remoteMeshes.has(player.id)) createRemotePlayer(player);

  const group = remoteMeshes.get(player.id);
  if (!group) return;

  group.userData.targetPosition.set(player.x, player.y - PLAYER_HEIGHT, player.z);
  group.userData.targetYaw = player.yaw || 0;
  refreshLabel(group, `${player.name}  ${player.health}`);

  group.visible = player.alive !== false;

  if (immediate) {
    group.position.copy(group.userData.targetPosition);
    group.rotation.y = group.userData.targetYaw;
  }
}

function removeRemotePlayer(id) {
  const group = remoteMeshes.get(id);
  if (!group) return;
  scene.remove(group);
  remoteMeshes.delete(id);
}

function interpolateRemotePlayers(dt) {
  for (const group of remoteMeshes.values()) {
    group.position.lerp(group.userData.targetPosition, Math.min(1, dt * 12));

    let delta = group.userData.targetYaw - group.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    group.rotation.y += delta * Math.min(1, dt * 12);

    if (group.userData.swing > 0) {
      group.userData.swing = Math.max(0, group.userData.swing - dt * 5.8);
      const t = 1 - group.userData.swing;
      group.userData.sword.rotation.z =
        group.userData.sword.userData.baseRotationZ - Math.sin(t * Math.PI) * 1.5;
    } else {
      group.userData.sword.rotation.z = group.userData.sword.userData.baseRotationZ;
    }
  }
}

function addMessage(name, text) {
  const line = document.createElement("div");
  line.textContent = `${name}: ${text}`;
  $("messages").appendChild(line);

  while ($("messages").children.length > 8) {
    $("messages").firstChild.remove();
  }
}

function addKillFeed(text) {
  const line = document.createElement("div");
  line.className = "kill-line";
  line.textContent = text;
  $("killFeed").appendChild(line);

  setTimeout(() => line.remove(), 5200);
}

function updateHealth(value) {
  const health = Math.max(0, Math.min(100, value));
  $("healthText").textContent = health;
  $("healthBar").style.width = `${health}%`;

  if (health > 55) {
    $("healthBar").style.background = "linear-gradient(90deg,#2fbd5a,#78df66)";
  } else if (health > 25) {
    $("healthBar").style.background = "linear-gradient(90deg,#d59b2e,#f0cf50)";
  } else {
    $("healthBar").style.background = "linear-gradient(90deg,#b82727,#ec5353)";
  }
}

function updateScoreboard() {
  const sorted = Array.from(players.values())
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  $("scoreRows").innerHTML = `
    <div class="score-row header">
      <span>Fighter</span><span>Kills</span><span>Deaths</span>
    </div>
  `;

  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <span>${escapeHtml(player.name)}${player.id === myId ? " (You)" : ""}</span>
      <span>${player.kills}</span>
      <span>${player.deaths}</span>
    `;
    $("scoreRows").appendChild(row);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function applyPlayer(player) {
  players.set(player.id, player);

  if (player.id === myId) {
    myPlayer = player;
    alive = player.alive !== false;
    updateHealth(player.health);
    $("kills").textContent = player.kills;
    $("deaths").textContent = player.deaths;
  } else {
    updateRemotePlayer(player);
  }

  $("playerCount").textContent = players.size;
  updateScoreboard();
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.addEventListener("open", () => {
    addMessage("System", "Connected to the arena");
  });

  socket.addEventListener("close", () => {
    addMessage("System", "Disconnected. Reconnecting...");
    setTimeout(connect, 1500);
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "init") {
      myId = message.id;
      $("az").textContent = message.az;
      $("instance").textContent = message.instanceId;

      for (const player of message.players) {
        players.set(player.id, player);
      }

      const initial = players.get(myId);

      if (initial) {
        myPlayer = initial;
        camera.position.set(initial.x, initial.y, initial.z);
        yaw = initial.yaw || 0;
        camera.rotation.y = yaw;
        updateHealth(initial.health);
      }

      for (const player of players.values()) {
        updateRemotePlayer(player, true);
      }

      updateScoreboard();

      send({
        type: "hello",
        name: $("nameInput").value || "EC2 Fighter"
      });
    }

    if (message.type === "player_join" || message.type === "player_update") {
      applyPlayer(message.player);
    }

    if (message.type === "state") {
      players.set(message.player.id, {
        ...(players.get(message.player.id) || {}),
        ...message.player
      });
      updateRemotePlayer(message.player);
    }

    if (message.type === "player_leave") {
      players.delete(message.id);
      removeRemotePlayer(message.id);
      $("playerCount").textContent = players.size;
      updateScoreboard();
    }

    if (message.type === "swing") {
      if (message.attackerId === myId) {
        attackAnimation = 1;
      } else {
        const group = remoteMeshes.get(message.attackerId);
        if (group) group.userData.swing = 1;
      }
    }

    if (message.type === "hit") {
      const target = players.get(message.targetId);

      if (target) {
        target.health = message.health;
        applyPlayer(target);
      }

      if (message.attackerId === myId) {
        $("hitMarker").classList.remove("show");
        void $("hitMarker").offsetWidth;
        $("hitMarker").classList.add("show");
      }

      if (message.targetId === myId) {
        $("damageFlash").classList.remove("show");
        void $("damageFlash").offsetWidth;
        $("damageFlash").classList.add("show");
      }
    }

    if (message.type === "kill") {
      applyPlayer(message.attacker);
      applyPlayer(message.victim);
      addKillFeed(`${message.attacker.name} defeated ${message.victim.name}`);

      if (message.victim.id === myId) {
        alive = false;
        $("deathScreen").classList.add("show");
        document.exitPointerLock();
      }
    }

    if (message.type === "respawn") {
      applyPlayer(message.player);

      if (message.player.id === myId) {
        camera.position.set(message.player.x, message.player.y, message.player.z);
        verticalVelocity = 0;
        velocity.set(0, 0, 0);
        alive = true;
        $("deathScreen").classList.remove("show");
        document.body.requestPointerLock();
      } else {
        updateRemotePlayer(message.player, true);
      }
    }

    if (message.type === "chat") {
      addMessage(message.name, message.text);
    }

    if (message.type === "system") {
      addMessage("System", message.text);
    }
  });
}

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function solidAt(x, y, z) {
  return blocks.has(keyFor(Math.round(x), Math.round(y), Math.round(z)));
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

  return horizontal.some(([sx, sz]) =>
    vertical.some((sy) => solidAt(sx, sy, sz))
  );
}

function groundHeight() {
  const x = Math.round(camera.position.x);
  const z = Math.round(camera.position.z);

  for (let y = 30; y >= -10; y--) {
    if (blocks.has(keyFor(x, y, z))) {
      return y + 0.5 + PLAYER_HEIGHT;
    }
  }

  return -99;
}

function updateMovement(dt) {
  if (!alive) return;

  let inputX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  let inputZ = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const length = Math.hypot(inputX, inputZ);

  if (length) {
    inputX /= length;
    inputZ /= length;
  }

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const speed = keys.ShiftLeft || keys.ShiftRight ? SPRINT_SPEED : WALK_SPEED;

  const target = new THREE.Vector3()
    .add(forward.multiplyScalar(inputZ * speed))
    .add(right.multiplyScalar(inputX * speed));

  velocity.x += (target.x - velocity.x) * Math.min(1, dt * 10);
  velocity.z += (target.z - velocity.z) * Math.min(1, dt * 10);

  const nextX = camera.position.x + velocity.x * dt;

  if (!collides(nextX, camera.position.y, camera.position.z)) {
    camera.position.x = nextX;
  } else {
    velocity.x = 0;
  }

  const nextZ = camera.position.z + velocity.z * dt;

  if (!collides(camera.position.x, camera.position.y, nextZ)) {
    camera.position.z = nextZ;
  } else {
    velocity.z = 0;
  }

  verticalVelocity -= GRAVITY * dt;
  camera.position.y += verticalVelocity * dt;

  const floor = groundHeight();

  if (camera.position.y < floor) {
    camera.position.y = floor;
    verticalVelocity = 0;
    canJump = true;
  }

  if (camera.position.y < -8) {
    camera.position.set(0, 8, 0);
    verticalVelocity = 0;
  }
}

function attack() {
  if (!alive || document.pointerLockElement !== document.body) return;

  const now = performance.now();

  if (now - lastAttackAt < 650) return;

  lastAttackAt = now;
  attackAnimation = 1;
  send({ type: "attack" });
}

function updateSword(dt) {
  if (attackAnimation > 0) {
    attackAnimation = Math.max(0, attackAnimation - dt * 4.6);
    const t = 1 - attackAnimation;

    viewSword.rotation.z = -0.18 - Math.sin(t * Math.PI) * 1.4;
    viewSword.rotation.x = -0.34 + Math.sin(t * Math.PI) * 0.45;
    viewSword.position.x = 0.48 - Math.sin(t * Math.PI) * 0.2;
  } else {
    viewSword.rotation.set(-0.34, 0.18, -0.18);
    viewSword.position.set(0.48, -0.48, -0.78);
  }
}

$("playButton").addEventListener("click", () => {
  $("menu").style.display = "none";
  document.body.requestPointerLock();
});

document.addEventListener("keydown", (event) => {
  if (document.activeElement === $("chatInput")) {
    if (event.code === "Enter") {
      const text = $("chatInput").value.trim();

      if (text) send({ type: "chat", text });

      $("chatInput").value = "";
      $("chatInput").blur();

      if (alive) document.body.requestPointerLock();
    }

    return;
  }

  keys[event.code] = true;

  if (event.code === "Space" && canJump && alive) {
    verticalVelocity = JUMP_POWER;
    canJump = false;
  }

  if (event.code === "Enter") {
    document.exitPointerLock();
    $("chatInput").focus();
  }

  if (event.code === "Tab") {
    event.preventDefault();
    $("scoreboard").classList.add("show");
  }
});

document.addEventListener("keyup", (event) => {
  keys[event.code] = false;

  if (event.code === "Tab") {
    $("scoreboard").classList.remove("show");
  }
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== document.body || !alive) return;

  yaw -= event.movementX * 0.0017;
  pitch -= event.movementY * 0.0017;
  pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);

  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
});

document.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;

  if (document.pointerLockElement !== document.body) {
    if (alive) document.body.requestPointerLock();
    return;
  }

  attack();
});

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
  updateSword(dt);
  interpolateRemotePlayers(dt);

  const now = performance.now();

  if (alive && now - lastStateSent > 50) {
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

  fpsFrames++;

  if (now - fpsStart >= 1000) {
    $("fps").textContent = fpsFrames;
    fpsFrames = 0;
    fpsStart = now;
  }

  renderer.render(scene, camera);
}

buildArena();
camera.position.set(0, 7, 14);
connect();
animate();
