"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { Suspense, useRef } from "react";
import * as THREE from "three";

/** Fully local lighting — no CDN HDR / Environment presets. */
function LiquidMark() {
  const mesh = useRef<THREE.Mesh>(null);
  const knot = useRef<THREE.Mesh>(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;
    if (mesh.current) {
      mesh.current.rotation.x = Math.sin(t * 0.35) * 0.22 + 0.15;
      mesh.current.rotation.y = t * 0.28;
      mesh.current.scale.setScalar(1 + Math.sin(t * 0.9) * 0.035);
    }
    if (knot.current) {
      knot.current.rotation.x = t * 0.4;
      knot.current.rotation.z = t * 0.25;
    }
  });

  return (
    <Float speed={1.6} rotationIntensity={0.35} floatIntensity={0.55}>
      <mesh ref={mesh}>
        <icosahedronGeometry args={[1.15, 5]} />
        <meshPhysicalMaterial
          color="#d4ff4f"
          metalness={0.15}
          roughness={0.08}
          transmission={0.85}
          thickness={1.4}
          ior={1.28}
          clearcoat={1}
          clearcoatRoughness={0.1}
          attenuationColor="#3f6212"
          attenuationDistance={0.6}
          transparent
        />
      </mesh>
      <mesh ref={knot} scale={0.45}>
        <torusKnotGeometry args={[0.85, 0.22, 128, 24]} />
        <meshPhysicalMaterial
          color="#ecfccb"
          metalness={0.2}
          roughness={0.06}
          transmission={0.7}
          thickness={0.8}
          ior={1.3}
          clearcoat={1}
          clearcoatRoughness={0.08}
          attenuationColor="#84cc16"
          attenuationDistance={0.45}
          transparent
        />
      </mesh>
    </Float>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 3]} intensity={1.6} color="#f7fee7" />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#9ae6c8" />
      <pointLight position={[-3, -1, 2]} intensity={2.4} color="#b8f34a" />
      <pointLight position={[2, 1, -2]} intensity={1.5} color="#6ee7b7" />
    </>
  );
}

export function LiquidLogo({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 3.6], fov: 40 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent", touchAction: "none" }}
      >
        <Suspense fallback={null}>
          <SceneLights />
          <LiquidMark />
        </Suspense>
      </Canvas>
    </div>
  );
}
