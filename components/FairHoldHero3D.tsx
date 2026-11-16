"use client";

import { useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Lenis from "lenis";

/**
 * FairHold Hero 3D — immersive orbit + particle field.
 * R3F scene with red accent geometries, orbit controls, Lenis smooth scroll.
 */
function OrbitalOrb() {
  const groupRef = useRef<any>(null);

  useFrame((state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
      groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.6) * 0.3;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[2.2, 32, 32]} />
        <meshStandardMaterial
          color="#0e0e12"
          roughness={0.2}
          metalness={0.8}
          emissive="#a83032"
          emissiveIntensity={0.08}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.4, 1]} />
        <meshStandardMaterial
          color="#a83032"
          roughness={0.3}
          metalness={0.7}
          emissive="#a83032"
          emissiveIntensity={0.15}
        />
      </mesh>
      <mesh>
        <torusKnotGeometry args={[1.2, 0.35, 80, 20]} />
        <meshStandardMaterial
          color="#a83032"
          roughness={0.4}
          metalness={0.6}
          emissive="#a83032"
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh>
        <torusGeometry args={[3.2, 0.06, 16, 100]} />
        <meshStandardMaterial
          color="#a83032"
          roughness={0.3}
          metalness={0.7}
          emissive="#a83032"
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  );
}

function ParticleField({ count = 120 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    position: {
      x: (Math.random() - 0.5) * 12,
      y: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
    },
    size: Math.random() * 2 + 0.5,
  }));

  return (
    <>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.position.x, p.position.y, p.position.z]}>
          <sphereGeometry args={[p.size, 8, 8]} />
          <meshBasicMaterial color="#a83032" transparent opacity={0.35} />
        </mesh>
      ))}
    </>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <directionalLight position={[-10, -5, -10]} intensity={0.4} color="#a83032" />
      <pointLight position={[0, 5, 0]} intensity={0.6} color="#a83032" />
      <OrbitalOrb />
      <ParticleField />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        enableRotate
        minDistance={3}
        maxDistance={8}
        autoRotate
        autoRotateSpeed={0.6}
      />
    </>
  );
}

export function FairHoldHero3D({ height = 480 }: { height?: number }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<any>(null);

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2 });
    lenisRef.current = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.stop();
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "relative", width: "100%", height }}
      className="absolute inset-0 overflow-hidden"
    >
      <Canvas
        camera={{ position: [0, 0, 7], fov: 55 }}
        style={{
          background: "transparent",
          position: "absolute",
          inset: 0,
        }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}

export default FairHoldHero3D;
