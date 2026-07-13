# Voxel Combat Arena v7

A server-authoritative multiplayer browser FPS/melee arena built with Node.js, WebSockets, and Three.js. The project is designed to remain playable on an AWS EC2 `t3.micro`, while delivering responsive movement, scoped aiming, grappling traversal, melee combos, kill cams, powers, pickups, and first-/third-person rendering.

## What changed in v7

### Safe spawning

- Replaced random edge offsets with fourteen authored team spawn anchors.
- Every candidate is validated against the player capsule, arena boundary, floor/headroom, other players, enemy proximity, enemy line of sight, and recent spawn reuse.
- Added an exhaustive emergency fallback search and automatic relocation if a player remains embedded in geometry for multiple simulation ticks.
- Increased spawn protection to reduce immediate spawn deaths.

### Sword and melee combat

- Replaced point/cone melee checks with latency-compensated swept-capsule collision.
- Added three distinct attacks: horizontal cut, reverse cut, and a longer heavy overhead finisher.
- Added combo-specific range, damage, sweep radius, lunge, timing, first-person animation, remote animation, audio, and pooled slash effects.
- The normal sword can cleave two closely grouped targets; the rare Void Reaper retains one-hit damage but only confirms a valid swept hit.
- Walls now block melee strikes, and parries still interrupt the attack chain.

### Momentum grapple

- Increased usable range and reduced failed-hook lockout.
- Added magnetic assistance for authored grapple anchors while retaining server line-of-sight validation.
- Replaced constant pulling with a spring/tension rope model that preserves tangential velocity, reels in gradually, limits maximum speed, reduces gravity while attached, and adds a controlled release boost.
- Added immediate client prediction, curved rope rendering, tension/cooldown meter, attach/release audio, and authoritative velocity reconciliation.

### Shooting and ADS

- Added deterministic recoil patterns per firearm rather than purely random camera kick.
- Server validates the shot direction supplied by the client against the authoritative view angle.
- Crouched eye height is used for firing, stationary first-shot ADS accuracy is improved, crouching braces the weapon, and movement/airborne bloom remains server-authoritative.
- ADS now transitions progressively with weapon-specific response and sensitivity scaling.
- Scope presentation includes optic glass, mil marks, zoom/weapon label, braced/tracking state, estimated range readout, and scope-specific styling.
- Added damage numbers, critical-hit feedback, dry-fire audio, improved muzzle/tracer/impact feedback, and smoother recoil springs.

### Networking and performance

- 30 Hz authoritative simulation with 15 Hz interest-managed snapshots remains suitable for a small EC2 instance.
- Added WebSocket heartbeat cleanup, message-rate protection, reconnect backoff with jitter, visibility-aware ping frequency, and disposable-input backpressure handling.
- Reused pooled tracers, particles, flashes, and sword slashes.
- Removed recurring first-person layout allocations and retained adaptive render resolution and quality presets.
- Added deterministic dependency installation through `package-lock.json` and rollback support for failed existing-instance updates.

## Controls

| Input | Action |
|---|---|
| `WASD` | Move |
| `Shift` | Sprint |
| `C` | Crouch / slide |
| `Space` | Jump / mantle; skip kill cam |
| Mouse | Look |
| Left click | Fire / melee combo |
| Right click | ADS / sword block |
| `E` | Grapple / release grapple |
| `Q` | Dash when Blink Core is active |
| `R` | Reload |
| `1–9` | Standard weapons |
| `0` | Void Reaper after pickup |
| `V` | First-/third-person camera |
| `F` | Skip kill cam |
| `Enter` | Chat |
| `Tab` | Scoreboard |
| `Esc` | Settings |

## Project layout

```text
voxel-arena/
├── package.json
├── package-lock.json
├── server.js
├── public/
│   ├── index.html
│   ├── style.css
│   ├── main.js
│   ├── config.js
│   ├── world.js
│   ├── player.js
│   ├── effects.js
│   ├── audio.js
│   └── network.js
├── tools/
│   ├── check-project.js
│   └── smoke-test.js
├── user-data.sh
└── update-existing-instance.sh
```

## Local validation

Requires Node.js 18 or newer.

```bash
npm ci
npm run check
npm run smoke
npm start
```

- `npm run check` syntax-checks all JavaScript, confirms required assets, and validates every authored spawn against the server collider set.
- `npm run smoke` launches a temporary server, loads the status API and browser client, connects ten WebSocket players, validates their spawns, and exercises input, shooting, sword, and grapple handlers.

Open `http://localhost:3000` after starting the server.

## Deploy a new Amazon Linux 2023 instance

1. Upload this exact directory structure to `https://github.com/jmdvflcel/voxel-arena` on the `main` branch.
2. Create an Amazon Linux 2023 EC2 instance.
3. Allow inbound TCP port `80` in the instance security group.
4. Paste `user-data.sh` into EC2 user data before launching.
5. Open the instance public IPv4 address after the health check completes.

The deployment installs Node.js, Nginx, dependencies, a systemd service, and a 1 GiB swap file for installation stability on a `t3.micro`.

## Update an existing instance

After pushing v7 to the repository, run this in EC2 Instance Connect:

```bash
curl -fsSL https://raw.githubusercontent.com/jmdvflcel/voxel-arena/main/update-existing-instance.sh | sudo bash
```

The updater fetches `main`, validates the project, installs locked dependencies, restarts the services, performs a health check, and rolls back to the previous Git revision if the update fails.

## Practical quality ceiling

The changes target the responsiveness and clarity associated with modern arena shooters, but this remains a lightweight browser game using generated geometry and synthesized audio on a small general-purpose server. Reaching literal current-generation console or premium Steam production quality would require a dedicated engine, authored models/animations/materials/audio, substantially larger art and engineering teams, platform-specific optimization, anti-cheat, matchmaking, persistence, and broader hardware testing. v7 focuses on the highest-value mechanical and technical improvements achievable inside the current architecture.
