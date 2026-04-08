/**
 * Day/night cycle animation template.
 * 3D Earth rotation with sun, moon, and stars using Three.js.
 */
import { registerTemplate } from '../../registry';
import { registerThreeScene } from '../../renderers/AnimationRenderer';
import type { ThreeSceneSetup } from '../../renderers/ThreeCanvas';
import type { PerspectiveCamera } from 'three';

// ── Template registration ──

registerTemplate({
  id: 'science.day-night-cycle',
  domain: 'science',
  subcategory: 'earth-science',
  engine: 'three',
  ageGroups: ['3-4', '5-6'],
  params: [
    {
      name: 'rotationSpeed',
      type: 'number',
      required: false,
      defaultValue: 1,
      label: '旋转速度',
    },
    {
      name: 'showLabels',
      type: 'boolean',
      required: false,
      defaultValue: true,
      label: '显示标签',
    },
  ],
  defaultDurationSec: 15,
  description: '昼夜交替动画：3D地球旋转展示白天和黑夜的变化',
});

// ── Three.js scene registration ──

const setupScene: ThreeSceneSetup = (renderer, scene, camera, params) => {
  // We import THREE dynamically inside ThreeCanvas, but here the renderer/scene/camera
  // are already created. We just need THREE for creating geometry/materials.
  // Since ThreeCanvas already imported THREE to create these objects, we import it here too.
  let THREE: typeof import('three');
  let earth: import('three').Mesh;
  let sun: import('three').Mesh;
  let moon: import('three').Mesh;
  let stars: import('three').Points;
  let labelDiv: HTMLDivElement | null = null;
  let animFrameId = 0;

  const rotationSpeed = (params.rotationSpeed as number) || 1;
  const showLabels = params.showLabels !== false;

  const init = async () => {
    THREE = await import('three');

    // Camera positioning
    const perspCam = camera as PerspectiveCamera;
    perspCam.position.set(0, 1.5, 5);
    perspCam.lookAt(0, 0, 0);

    // Ambient light (dim, simulating space)
    const ambient = new THREE.AmbientLight(0x222244, 0.5);
    scene.add(ambient);

    // ── Earth ──
    // Create a procedural earth texture using canvas
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 256;
    earthCanvas.height = 128;
    const ctx = earthCanvas.getContext('2d');
    if (ctx) {
      // Ocean base
      ctx.fillStyle = '#4488cc';
      ctx.fillRect(0, 0, 256, 128);

      // Continents (simple shapes)
      ctx.fillStyle = '#55aa55';
      // Left continent
      ctx.beginPath();
      ctx.ellipse(70, 50, 25, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      // Center continent
      ctx.beginPath();
      ctx.ellipse(140, 45, 15, 20, 0.3, 0, Math.PI * 2);
      ctx.fill();
      // Right continent
      ctx.beginPath();
      ctx.ellipse(200, 55, 22, 25, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Ice caps
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 8);
      ctx.fillRect(0, 120, 256, 8);
    }
    const earthTexture = new THREE.CanvasTexture(earthCanvas);

    const earthGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 25,
    });
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // ── Atmosphere glow ──
    const atmosGeometry = new THREE.SphereGeometry(1.58, 32, 32);
    const atmosMaterial = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosGeometry, atmosMaterial);
    scene.add(atmosphere);

    // ── Sun ──
    const sunGeometry = new THREE.SphereGeometry(0.4, 16, 16);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.set(6, 2, 0);
    scene.add(sun);

    // Sun point light
    const sunLight = new THREE.PointLight(0xffffcc, 2, 20);
    sunLight.position.copy(sun.position);
    scene.add(sunLight);

    // Sun glow sprite
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 64;
    glowCanvas.height = 64;
    const glowCtx = glowCanvas.getContext('2d');
    if (glowCtx) {
      const gradient = glowCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255, 230, 80, 0.6)');
      gradient.addColorStop(1, 'rgba(255, 230, 80, 0)');
      glowCtx.fillStyle = gradient;
      glowCtx.fillRect(0, 0, 64, 64);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
    });
    const glowSprite = new THREE.Sprite(glowMaterial);
    glowSprite.scale.set(3, 3, 1);
    glowSprite.position.copy(sun.position);
    scene.add(glowSprite);

    // ── Moon ──
    const moonGeometry = new THREE.SphereGeometry(0.2, 16, 16);
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xccccdd });
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(-6, 1.5, -2);
    scene.add(moon);

    // ── Stars ──
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 200;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 15 + Math.random() * 10;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      sizeAttenuation: true,
    });
    stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // ── Label overlay ──
    if (showLabels) {
      const container = renderer.domElement.parentElement;
      if (container) {
        labelDiv = document.createElement('div');
        labelDiv.style.cssText =
          'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
          'color:#333;font-size:14px;font-weight:bold;padding:4px 12px;' +
          'background:rgba(255,255,255,0.8);border-radius:8px;pointer-events:none;z-index:10;';
        container.style.position = 'relative';
        container.appendChild(labelDiv);
      }
    }

    // ── Animation loop ──
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const rotSpeed = rotationSpeed * 0.3;

      // Rotate earth
      earth.rotation.y = elapsed * rotSpeed;

      // Slowly rotate stars
      stars.rotation.y = elapsed * 0.01;

      // Update label based on earth rotation
      if (labelDiv) {
        const facingSun = Math.cos(earth.rotation.y) > 0;
        labelDiv.textContent = facingSun ? '白天' : '夜晚';
      }

      renderer.render(scene, camera);
    };
    animate();
  };

  init();

  // Cleanup
  return () => {
    cancelAnimationFrame(animFrameId);
    if (labelDiv && labelDiv.parentElement) {
      labelDiv.parentElement.removeChild(labelDiv);
    }
  };
};

registerThreeScene('science.day-night-cycle', setupScene);
