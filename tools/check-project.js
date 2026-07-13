"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const clientFiles = [
  "public/audio.js", "public/config.js", "public/effects.js", "public/main.js",
  "public/assets.js", "public/network.js", "public/player.js", "public/systems.js", "public/world.js"
];
const nodeFiles = ["server.js", "tools/check-project.js", "tools/smoke-test.js"];
const requiredFiles = [
  "package.json", "server.js", "README.md", "CHANGELOG.md", ".gitignore", ".github/workflows/ci.yml",
  "user-data.sh", "update-existing-instance.sh", "tools/install-system.sh",
  "public/index.html", "public/style.css", ...clientFiles,
  "public/assets/manifest.json", "public/assets/audio/manifest.json", "public/assets/models/README.md", "public/assets/models/manifest.json", "public/assets/models/arena_props.glb", "public/assets/models/vector_rifle.glb", "public/assets/models/arc_blade.glb"
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing required file: ${relative}`);
}
for (const relative of nodeFiles) execFileSync(process.execPath, ["--check", path.join(root, relative)], { stdio: "inherit" });
for (const relative of ["user-data.sh", "update-existing-instance.sh", "tools/install-system.sh"]) {
  execFileSync("bash", ["-n", path.join(root, relative)], { stdio: "inherit" });
}
for (const relative of clientFiles) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  execFileSync(process.execPath, ["--input-type=module", "--check"], { input: source, stdio: ["pipe", "inherit", "inherit"] });
  for (const match of source.matchAll(/(?:from\s+|import\s*)["'](\.\.?\/[^"']+)["']/g)) {
    const candidate = path.resolve(path.dirname(path.join(root, relative)), match[1]);
    if (!fs.existsSync(candidate)) throw new Error(`${relative} imports missing module ${match[1]}`);
  }
}

const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
for (const asset of ["/style.css", "/main.js"]) if (!html.includes(asset)) throw new Error(`index.html does not reference ${asset}`);
const htmlIds = new Set(Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), (match) => match[1]));
const main = fs.readFileSync(path.join(root, "public/main.js"), "utf8");
for (const match of main.matchAll(/\$\(["']([^"']+)["']\)/g)) {
  if (!htmlIds.has(match[1])) throw new Error(`main.js references missing HTML id: ${match[1]}`);
}

for (const glbPath of ["public/assets/models/arena_props.glb", "public/assets/models/vector_rifle.glb", "public/assets/models/arc_blade.glb"]) {
  const data = fs.readFileSync(path.join(root, glbPath));
  if (data.length < 20 || data.subarray(0, 4).toString("ascii") !== "glTF") throw new Error(`Invalid GLB asset: ${glbPath}`);
}

for (const manifestPath of ["public/assets/manifest.json", "public/assets/audio/manifest.json", "public/assets/models/manifest.json"]) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), "utf8"));
  if (!manifest || typeof manifest !== "object") throw new Error(`Invalid manifest: ${manifestPath}`);
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
    const blocked = colliders.some((collider) => spawn.y < collider.maxY && spawn.y + height > collider.minY && circleAabbOverlap(spawn.x, spawn.z, collider));
    if (blocked) throw new Error(`Spawn ${spawn.id} intersects arena geometry`);
    if (Math.hypot(spawn.x, spawn.z) > 33.4) throw new Error(`Spawn ${spawn.id} is outside the playable arena`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (packageJson.version !== "8.0.0") throw new Error(`Unexpected package version ${packageJson.version}`);
if (!serverSource.includes('const GAME_VERSION = "8.0.0"')) throw new Error("Server version is not synchronized");
console.log(`Validated ${nodeFiles.length + clientFiles.length} JavaScript files, ${htmlIds.size} HUD elements, authored assets, and ${Object.values(spawns).flat().length} collision-free spawn anchors.`);
