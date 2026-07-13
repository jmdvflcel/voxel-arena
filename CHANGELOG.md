# Voxel Combat Arena changelog

## 8.9.0

### Human-only multiplayer

- Removed bot creation, bot AI simulation, bot configuration, and bot startup behavior.
- Existing `/etc/voxel-arena.env` files have legacy `BOT_COUNT` entries removed during installation or update.
- The status API retains `bots: 0` for compatibility while all connected roster entries are real players.

## 8.9.0

- Replaced the scoreboard's accumulated snapshot cache with an authoritative server roster.
- Cleared stale player and character state whenever a WebSocket session is reinitialized.
- Removed remote character models that leave the active interest snapshot while preserving their lightweight scoreboard row.
- Added generation-guarded WebSocket reconnection so events from an obsolete socket cannot create a second live session.
- Added regression validation for unique roster IDs and reconnect cleanup.

## 8.5.0

### ADS clarity and aim truth

- Pulled every ADS viewmodel farther from the camera and rebuilt the Trident Burst prism as an open frame.
- Hid Longshot and Apex Railgun viewmodels once their fullscreen optics are fully shouldered.
- Enlarged the Longshot lens, softened its vignette, simplified the Railgun digital frame, and faded central world labels while aiming.
- Sent the exact camera-center aim vector to the server, validated it against player orientation, and used authoritative impact points for tracers.
- Reduced random ADS spread and bloom while retaining movement, airborne, shotgun-pellet, and visible recoil penalties.

## 8.4.0

### First-person viewmodel repair

- Added the perspective camera to the scene graph so the camera-mounted weapon and articulated arms render correctly.
- Added a dedicated named `ViewModelRoot`, enforced equipped-model visibility, and preserved hands in hip-fire and ADS.
- Reduced the camera near plane and disabled culling, world depth, and fog on first-person meshes.
- Added distinct hip/ADS poses and arm spacing for pistol, SMG, rifle, burst rifle, shotgun, LMG, marksman rifle, and railgun.
- Restricted fullscreen overlays to marksman and railgun weapons only.

## 8.3.0

### Weapon-mounted ADS overhaul

- Replaced generic zoom-only aiming with visible, camera-aligned first-person weapon sights.
- Added unique pistol notch, SMG aperture, shotgun bead/rib, rifle holographic, LMG protected reflex, burst prism, marksman scope, and railgun digital sight presentations.
- Limited fullscreen masks to the marksman rifle and railgun; iron, reflex, holographic, and prism weapons now aim through their actual 3D sight housings.
- Added per-model sight anchors, reduced ADS bob/sway, corrected ADS pitch, and automated sight-center projection tests.
- Retuned low-magnification weapons so pistols, SMGs, shotguns, rifles, and LMGs no longer behave like sniper scopes.

## 8.2.0

- Fixed start-menu overflow by making the boot interface scrollable and responsive on short displays.
- Fixed frozen mouse look caused by the pointer-movement handler referencing an out-of-scope zoom array.
- Moved pointer lock to the WebGL canvas with click-to-recapture and visible error guidance.
- Corrected third-person arm rotations so hands and weapons remain in front of the character.
- Added differentiated iron, reflex, low-power optic, sniper, and railgun aiming presentations.
- Removed fullscreen scope behavior from pistols, SMGs, shotguns, rifles, and LMGs as appropriate.

## 8.1.0

### Character and animation overhaul

- Added modular Assault, Scout, and Heavy cosmetic combat frames with identical gameplay hitboxes.
- Replaced rigid character motion with a hierarchical procedural rig and blended idle, locomotion, crouch, slide, airborne, ADS, reload, block, recoil, and sword poses.
- Added upper-body aim tracking, articulated knees/elbows, directional lean, helmet/visor details, armor lights, backpacks, and grapple canisters.
- Rebuilt first-person arms with articulated sleeves, gauntlets, gloves, fingers, weapon-specific hand placement, reload reach, ADS shifts, and melee support.

### Weapon presentation overhaul

- Added authored GLB models for the Pulse Pistol, Vector Rifle Mk II, Scatter Cannon, Longshot Mk II, Arc Blade Mk II, and Void Reaper.
- Added procedural high-detail fallback models for every weapon.
- Added animated magazines, slides, bolts, pumps, railgun cells/coils, heat vents, rails, and segmented blades.
- Added weapon-specific reload choreography, mechanical firing cycles, heat/cooling response, stronger recoil springs, and skin tint support for authored models.
- Added combat-frame selection to the start and pause menus and synchronized it through server snapshots.

## 8.0.0

### Reliability and deployment

- Replaced destructive in-place updates with staged, validated, atomic releases and automatic rollback.
- Made both fresh installs and updates self-create the systemd service and nginx WebSocket proxy.
- Removed environment-specific lockfile dependencies and forced the public npm registry.
- Tolerated the Amazon Linux npm `Exit handler never called` defect only when all required dependencies are verifiably present.
- Added browser-ES-module validation, shell validation, asset-manifest checks, spawn checks, version checks, a ten-client multiplayer smoke test, health/version endpoints, and GitHub Actions CI.

### Networking and performance

- Added adaptive interpolation based on jitter/loss, Hermite remote motion, short extrapolation, snapshot sequence tracking, backpressure controls, heartbeat cleanup, and message-rate protection.
- Preserved a t3.micro-conscious 30 Hz authoritative simulation and 15 Hz snapshot stream.
- Expanded object pooling for tracers, impacts, slash arcs, decals, projectiles, muzzle flashes, and shell casings.

### Combat

- Added deterministic weapon recoil, progressive ADS, first-shot recovery, crouched bracing, variable optics, scope parallax/shadow/glint, hold-breath stamina, wall obstruction, directional damage feedback, damage numbers, and richer hit confirmation.
- Expanded melee with light/heavy/aerial attacks, swept collision, stamina blocking, parries, guard breaks, hit interruption, knockback, wall checks, and recoverable rare-sword drops.
- Added surface-aware impacts and authored runtime-loaded WAV layers with procedural fallback.

### Movement and grapple

- Added safer scored spawns, automatic unstuck recovery, coyote time, jump buffering, refined slide/mantle/landing behavior, and improved client prediction.
- Rebuilt grapple attachment around projectile travel, valid surfaces, obstruction cancellation, reel control, spring tension, swing momentum, release boosting, and heavy-hit interruption.

### Match loop and player experience

- Added Team Deathmatch, King of the Hill, Free-for-All, optional bots, private room codes, mode voting, map-variant voting, spectator mode, end-round highlights, and enhanced scoring statistics.
- Added Foundry, Nightfall, and Stormfront visual variants.
- Added controller support, key rebinding, hold/toggle ADS, crosshair choices, reduced motion, color-vision filters, progression, challenges, cosmetic skins, and ultra graphics mode.
- Added lightweight GLB assets and an asset pipeline with procedural fallback.

## 7.0.1

- Fixed EC2 validation of browser ES modules without converting the CommonJS server.
- Removed environment-specific npm lockfile URLs and retained the corrected `/main.js` entry path.

## 7.0.0

- Added collision-tested spawning, latency-compensated swept melee, momentum grapple physics, deterministic recoil patterns, progressive ADS, pooled slash effects, networking safeguards, project validation, smoke testing, and update rollback.
