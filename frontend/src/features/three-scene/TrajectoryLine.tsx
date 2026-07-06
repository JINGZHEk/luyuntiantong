import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { Position } from '@/types/common';

interface TrajectoryLineProps {
  points: Position[];
  color?: string;
  dashed?: boolean;
}

export const TrajectoryLine: React.FC<TrajectoryLineProps> = ({
  points,
  color = '#00ff88',
  dashed = true,
}) => {
  const linePoints = useMemo(
    () => points.map((p): [number, number, number] => [p.x, p.y + 0.3, p.z]),
    [points],
  );

  if (points.length < 2) return null;

  return (
    <group>
      <Line
        points={linePoints}
        color={color}
        lineWidth={2}
        dashed={dashed}
        dashSize={0.5}
        gapSize={0.3}
      />
      {/* End point marker */}
      {points.length > 0 && (
        <mesh position={[points[points.length - 1].x, 0.3, points[points.length - 1].z]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
        </mesh>
      )}
    </group>
  );
};
