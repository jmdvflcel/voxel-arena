"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const jsFiles = [
  "server.js",
  "public/audio.js",
  "public/config.js",
  "public/effects.js",
  "public/main.js",
  "public/network.js",
  "public/player.js",
  "public/world.js",
  "tools/check-project.js",
  "tools/smoke-test.js"
];
const requiredPublic = [
  "public/index.html",
  "public/style.css",
  "public/main.js",
  "public/config.js",
  "public/world.js",
  "public/player.js",
  "public/effects.js",
  "public/audio.js",
  "public/network.js"
];

for (const relative of [...requiredPublic, "package.json", "server.js", "user-data.sh", "update-existing-instance.sh"]) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing required file: ${relative}`);
}

for (const relative of jsFiles) {
  execFileSync(process.execPath, ["--check", path.join(root, relative)], { stdio: "inherit" });
}

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
for (const asset of ["/style.css", "/main.js"]) {
  if (!html.includes(asset)) throw new Error(`index.html does not reference ${asset}`);
}

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
function literal(name, nextName) {
  const start = serverSource.indexOf(`const ${name} =`);
  const end = serverSource.indexOf(`const ${nextName} =`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Could not locate ${name}`);
  const expression = serverSource.slice(serverSource.indexOf("=", start) + 1, end).trim().replace(/;$/, "");
  return vm.runInNewContext(`(${expression})`, { Math });
}

const colliders = literal("COLLIDERS", "SPAWNS");
const spawns = literal("SPAWNS", "GRAPPLE_ANCHORS");
const radius = 0.32;
const height = 1.8;
function circleAabbOverlap(x, z, collider) {
  const nearestX = Math.max(collider.minX, Math.min(x, collider.maxX));
  const nearestZ = Math.max(collider.minZ, Math.min(z, collider.maxZ));
  return Math.hypot(x - nearestX, z - nearestZ) < radius + 0.03;
}
for (const [team, points] of Object.entries(spawns)) {
  if (points.length < 5) throw new Error(`${team} has too few authored spawns`);
  const ids = new Set();
  for (const spawn of points) {
    if (ids.has(spawn.id)) throw new Error(`Duplicate spawn id: ${spawn.id}`);
    ids.add(spawn.id);
    const blocked = colliders.some((collider) =>
      spawn.y < collider.maxY && spawn.y + height > collider.minY && circleAabbOverlap(spawn.x, spawn.z, collider)
    );
    if (blocked) throw new Error(`Spawn ${spawn.id} intersects arena geometry`);
    if (Math.hypot(spawn.x, spawn.z) > 33.4) throw new Error(`Spawn ${spawn.id} is outside the playable arena`);
  }
}

console.log(`Validated ${jsFiles.length} JavaScript files and ${Object.values(spawns).flat().length} collision-free spawn anchors.`);
