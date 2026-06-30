import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position, RiskLevel } from '@/types/common';
import { RISK_COLORS } from '@/constants/colors';

interface PedestrianProps {
  position: Position;
  heading: number;
  isOccluded: boolean;
  riskLevel: RiskLevel;
}

export const Pedestrian: React.FC<PedestrianProps> = ({
  position,
  heading,
  isOccluded,
  riskLevel,
}) => {
  const meshRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (meshRef.current && riskLevel === 'critical') {
      meshRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.4 + Math.sin(Date.now() * 0.008) * 0.6;
        }
      });
    }
  });

  const color = RISK_COLORS[riskLevel];
  const rotation = (heading * Math.PI) / 180;

  return (
    <group
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      rotation={[0, rotation, 0]}
    >
      {/* Body */}
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.2, 0.6, 4, 8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.3}
          transparent
          opacity={isOccluded ? 0.4 : 1}
        />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.18, 8, 8]} />
        <meshStandardMaterial
          color="#ffcc88"
          emissive={color}
          emissiveIntensity={0.1}
          transparent
          opacity={isOccluded ? 0.4 : 1}
        />
      </mesh>
      {/* Risk ring on ground */}
      {riskLevel !== 'low' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <ringGeometry args={[0.6, 0.8, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  );
};
