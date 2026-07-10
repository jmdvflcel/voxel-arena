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
  constructor(scene, particleBudget = 160) {
    this.scene = scene;
    this.time = 0;

    this.tracerCursor = { value: 0 };
    this.particleCursor = { value: 0 };
    this.flashCursor = { value: 0 };

    this.tracerGeometry = new THREE.BoxGeometry(0.025, 0.025, 1);
    this.particleGeometry = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    this.flashGeometry = new THREE.SphereGeometry(0.13, 8, 6);

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
  }

  spawnTracer(origin, end, color = 0xffffff, width = 1) {
    const tracer = nextAvailable(this.tracerPool, this.tracerCursor);
    const start = new THREE.Vector3(origin.x, origin.y, origin.z);
    const finish = new THREE.Vector3(end.x, end.y, end.z);
    const direction = finish.clone().sub(start);
    const length = Math.max(direction.length(), 0.01);
    const midpoint = start.clone().add(finish).multiplyScalar(0.5);

    tracer.position.copy(midpoint);
    tracer.scale.set(width, width, length);
    tracer.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction.normalize()
    );
    tracer.material.color.setHex(color);
    tracer.material.opacity = 0.95;
    tracer.userData.life = 0.09;
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

  update(dt) {
    this.time += dt;

    for (const tracer of this.tracerPool) {
      if (!tracer.visible) continue;
      tracer.userData.life -= dt;
      tracer.material.opacity = Math.max(0, tracer.userData.life / 0.09);

      if (tracer.userData.life <= 0) {
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
  }
}
