"use client";

import { useEffect, useRef } from "react";

export function ThreeLogo() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function start() {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      try {
        const THREE = await import("three");

        if (disposed) {
          return;
        }

        const renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.set(0, 0, 6.2);

        const group = new THREE.Group();
        scene.add(group);

        const outerGeometry = new THREE.IcosahedronGeometry(1.9, 1);
        const outerMaterial = new THREE.MeshBasicMaterial({
          color: 0x26e0c8,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
        });
        const outer = new THREE.Mesh(outerGeometry, outerMaterial);
        group.add(outer);

        const innerGeometry = new THREE.TorusKnotGeometry(0.72, 0.18, 120, 16);
        const innerMaterial = new THREE.MeshBasicMaterial({
          color: 0x7c5cff,
          wireframe: true,
          transparent: true,
          opacity: 0.75,
        });
        const inner = new THREE.Mesh(innerGeometry, innerMaterial);
        inner.rotation.x = 0.8;
        group.add(inner);

        const pointsGeometry = new THREE.BufferGeometry();
        const pointCount = 180;
        const positions = new Float32Array(pointCount * 3);

        for (let index = 0; index < pointCount; index += 1) {
          const radius = 2.4 + Math.random() * 1.6;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[index * 3 + 1] = radius * Math.cos(phi);
          positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }

        pointsGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions, 3),
        );
        const pointsMaterial = new THREE.PointsMaterial({
          color: 0x9fb4ff,
          size: 0.035,
          transparent: true,
          opacity: 0.7,
        });
        const points = new THREE.Points(pointsGeometry, pointsMaterial);
        group.add(points);

        const resize = () => {
          const width = canvas.clientWidth || 480;
          const height = canvas.clientHeight || 480;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);

        let frame = 0;
        const clock = new THREE.Clock();

        const animate = () => {
          const elapsed = clock.getElapsedTime();
          group.rotation.y = elapsed * 0.25;
          group.rotation.x = Math.sin(elapsed * 0.4) * 0.18;
          inner.rotation.z = elapsed * 0.6;
          points.rotation.y = -elapsed * 0.08;
          renderer.render(scene, camera);
          frame = requestAnimationFrame(animate);
        };

        animate();

        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          outerGeometry.dispose();
          outerMaterial.dispose();
          innerGeometry.dispose();
          innerMaterial.dispose();
          pointsGeometry.dispose();
          pointsMaterial.dispose();
          renderer.dispose();
        };
      } catch {
        // The CSS fallback remains visible when WebGL is unavailable.
      }
    }

    void start();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div className="three-logo" aria-hidden="true">
      <div className="three-glow three-glow-a" />
      <div className="three-glow three-glow-b" />
      <div className="three-fallback">V</div>
      <canvas ref={canvasRef} className="three-canvas" />
      <div className="three-orbit three-orbit-a" />
      <div className="three-orbit three-orbit-b" />
    </div>
  );
}
