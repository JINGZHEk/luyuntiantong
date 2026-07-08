import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface OcclusionZoneProps {
  position?: [number, number, number];
  size?: [number, number, number];
}

export const OcclusionZone: React.FC<OcclusionZoneProps> = ({
  position = [0, 0, 0],
  size = [6, 4, 3],
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const opacity = 0.03 + Math.sin(t * 1.5) * 0.02;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0.01, opacity);
    }
    if (edgesRef.current) {
      const mat = edgesRef.current.material as THREE.LineBasicMaterial;
      mat.opacity = 0.1 + Math.sin(t * 1.5) * 0.05;
    }
  });

  return (
    <group position={position}>
      {/* Semi-transparent red zone */}
      <mesh ref={meshRef} position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshBasicMaterial
          color="#ff4d4f"
          transparent
          opacity={0.04}
          depthWrite={false}
        />
      </mesh>
      {/* Wireframe edges */}
      <lineSegments ref={edgesRef} position={[0, size[1] / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color="#ff4d4f" transparent opacity={0.15} />
      </lineSegments>
    </group>
  );
};

export default OcclusionZone;
