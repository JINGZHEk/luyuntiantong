import React, { useMemo } from 'react';
import * as THREE from 'three';

interface BuildingWireframeProps {
  position?: [number, number, number];
  size?: [number, number, number];
  seed?: number;
}

// Seeded random for consistent windows
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export const BuildingWireframe: React.FC<BuildingWireframeProps> = ({
  position = [0, 0, 0],
  size = [6, 20, 6],
  seed = 42,
}) => {
  const [w, h, d] = size;

  const windows = useMemo(() => {
    const rand = seededRandom(seed);
    const lights: Array<{
      pos: [number, number, number];
      color: string;
      opacity: number;
    }> = [];
    const floors = Math.floor(h / 2);
    const cols = Math.floor(w / 1.5);

    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < cols; c++) {
        if (rand() > 0.5) {
          const color = rand() > 0.7 ? '#ffaa50' : '#00d4ff';
          const opacity = 0.2 + rand() * 0.4;
          // Front face
          lights.push({
            pos: [(c - cols / 2 + 0.5) * 1.5, f * 2 + 1, d / 2 + 0.01],
            color,
            opacity,
          });
          // Back face
          if (rand() > 0.6) {
            lights.push({
              pos: [(c - cols / 2 + 0.5) * 1.5, f * 2 + 1, -d / 2 - 0.01],
              color,
              opacity: opacity * 0.7,
            });
          }
        }
      }
    }
    return lights;
  }, [w, h, d, seed]);

  return (
    <group position={position}>
      {/* Building body - very dark */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color="#0a0e1a"
          emissive="#0a0e1a"
          emissiveIntensity={0.03}
          metalness={0.3}
          roughness={0.8}
        />
      </mesh>
      {/* Wireframe edges */}
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(w, h, d)]} />
        <lineBasicMaterial color="#00d4ff" transparent opacity={0.15} />
      </lineSegments>
      {/* Window lights */}
      {windows.map((light, i) => (
        <mesh key={i} position={light.pos}>
          <planeGeometry args={[0.6, 0.6]} />
          <meshBasicMaterial
            color={light.color}
            transparent
            opacity={light.opacity}
            side={2}
          />
        </mesh>
      ))}
    </group>
  );
};

export default BuildingWireframe;
