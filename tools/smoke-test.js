"use strict";

const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..");
const port = 3317;
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: "test", BOT_COUNT: "0", ROOM_CODE: "" },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${base}/api/status`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Server did not become ready.\n${logs}`);
}

function connectClient(index) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const timer = setTimeout(() => reject(new Error(`Client ${index} timed out`)), 3500);
    socket.on("message", (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.type !== "init") return;
      clearTimeout(timer);
      socket.send(JSON.stringify({ type: "hello", name: `Smoke-${index}`, skin: "standard", archetype: ["assault", "scout", "heavy"][index % 3], modePreference: "tdm" }));
      socket.send(JSON.stringify({ type: "ping", clientTime: performance.now() }));
      resolve({ socket, init: message });
    });
    socket.on("error", reject);
  });
}

(async () => {
  const clients = [];
  try {
    const status = await waitForServer();
    if (status.version !== "8.1.0") throw new Error(`Unexpected version: ${status.version}`);
    if (status.tickRate !== 30) throw new Error(`Unexpected tick rate: ${status.tickRate}`);

    const page = await fetch(`${base}/`);
    const html = await page.text();
    if (!page.ok || !html.includes("Voxel Combat Arena") || !html.includes("v8")) {
      throw new Error("Public client did not load correctly");
    }

    for (let i = 0; i < 10; i++) clients.push(await connectClient(i));
    for (const { init } of clients) {
      const player = init.player;
      if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) {
        throw new Error("Invalid player spawn received");
      }
      if (Math.hypot(player.x, player.z) > 33.4) throw new Error("Player spawned outside arena");
      if (Math.abs(player.x) >= 24.6 && Math.abs(player.z) < 3.2) {
        throw new Error("Player spawned in the former side-gate collision zone");
      }
    }

    const actor = clients[0];
    actor.socket.send(JSON.stringify({
      type: "input",
      seq: 1,
      input: { forward: true, aiming: true },
      yaw: actor.init.player.yaw,
      pitch: 0
    }));
    actor.socket.send(JSON.stringify({ type: "fire", weapon: "rifle", aiming: true, latency: 24 }));
    actor.socket.send(JSON.stringify({ type: "switch_weapon", weapon: "sword" }));
    actor.socket.send(JSON.stringify({ type: "melee", weapon: "sword", combo: 0, attackType: "heavy", latency: 24 }));
    actor.socket.send(JSON.stringify({ type: "ability", ability: "grapple", yaw: actor.init.player.yaw, pitch: 0.12 }));
    await sleep(450);

    const version = await (await fetch(`${base}/api/version`)).json();
    if (version.version !== "8.1.0") throw new Error("Version endpoint failed");
    const finalStatus = await (await fetch(`${base}/api/status`)).json();
    if (finalStatus.status !== "online" || finalStatus.players !== clients.length) {
      throw new Error("Server became unhealthy during combat message smoke test");
    }

    console.log(`Smoke test passed: HTTP, status API, static client, ${clients.length} WebSocket clients, and combat/ability handlers.`);
  } finally {
    for (const client of clients) client.socket.close();
    child.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  child.kill("SIGTERM");
  process.exitCode = 1;
});
