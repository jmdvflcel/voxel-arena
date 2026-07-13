import * as THREE from "/vendor/three.module.js";

function makePool(size, factory) {
  const items = [];
  for (let i = 0; i < size; i++) {
    const item = factory();
    item.visible = false;
    items.push(item);
  }
  return items;
}

function nextAvailable(pool, cursorState) {
  const item = pool[cursorState.value % pool.length];
  cursorState.value = (cursorState.value + 1) % pool.length;
  return item;
}

export class EffectsSystem {
  constructor(scene, particleBudget = 160, options = {}) {
    this.scene = scene;
    this.time = 0;

    this.tracerCursor = { value: 0 };
    this.particleCursor = { value: 0 };
    this.flashCursor = { value: 0 };
    this.slashCursor = { value: 0 };
    this.decalCursor = { value: 0 };
    this.casingCursor = { value: 0 };
    this.projectileCursor = { value: 0 };

    this.tracerGeometry = new THREE.BoxGeometry(0.025, 0.025, 1);
    this.particleGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.flashGeometry = new THREE.SphereGeometry(0.13, 8, 6);
    this.slashGeometry = new THREE.TorusGeometry(0.82, 0.025, 4, 22, Math.PI * 0.92);
    this.decalGeometry = new THREE.CircleGeometry(0.075, 10);
    this.casingGeometry = new THREE.BoxGeometry(0.035, 0.08, 0.025);
    this.projectileGeometry = new THREE.SphereGeometry(0.07, 8, 6);

    this.tracerPool = makePool(80, () => {
      const mesh = new THREE.Mesh(
        this.tracerGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.95
        })
      );
      mesh.userData.life = 0;
      this.scene.add(mesh);
      return mesh;
    });

    this.particlePool = makePool(particleBudget, () => {
      const mesh = new THREE.Mesh(
        this.particleGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1
        })
      );
      mesh.userData.velocity = new THREE.Vector3();
      mesh.userData.life = 0;
      mesh.userData.gravity = 0;
      this.scene.add(mesh);
      return mesh;
    });

    this.flashPool = makePool(20, () => {
      const mesh = new THREE.Mesh(
        this.flashGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffef9a,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      mesh.userData.life = 0;
      this.scene.add(mesh);
      return mesh;
    });


    this.slashPool = makePool(14, () => {
      const mesh = new THREE.Mesh(
        this.slashGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x8ce8ff,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.userData.life = 0;
      this.scene.add(mesh);
      return mesh;
    });

    const decalBudget = Math.max(12, Number(options.decals || 56));
    this.decalPool = makePool(decalBudget, () => {
      const mesh = new THREE.Mesh(
        this.decalGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x111820,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          side: THREE.DoubleSide
        })
      );
      mesh.userData.life = 0;
      mesh.userData.maxLife = 0;
      this.scene.add(mesh);
      return mesh;
    });

    const casingBudget = Math.max(8, Number(options.shellCasings || 28));
    this.casingPool = makePool(casingBudget, () => {
      const mesh = new THREE.Mesh(
        this.casingGeometry,
        new THREE.MeshStandardMaterial({ color: 0xc7a35b, roughness: 0.38, metalness: 0.78 })
      );
      mesh.userData.velocity = new THREE.Vector3();
      mesh.userData.spin = new THREE.Vector3();
      mesh.userData.life = 0;
      this.scene.add(mesh);
      return mesh;
    });

    this.projectilePool = makePool(16, () => {
      const mesh = new THREE.Mesh(
        this.projectileGeometry,
        new THREE.MeshBasicMaterial({
          color: 0x65f3ff,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
      mesh.userData.life = 0;
      mesh.userData.elapsed = 0;
      mesh.userData.start = new THREE.Vector3();
      mesh.userData.end = new THREE.Vector3();
      this.scene.add(mesh);
      return mesh;
    });
  }

  spawnTracer(origin, end, color = 0xffffff, width = 1) {
    const tracer = nextAvailable(this.tracerPool, this.tracerCursor);
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const finish = new THREE.Vector3(end.x, end.y, end.z);
    const direction = finish.clone().sub(start);
    const distance = Math.max(direction.length(), 0.01);
    direction.normalize();

    const segmentLength = Math.min(3.2, Math.max(0.65, distance * 0.12));
    const duration = THREE.MathUtils.clamp(distance / 180, 0.055, 0.2);

    tracer.scale.set(width, width, segmentLength);
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    tracer.material.color.setHex(color);
    tracer.material.opacity = 0.95;
    tracer.userData.start = start;
    tracer.userData.direction = direction;
    tracer.userData.distance = distance;
    tracer.userData.segmentLength = segmentLength;
    tracer.userData.duration = duration;
    tracer.userData.elapsed = 0;
    tracer.userData.life = duration;
    tracer.position.copy(start).addScaledVector(direction, segmentLength * 0.5);
    tracer.visible = true;
  }

  spawnMuzzle(position, color = 0xffef9a, scale = 1) {
    const flash = nextAvailable(this.flashPool, this.flashCursor);
    flash.position.set(position.x, position.y, position.z);
    flash.scale.setScalar(scale);
    flash.material.color.setHex(color);
    flash.material.opacity = 1;
    flash.userData.life = 0.07;
    flash.visible = true;
  }

  spawnImpact(position, color = 0xffd27d, count = 8, force = 3.2) {
    for (let i = 0; i < count; i++) {
      const particle = nextAvailable(this.particlePool, this.particleCursor);
      particle.position.set(position.x, position.y, position.z);
      particle.material.color.setHex(color);
      particle.material.opacity = 1;
      particle.scale.setScalar(0.7 + Math.random() * 0.7);
      particle.userData.velocity.set(
        (Math.random() - 0.5) * force,
        Math.random() * force * 0.8,
        (Math.random() - 0.5) * force
      );
      particle.userData.life = 0.28 + Math.random() * 0.28;
      particle.userData.gravity = 9;
      particle.visible = true;
    }
  }

  spawnDust(position, count = 5) {
    for (let i = 0; i < count; i++) {
      const particle = nextAvailable(this.particlePool, this.particleCursor);
      particle.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + 0.05,
        position.z + (Math.random() - 0.5) * 0.5
      );
      particle.material.color.setHex(0x9d8b72);
      particle.material.opacity = 0.48;
      particle.scale.setScalar(1.2 + Math.random() * 1.2);
      particle.userData.velocity.set(
        (Math.random() - 0.5) * 0.8,
        0.3 + Math.random() * 0.7,
        (Math.random() - 0.5) * 0.8
      );
      particle.userData.life = 0.5 + Math.random() * 0.35;
      particle.userData.gravity = 0.5;
      particle.visible = true;
    }
  }

  spawnDash(position, direction, color = 0x6fe7ff) {
    const length = Math.hypot(direction.x, direction.z) || 1;
    for (let i = 0; i < 18; i++) {
      const particle = nextAvailable(this.particlePool, this.particleCursor);
      particle.position.set(
        position.x + (Math.random() - 0.5) * 0.7,
        position.y + 0.35 + Math.random() * 1.1,
        position.z + (Math.random() - 0.5) * 0.7
      );
      particle.material.color.setHex(color);
      particle.material.opacity = 0.85;
      particle.scale.set(0.6, 0.6, 2.4 + Math.random() * 2.2);
      particle.rotation.y = Math.atan2(direction.x / length, direction.z / length);
      particle.userData.velocity.set(
        -direction.x / length * (4 + Math.random() * 5),
        (Math.random() - 0.5) * 0.8,
        -direction.z / length * (4 + Math.random() * 5)
      );
      particle.userData.life = 0.18 + Math.random() * 0.18;
      particle.userData.gravity = 0;
      particle.visible = true;
    }
  }

  spawnPowerBurst(position, color = 0xffffff) {
    for (let i = 0; i < 26; i++) {
      const particle = nextAvailable(this.particlePool, this.particleCursor);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.8 + Math.random() * 3.8;
      particle.position.set(position.x, position.y + 0.8, position.z);
      particle.material.color.setHex(color);
      particle.material.opacity = 1;
      particle.scale.setScalar(0.75 + Math.random() * 0.9);
      particle.userData.velocity.set(
        Math.cos(angle) * speed,
        0.5 + Math.random() * 3.0,
        Math.sin(angle) * speed
      );
      particle.userData.life = 0.35 + Math.random() * 0.45;
      particle.userData.gravity = 4;
      particle.visible = true;
    }
  }

  spawnSlash(position, direction, color = 0x8ce8ff, combo = 0) {
    const slash = nextAvailable(this.slashPool, this.slashCursor);
    const forward = new THREE.Vector3(direction.x || 0, direction.y || 0, direction.z || -1).normalize();
    slash.position.set(position.x, position.y + 1.05, position.z).addScaledVector(forward, 1.25);
    slash.material.color.setHex(color);
    slash.material.opacity = combo === 2 ? 0.95 : 0.76;
    slash.scale.setScalar(combo === 2 ? 1.4 : 1 + combo * 0.12);
    slash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    slash.rotateZ(combo === 1 ? Math.PI * 0.68 : combo === 2 ? Math.PI * 0.45 : -Math.PI * 0.18);
    slash.userData.life = combo === 2 ? 0.2 : 0.15;
    slash.userData.maxLife = slash.userData.life;
    slash.userData.growth = combo === 2 ? 3.8 : 2.5;
    slash.visible = true;
  }

  spawnDecal(position, normal = { x: 0, y: 1, z: 0 }, surface = "stone") {
    const decal = nextAvailable(this.decalPool, this.decalCursor);
    const n = new THREE.Vector3(normal.x || 0, normal.y || 0, normal.z || 0).normalize();
    if (n.lengthSq() < 0.1) n.set(0, 1, 0);
    decal.position.set(position.x, position.y, position.z).addScaledVector(n, 0.012);
    decal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    decal.rotateZ(Math.random() * Math.PI * 2);
    const color = surface === "metal" ? 0x26313b : surface === "grass" ? 0x2d271d : 0x17191d;
    decal.material.color.setHex(color);
    decal.material.opacity = 0.62 + Math.random() * 0.18;
    decal.scale.setScalar(0.72 + Math.random() * 0.65);
    decal.userData.life = 18 + Math.random() * 10;
    decal.userData.maxLife = decal.userData.life;
    decal.visible = true;
  }

  spawnCasing(position, direction = { x: 1, y: 0.6, z: 0 }, weapon = "rifle") {
    const casing = nextAvailable(this.casingPool, this.casingCursor);
    casing.position.set(position.x, position.y, position.z);
    const scale = weapon === "shotgun" ? 1.5 : weapon === "railgun" ? 0.8 : weapon === "pistol" ? 0.75 : 1;
    casing.scale.setScalar(scale);
    casing.userData.velocity.set(
      (direction.x || 0) * (1.6 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.5,
      1.2 + Math.random() * 1.2,
      (direction.z || 0) * (1.6 + Math.random() * 1.2) + (Math.random() - 0.5) * 0.5
    );
    casing.userData.spin.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
    casing.userData.life = 2.8;
    casing.visible = true;
  }

  spawnProjectile(origin, end, color = 0x65f3ff, travelTime = 0.18, scale = 1) {
    const projectile = nextAvailable(this.projectilePool, this.projectileCursor);
    projectile.userData.start.set(origin.x, origin.y, origin.z);
    projectile.userData.end.set(end.x, end.y, end.z);
    projectile.userData.elapsed = 0;
    projectile.userData.life = Math.max(0.04, travelTime);
    projectile.userData.duration = projectile.userData.life;
    projectile.material.color.setHex(color);
    projectile.material.opacity = 1;
    projectile.scale.setScalar(scale);
    projectile.position.copy(projectile.userData.start);
    projectile.visible = true;
  }

  update(dt) {
    this.time += dt;

    for (const tracer of this.tracerPool) {
      if (!tracer.visible) continue;

      tracer.userData.elapsed += dt;
      tracer.userData.life -= dt;
      const progress = THREE.MathUtils.clamp(
        tracer.userData.elapsed / Math.max(0.001, tracer.userData.duration),
        0,
        1
      );
      const headDistance = THREE.MathUtils.lerp(
        tracer.userData.segmentLength * 0.5,
        tracer.userData.distance,
        progress
      );

      tracer.position
        .copy(tracer.userData.start)
        .addScaledVector(tracer.userData.direction, headDistance);
      tracer.material.opacity = Math.max(0, 1 - progress) * 0.95;

      if (progress >= 1 || tracer.userData.life <= 0) {
        tracer.visible = false;
      }
    }

    for (const particle of this.particlePool) {
      if (!particle.visible) continue;

      particle.userData.life -= dt;
      particle.userData.velocity.y -= particle.userData.gravity * dt;
      particle.position.addScaledVector(particle.userData.velocity, dt);
      particle.rotation.x += dt * 8;
      particle.rotation.y += dt * 6;
      particle.material.opacity = Math.max(0, Math.min(1, particle.userData.life * 3));

      if (particle.userData.life <= 0) {
        particle.visible = false;
      }
    }

    for (const flash of this.flashPool) {
      if (!flash.visible) continue;

      flash.userData.life -= dt;
      flash.scale.multiplyScalar(1 + dt * 7);
      flash.material.opacity = Math.max(0, flash.userData.life / 0.07);

      if (flash.userData.life <= 0) {
        flash.visible = false;
      }
    }

    for (const slash of this.slashPool) {
      if (!slash.visible) continue;
      slash.userData.life -= dt;
      slash.scale.multiplyScalar(1 + dt * slash.userData.growth);
      slash.material.opacity = Math.max(0, slash.userData.life / slash.userData.maxLife) * 0.82;
      if (slash.userData.life <= 0) slash.visible = false;
    }

    for (const decal of this.decalPool) {
      if (!decal.visible) continue;
      decal.userData.life -= dt;
      if (decal.userData.life < 3) decal.material.opacity = Math.max(0, decal.userData.life / 3) * 0.72;
      if (decal.userData.life <= 0) decal.visible = false;
    }

    for (const casing of this.casingPool) {
      if (!casing.visible) continue;
      casing.userData.life -= dt;
      casing.userData.velocity.y -= 12 * dt;
      casing.position.addScaledVector(casing.userData.velocity, dt);
      casing.rotation.x += casing.userData.spin.x * dt;
      casing.rotation.y += casing.userData.spin.y * dt;
      casing.rotation.z += casing.userData.spin.z * dt;
      if (casing.position.y < 0.04) {
        casing.position.y = 0.04;
        if (Math.abs(casing.userData.velocity.y) > 0.55) casing.userData.velocity.y *= -0.32;
        else casing.userData.velocity.y = 0;
        casing.userData.velocity.x *= 0.72;
        casing.userData.velocity.z *= 0.72;
        casing.userData.spin.multiplyScalar(0.7);
      }
      if (casing.userData.life <= 0) casing.visible = false;
    }

    for (const projectile of this.projectilePool) {
      if (!projectile.visible) continue;
      projectile.userData.elapsed += dt;
      projectile.userData.life -= dt;
      const progress = THREE.MathUtils.clamp(projectile.userData.elapsed / projectile.userData.duration, 0, 1);
      projectile.position.lerpVectors(projectile.userData.start, projectile.userData.end, progress);
      projectile.material.opacity = Math.max(0, 1 - progress * 0.55);
      projectile.scale.multiplyScalar(1 + dt * 2.4);
      if (progress >= 1 || projectile.userData.life <= 0) projectile.visible = false;
    }
  }
}
