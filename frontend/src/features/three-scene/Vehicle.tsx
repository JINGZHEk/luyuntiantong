import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position, RiskLevel } from '@/types/common';
import { RISK_COLORS } from '@/constants/colors';

interface VehicleProps {
  position: Position;
  heading: number;
  color?: string;
  riskLevel?: RiskLevel;
  isEgo?: boolean;
}

export const Vehicle: React.FC<VehicleProps> = ({
  position,
  heading,
  color = '#00aaff',
  riskLevel,
  isEgo = false,
}) => {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (groupRef.current && riskLevel === 'critical') {
      groupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.5 + Math.sin(Date.now() * 0.005) * 0.5;
        }
      });
    }
  });

  const displayColor = riskLevel ? RISK_COLORS[riskLevel] : color;
  const rotation = (heading * Math.PI) / 180;

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y + 0.4, position.z]}
      rotation={[0, rotation, 0]}
    >
      {/* Body */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[2.2, 0.6, 1.2]} />
        <meshStandardMaterial
          color={displayColor}
          emissive={displayColor}
          emissiveIntensity={isEgo ? 0.3 : 0.1}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {/* Cabin */}
      <mesh position={[0.1, 0.7, 0]}>
        <boxGeometry args={[1.2, 0.5, 1.0]} />
        <meshStandardMaterial color="#1a1a2e" opacity={0.7} transparent metalness={0.8} />
      </mesh>
      {/* Wheels */}
      {[[-0.7, -0.65], [-0.7, 0.65], [0.7, -0.65], [0.7, 0.65]].map(([x, z], i) => (
        <mesh key={i} position={[x, -0.05, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.1, 12]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
      {isEgo && (
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.8} />
        </mesh>
      )}
    </group>
  );
};
