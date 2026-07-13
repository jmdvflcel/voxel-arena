# Voxel Combat Arena v8.1

A server-authoritative browser arena shooter built with Node.js, WebSockets, and Three.js. Version 8.1 adds a dedicated character-and-weapon presentation pipeline while preserving the combat, networking, accessibility, and resilient EC2 foundation from v8.

## What v8.1 adds

### Character presentation

- Replaced rigid box characters with a hierarchical modular combat rig: pelvis, spine, chest, head, articulated upper/lower arms, articulated thighs/shins, hands, boots, armor plates, backpack, grapple canisters, visor, and team-light elements.
- Added cosmetic Assault, Scout, and Heavy frames. They retain identical gameplay movement and hitboxes while changing armor silhouette and equipment presentation.
- Added blended procedural poses for idle breathing, walking, sprinting, strafing, crouching, sliding, jumping, falling, aiming, blocking, firing, reloading, and multi-directional sword attacks.
- Added upper-body aiming and pitch tracking so remote players keep locomotion in their legs while the torso, head, arms, and weapon track the crosshair.
- Added dedicated articulated first-person arms with sleeves, gauntlets, gloves, fingers, weapon-specific grip positions, ADS hand shifts, reload hand movement, recoil absorption, and two-handed melee support.

### Weapon presentation

- Added six optimized authored GLB weapons: Pulse Pistol, Vector Rifle Mk II, Scatter Cannon, Longshot Mk II, Arc Blade Mk II, and Void Reaper.
- Rebuilt the procedural fallback weapon factory so every weapon has a stronger silhouette, layered materials, emissive systems, optics, rails, stocks, grips, magazines, barrels, and heat hardware.
- Added named mechanical weapon parts and animation for pistol slides, rifle/marksman bolts, shotgun pumps, magazines, railgun energy cells and coils, heat vents, energy rails, and segmented sword blades.
- Added weapon-specific reload choreography, mechanical firing cycles, barrel/vent heat buildup, cooling behavior, stronger recoil springs, roll/yaw kick, weapon obstruction, and authored-model skin tinting.
- Expanded the asset manifest and validation suite so all presentation assets are checked before deployment.

## What v8 adds

### Combat and aiming

- Weapon-specific deterministic recoil, first-shot recovery, movement/airborne bloom, crouched bracing, aim punch, armor/body/headshot feedback, shell ejection, pooled bullet impacts, and surface-aware audio.
- Progressive ADS with weapon-specific transition speed, zoom levels, reduced zoom sensitivity, hold-breath stamina, optic parallax, scope shadow, scope glint, and wall-obstruction weapon lowering.
- Light, heavy, aerial, combo, block, stamina, parry, guard-break, lunge, knockback, wall obstruction, swept melee collision, and recoverable rare Void Reaper behavior.

### Movement and grapple

- Jump buffering, coyote time, acceleration/friction tuning, crouch, momentum slide, mantle support, landing response, dash, capsule collision, automatic unstuck recovery, and safe tactical spawning.
- Projectile-based grapple attachment, wall/anchor validation, rope obstruction checks, reel control, spring tension, swing momentum, reduced attached gravity, release boosting, and heavy-hit interruption.

### Multiplayer and match loop

- 30 Hz authoritative simulation, 15 Hz delta-conscious snapshots, latency-compensated hit validation, adaptive interpolation, Hermite remote motion, jitter/loss telemetry, heartbeat cleanup, backpressure handling, and message-rate protection.
- Team Deathmatch, King of the Hill, and Free-for-All.
- Mode voting, map-variant voting, round highlights, scoreboard statistics, spectator camera, kill cam, private room code support, and optional server bots.
- Foundry, Nightfall, and Stormfront presentation variants with distinct lighting and atmosphere.

### Presentation, accessibility, and progression

- Authored WAV combat samples with procedural fallback, pooled effects, lightweight GLB weapon/arena assets with procedural fallback, adaptive graphics presets, and dynamic resolution safeguards.
- Rebindable keyboard controls, controller support, hold/toggle ADS, crosshair options, reduced motion, color-vision filters, FOV, sensitivity, volume, and first/third person camera modes.
- Local levels, XP, challenges, lifetime statistics, and cosmetic weapon skins. Progress is intentionally client-local; it is not a secure account system.

## Controls

The defaults are shown below and can be rebound in Settings.

| Action | Default |
|---|---|
| Move | WASD |
| Look | Mouse |
| Fire / light melee | Left mouse |
| ADS / block | Right mouse |
| Heavy melee | Middle mouse |
| Grapple / release | E |
| Dash power | Q |
| Jump / mantle | Space |
| Sprint / steady scoped aim | Shift |
| Crouch / slide | C |
| Reload | R |
| Weapons | 1–9; 0 for Void Reaper |
| Camera | V |
| Spectator target | F |
| Chat | Enter |
| Scoreboard | Tab |
| Settings | Escape |

## Fresh Amazon Linux 2023 deployment

1. Replace the contents of `jmdvflcel/voxel-arena` with this release, preserving the folders.
2. Launch an Amazon Linux 2023 instance. A `t3.micro` works for a small match; `t3.small` or larger gives more CPU and memory headroom.
3. Add an inbound security-group rule for HTTP TCP 80.
4. Paste the complete contents of `user-data.sh` into EC2 User Data before launch.
5. Allow approximately 5–10 minutes, then open `http://PUBLIC_IP`.

Monitor installation:

```bash
sudo tail -f /var/log/voxel-combat-arena-install.log
```

Verify:

```bash
curl -s http://127.0.0.1:3000/api/status
sudo systemctl status voxel-arena --no-pager -l
```

## Update an existing instance

After committing the release to GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/jmdvflcel/voxel-arena/main/update-existing-instance.sh | sudo bash
```

The updater builds in a staging directory, installs only from the public npm registry, validates assets and browser modules, runs a ten-client smoke test, creates a missing systemd/nginx configuration, swaps releases atomically, performs a health check, and restores the previous healthy release on failure.

## Server configuration

Edit `/etc/voxel-arena.env`, then restart the service:

```bash
sudo nano /etc/voxel-arena.env
sudo systemctl restart voxel-arena
```

Supported values include:

```text
PORT=3000
BOT_COUNT=2
ROOM_CODE=
```

Use `BOT_COUNT=0` to disable bots. Set `ROOM_CODE` to require a private-match code.

## Development and validation

```bash
npm install --no-audit --no-fund --package-lock=false
npm test
npm start
```

Useful endpoints:

- `/api/status` — health, player count, version, tick rate, memory, and current round.
- `/api/version` — application version, build commit, and Node version.

## Practical quality boundary

This release substantially improves responsiveness, combat feedback, traversal, presentation, and operational reliability, but it is still a browser game using lightweight authored and procedural assets. A literal premium-console production requires a dedicated art/animation/audio pipeline, larger QA effort, matchmaking and account infrastructure, anti-cheat, persistent backend storage, and extensive hardware/network testing.
