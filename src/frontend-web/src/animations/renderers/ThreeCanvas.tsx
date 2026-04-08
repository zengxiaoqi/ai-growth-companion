/**
 * React wrapper for Three.js.
 * Manages WebGL renderer, scene, and camera lifecycle.
 */
import { useEffect, useRef } from 'react';
import type { WebGLRenderer, Scene, Camera, PerspectiveCamera } from 'three';

export interface ThreeSceneSetup {
  (
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    params: Record<string, unknown>,
  ): () => void; // returns cleanup function
}

export interface ThreeCanvasProps {
  setupScene: ThreeSceneSetup;
  params: Record<string, unknown>;
  isPlaying: boolean;
  onDurationTick?: (elapsed: number) => void;
  onSceneComplete?: () => void;
  className?: string;
}

export default function ThreeCanvas({
  setupScene,
  params,
  isPlaying,
  onDurationTick,
  onSceneComplete,
  className,
}: ThreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const cleanupFnRef = useRef<(() => void) | null>(null);
  const durationRef = useRef<number>((params.durationSec as number) || 10);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    const initThree = async () => {
      const THREE = await import('three');
      if (cancelled || !containerRef.current) return;

      const width = containerRef.current.clientWidth || 640;
      const height = containerRef.current.clientHeight || 360;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
      camera.position.z = 5;
      cameraRef.current = camera;

      const cleanup = setupScene(renderer, scene, camera, params);
      cleanupFnRef.current = cleanup;
    };

    initThree();

    return () => {
      cancelled = true;
      cleanupFnRef.current?.();
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.domElement.remove();
        rendererRef.current = null;
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupScene, JSON.stringify(params)]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    startTimeRef.current = Date.now();
    const duration = durationRef.current * 1000;

    const animate = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

      rendererRef.current.render(sceneRef.current, cameraRef.current);

      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      onDurationTick?.(elapsed);

      if (elapsed * 1000 >= duration) {
        onSceneComplete?.();
        return;
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, onDurationTick, onSceneComplete]);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (rendererRef.current && cameraRef.current) {
          rendererRef.current.setSize(width, height);
          const cam = cameraRef.current as PerspectiveCamera;
          if (cam.isPerspectiveCamera) {
            cam.aspect = width / height;
            cam.updateProjectionMatrix();
          }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className={className} />;
}
