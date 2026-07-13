# Voxel Combat Arena v8.7 Sight Guide

Version 8.6 renders a dedicated camera-mounted weapon-and-arms viewmodel and uses the weapon model itself for ordinary aiming. The center of each sight is projected to the camera center and the weapon remains visible throughout the ADS transition.

| Weapon | Sight | Magnification behavior |
|---|---|---|
| Pulse Pistol | Squared rear notch + illuminated front post | 1.03×; essentially no artificial zoom |
| Viper SMG | Compact rear aperture + front orb/post | 1.06× |
| Vector Rifle | Open cyan holographic ring and dot | 1.12× |
| Trident Burst | Enclosed prism housing with etched cross reticle | 1.35× / 1.75× |
| Scatter Cannon | Receiver rib + bright front bead | 1.04× |
| Titan LMG | Protected amber-chevron reflex sight | 1.14× |
| Longshot | Conventional circular marksman scope | 2.5× / 4× / 6× |
| Apex Railgun | Rectangular digital targeting display | 3× / 5× / 8× |

Only the Longshot and Apex Railgun use a screen-space scope mask. Every other firearm aims through visible 3D sight geometry mounted on the weapon.

## Viewmodel guarantees

- The camera is part of the scene graph.
- `ViewModelRoot` is a direct camera child.
- The active weapon and both arms remain visible in first person.
- Viewmodel meshes ignore world depth and fog and are not frustum-culled.
- Only Longshot and Apex Railgun use fullscreen scope masks.

## Aim truth

The camera-center sight vector is sent with each shot, validated by the server, and used as the authoritative base direction. Tracers are drawn only from returned server impacts so their endpoints match hit registration.
