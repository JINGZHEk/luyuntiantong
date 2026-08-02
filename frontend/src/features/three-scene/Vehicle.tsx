import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { Position, RiskLevel } from '@/types/common';
import { RISK_COLORS } from '@/constants/colors';
import { SensorCone } from './SensorCone';

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
  const ringRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const wheelRefs = useRef<(THREE.Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();

    // Pulsing sensor ring (ego only)
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + Math.sin(t * 2) * 0.05;
    }

    // Pulsing risk halo
    if (haloRef.current && riskLevel === 'critical') {
      const scale = 0.8 + Math.sin(t * 4) * 0.2;
      haloRef.current.scale.set(scale, scale, scale);
    }

    // Wheel rotation
    wheelRefs.current.forEach((wheel) => {
      if (wheel) {
        wheel.rotation.x += 0.05;
      }
    });

    // Critical emissive pulse
    if (groupRef.current && riskLevel === 'critical') {
      groupRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (mat.emissive) {
            mat.emissiveIntensity = 0.3 + Math.sin(t * 5) * 0.3;
          }
        }
      });
    }
  });

  const displayColor = riskLevel ? RISK_COLORS[riskLevel] : color;
  const rotation = (heading * Math.PI) / 180;
  const hasRisk = riskLevel && riskLevel !== 'low';

  return (
    <group
      ref={groupRef}
      position={[position.x, position.y + 0.4, position.z]}
      rotation={[0, rotation, 0]}
    >
      {/* Body — RoundedBox */}
      <RoundedBox args={[2.2, 0.6, 1.2]} radius={0.08} smoothness={4} position={[0, 0.3, 0]}>
        <meshStandardMaterial
          color={displayColor}
          emissive={displayColor}
          emissiveIntensity={isEgo ? 0.25 : 0.08}
          metalness={0.6}
          roughness={0.3}
        />
      </RoundedBox>
      {/* Cabin */}
      <RoundedBox args={[1.2, 0.5, 1.0]} radius={0.06} smoothness={4} position={[0.1, 0.7, 0]}>
        <meshStandardMaterial color="#1a1a2e" opacity={0.7} transparent metalness={0.8} />
      </RoundedBox>

      {/* Headlights — front (white) */}
      <mesh position={[1.1, 0.35, 0.35]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[1.1, 0.35, -0.35]}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.8} />
      </mesh>
      {/* Taillights — back (red) */}
      <mesh position={[-1.1, 0.35, 0.35]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-1.1, 0.35, -0.35]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.6} />
      </mesh>
      {/* Ego vehicle — green accent lights */}
      {isEgo && (
        <mesh position={[0, 1.5, 0]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={0.8} />
        </mesh>
      )}

      {/* Wheels with rotation */}
      {[[-0.7, -0.65], [-0.7, 0.65], [0.7, -0.65], [0.7, 0.65]].map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => { wheelRefs.current[i] = el; }}
          position={[x, -0.05, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.2, 0.2, 0.1, 12]} />
          <meshStandardMaterial color="#333" metalness={0.5} />
        </mesh>
      ))}

      {/* Sensor cone (ego only) */}
      {isEgo && <SensorCone />}

      {/* Sensor ring (ego only, pulsing) */}
      {isEgo && (
        <mesh ref={ringRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[5.5, 6, 32]} />
          <meshBasicMaterial
            color="#00d4ff"
            transparent
            opacity={0.1}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Risk halo (when risk is not low) */}
      {hasRisk && (
        <mesh ref={haloRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.5, 1.8, 16]} />
          <meshBasicMaterial
            color={RISK_COLORS[riskLevel!]}
            transparent
            opacity={0.4}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
};
