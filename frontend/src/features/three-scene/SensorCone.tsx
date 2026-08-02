import React from 'react';
import * as THREE from 'three';

interface SensorConeProps {
  range?: number;
  fov?: number;
  color?: string;
}

export const SensorCone: React.FC<SensorConeProps> = ({
  range = 18,
  fov = Math.PI / 5,
  color = '#00d4ff',
}) => {
  const radius = Math.tan(fov / 2) * range;

  return (
    <mesh position={[range / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <coneGeometry args={[radius, range, 20, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.06}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

export default SensorCone;
