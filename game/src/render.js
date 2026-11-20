// Rendering only: the three.js renderer, the sun and sky, and the chase camera.
// The camera orbits on mouse drag and follows the player on foot or the car,
// smoothing its yaw toward the vehicle's heading while driving.

import * as THREE from 'three';
import { PALETTE } from './config.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.sky, 220, 520);

  const sun = new THREE.DirectionalLight(0xfff2cf, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Camera state: yaw/pitch orbit, smoothed; distance by mode.
  const cam = {
    yaw: 0,
    pitch: 0.32,
    distance: 8,
    height: 3.2,
    shake: 0,
    fixed: null, // { pos: Vector3, look: Vector3 } for screenshot staging
    applyDrag(dx, dy) {
      this.yaw -= dx * 0.0042;
      this.pitch = Math.max(0.08, Math.min(1.1, this.pitch + dy * 0.0032));
    },
    update(dt, targetPos, targetHeading, driving, speed) {
      if (this.fixed) {
        camera.position.copy(this.fixed.pos);
        camera.lookAt(this.fixed.look);
        return;
      }
      if (driving) {
        // Ease the orbit behind the car; the driver can still drag to look around.
        let diff = targetHeading - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * (1.6 + Math.abs(speed) * 0.03));
        this.distance = 10.5;
        this.height = 4.2;
      } else {
        this.distance = 8;
        this.height = 3.1;
      }
      const d = this.distance;
      const h = this.height + Math.sin(this.pitch) * d * 0.55;
      const back = Math.cos(this.pitch) * d;
      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      this.shake = Math.max(0, this.shake - dt * 2.2);
      camera.position.set(
        targetPos.x - Math.sin(this.yaw) * back + shakeX,
        targetPos.y + h + shakeY,
        targetPos.z - Math.cos(this.yaw) * back,
      );
      camera.lookAt(targetPos.x, targetPos.y + 1.6, targetPos.z);
    },
    addShake(amount) {
      this.shake = Math.min(0.6, this.shake + amount);
    },
  };

  return { renderer, scene, camera, cam };
}
