"use strict";

const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const root = path.resolve(__dirname, "..");
const port = 3318;
const base = `http://127.0.0.1:${port}`;
const CLIENT_COUNT = 24;
const TEST_DURATION_MS = 5000;
const child = spawn(process.execPath, [path.join(root, "server.js")], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: "test", ROOM_CODE: "", MAX_CLIENTS: "32" },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`${base}/api/status`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Load-test server did not start.\n${logs}`);
}

function connectClient(index) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const state = { socket, snapshots: 0, sequence: 0, interval: null };
    const timer = setTimeout(() => reject(new Error(`Load client ${index} timed out`)), 4000);
    socket.on("message", (data) => {
      let message;
      try { message = JSON.parse(data.toString()); } catch { return; }
      if (message.type === "snapshot") state.snapshots++;
      if (message.type !== "init") return;
      clearTimeout(timer);
      socket.send(JSON.stringify({ type: "hello", name: `Load-${index}`, skin: "standard", archetype: "assault", modePreference: "tdm" }));
      state.interval = setInterval(() => {
        state.sequence++;
        socket.send(JSON.stringify({
          type: "input",
          seq: state.sequence,
          input: {
            forward: state.sequence % 4 < 2,
            backward: false,
            left: index % 2 === 0,
            right: index % 2 === 1,
            jump: state.sequence % 45 === 0,
            sprint: true,
            crouch: false,
            aiming: state.sequence % 3 === 0,
            steady: false
          },
          yaw: ((index / CLIENT_COUNT) * Math.PI * 2) - Math.PI,
          pitch: 0
        }));
      }, 50);
      resolve(state);
    });
    socket.on("error", reject);
  });
}

(async () => {
  const clients = [];
  try {
    const initial = await waitForServer();
    if (initial.version !== "9.1.0") throw new Error(`Unexpected version ${initial.version}`);
    for (let index = 0; index < CLIENT_COUNT; index++) clients.push(await connectClient(index));
    await sleep(TEST_DURATION_MS);

    const status = await (await fetch(`${base}/api/status`)).json();
    if (status.players !== CLIENT_COUNT) throw new Error(`Expected ${CLIENT_COUNT} players, received ${status.players}`);
    if (status.memoryMb > 400) throw new Error(`Unexpected server memory use: ${status.memoryMb} MB`);
    if (status.eventLoopLagMs > 80) throw new Error(`Event-loop lag too high: ${status.eventLoopLagMs} ms`);
    const minimumSnapshots = Math.floor(TEST_DURATION_MS / 1000 * 8);
    for (const [index, client] of clients.entries()) {
      if (client.snapshots < minimumSnapshots) throw new Error(`Client ${index} received only ${client.snapshots} snapshots`);
    }
    console.log(`Load test passed: ${CLIENT_COUNT} clients, ${status.memoryMb} MB RSS, ${status.eventLoopLagMs} ms event-loop lag, ${status.droppedSnapshots} backpressure drops.`);
  } finally {
    for (const client of clients) {
      clearInterval(client.interval);
      client.socket.close();
    }
    child.kill("SIGTERM");
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  child.kill("SIGTERM");
  process.exitCode = 1;
});
