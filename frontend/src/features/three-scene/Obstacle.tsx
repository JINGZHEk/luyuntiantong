import React from 'react';
import { Position } from '@/types/common';

interface ObstacleProps {
  position: Position;
  size: { width: number; height: number; depth: number };
  type: 'parked_car' | 'bus' | 'truck' | 'wall' | 'pillar';
}

const TYPE_COLORS: Record<ObstacleProps['type'], string> = {
  parked_car: '#4a4a5a',
  bus: '#5a4a3a',
  truck: '#4a5a4a',
  wall: '#6a6a6a',
  pillar: '#5a5a5a',
};

export const Obstacle: React.FC<ObstacleProps> = ({ position, size, type }) => {
  const color = TYPE_COLORS[type];
  return (
    <group position={[position.x, position.y + size.height / 2, position.z]}>
      <mesh>
        <boxGeometry args={[size.width, size.height, size.depth]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.7} />
      </mesh>
      {/* Occlusion zone indicator */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -size.height / 2 + 0.05, size.depth]}>
        <planeGeometry args={[size.width + 2, size.depth + 4]} />
        <meshStandardMaterial
          color="#ff4444"
          transparent
          opacity={0.12}
          emissive="#ff4444"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
};
