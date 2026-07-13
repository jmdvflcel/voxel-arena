"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "voxel-presentation-"));

try {
  for (const file of ["config.js", "systems.js"]) {
    fs.copyFileSync(path.join(root, "public", file), path.join(temporary, file));
  }

  const playerSource = fs.readFileSync(path.join(root, "public", "player.js"), "utf8")
    .replace('from "/vendor/three.module.js"', 'from "three"');
  fs.writeFileSync(path.join(temporary, "player.js"), playerSource);
  fs.writeFileSync(path.join(temporary, "package.json"), JSON.stringify({ type: "module" }));
  fs.symlinkSync(path.join(root, "node_modules"), path.join(temporary, "node_modules"), "dir");

  fs.writeFileSync(path.join(temporary, "test.mjs"), `
import * as THREE from "three";
globalThis.document = {
  createElement(type) {
    if (type !== "canvas") return {};
    const context = { clearRect() {}, fillRect() {}, fillText() {}, fillStyle: "", font: "", textAlign: "" };
    return { width: 0, height: 0, getContext() { return context; } };
  }
};
const { FirstPersonWeapon, RemotePlayer, createWeaponModel } = await import("./player.js");
const sceneForViewModel = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 16 / 9, 0.015, 250);
sceneForViewModel.add(camera);
const firstPerson = new FirstPersonWeapon(camera);
if (firstPerson.viewModelRoot.parent !== camera) throw new Error("ViewModelRoot is not a camera child");
if (camera.parent !== sceneForViewModel) throw new Error("Camera is not in the scene graph");
const names = ["pistol", "smg", "rifle", "burst", "shotgun", "lmg", "marksman", "railgun", "sword", "voidblade"];
const sightStyles = new Set();
for (const name of names) {
  firstPerson.setWeapon(name);
  firstPerson.setVisible(true);
  firstPerson.fire();
  firstPerson.update(1 / 60, 5, true, false);
  const hipModel = firstPerson.models.get(name);
  if (!firstPerson.viewModelRoot.visible || !hipModel.visible) throw new Error("Hip-fire viewmodel is hidden for " + name);
  if (!firstPerson.leftArm.visible || !firstPerson.rightArm.visible) throw new Error("First-person arms are hidden for " + name);
  let visibleMeshes = 0;
  firstPerson.viewModelRoot.traverse((object) => { if (object.isMesh && object.visible) visibleMeshes++; });
  if (visibleMeshes < 8) throw new Error("Viewmodel has too few visible meshes for " + name);
  if (!name.includes("sword") && name !== "voidblade") firstPerson.setReloading(true, 1500);
  for (let index = 0; index < 12; index++) firstPerson.update(1 / 60, 0, true, false);
  firstPerson.setReloading(false);
  const model = createWeaponModel(name, true, "standard");
  if (!model.userData.muzzleLocal) throw new Error("Missing muzzle position for " + name);

  if (!name.includes("sword") && name !== "voidblade") {
    firstPerson.setWeapon(name);
    for (let index = 0; index < 180; index++) firstPerson.update(1 / 60, 0, true, true);
    camera.updateMatrixWorld(true);
    const activeModel = firstPerson.models.get(name);
    activeModel.updateMatrixWorld(true);
    if (!activeModel.visible) throw new Error("ADS hid the weapon model for " + name);
    if (!activeModel.userData.sightAnchor?.isVector3) throw new Error("Missing sight anchor for " + name);
    sightStyles.add(activeModel.userData.sightStyle);
    const sightWorld = activeModel.localToWorld(activeModel.userData.sightAnchor.clone());
    const sightNdc = sightWorld.clone().project(camera);
    const cameraSpace = sightWorld.clone().applyMatrix4(camera.matrixWorldInverse);
    if (Math.abs(sightNdc.x) > 0.025 || Math.abs(sightNdc.y) > 0.025) {
      throw new Error("Sight is not centered for " + name + ": " + sightNdc.x + ", " + sightNdc.y);
    }
    if (cameraSpace.z > -0.18) throw new Error("Sight is too close or behind the camera for " + name);
  }
}
if (sightStyles.size !== 8) throw new Error("Weapon sights are not unique enough: " + Array.from(sightStyles).join(", "));
const scene = new THREE.Scene();
const base = { id: "test", name: "Test", team: "red", x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, health: 100, weapon: "rifle", alive: true, skin: "standard", archetype: "assault", powers: {} };
const actor = new RemotePlayer(scene, base, { shadows: false });
for (const archetype of ["assault", "scout", "heavy"]) {
  actor.setArchetype(archetype);
  actor.pushSample({ ...base, archetype, vx: 4, vz: -2, aiming: true }, performance.now());
  actor.render(performance.now() + 140, 1 / 60, 100);
  if (actor.archetype !== archetype) throw new Error("Archetype did not apply: " + archetype);
  actor.group.updateMatrixWorld(true);
  const leftHand = new THREE.Vector3();
  const rightHand = new THREE.Vector3();
  actor.rig.leftArm.end.getWorldPosition(leftHand);
  actor.rig.rightArm.end.getWorldPosition(rightHand);
  if (leftHand.z >= -0.05 || rightHand.z >= -0.05) {
    throw new Error("Third-person hands are not in front for " + archetype + ": " + leftHand.z + ", " + rightHand.z);
  }
}
actor.dispose();
console.log("Presentation runtime test passed: camera-mounted ViewModelRoot, visible hip-fire weapons and arms, eight unique centered sights, recoil, reloads, and melee.");
`);

  execFileSync(process.execPath, [path.join(temporary, "test.mjs")], { cwd: temporary, stdio: "inherit" });
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
