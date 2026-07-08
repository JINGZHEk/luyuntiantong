import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface DataFlowParticlesProps {
  count?: number;
}

export const DataFlowParticles: React.FC<DataFlowParticlesProps> = ({
  count = 150,
}) => {
  const pointsRef = useRef<THREE.Points>(null);

  const { positions, colors, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count);

    const cyan = new THREE.Color('#00d4ff');
    const green = new THREE.Color('#00ff88');

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      const useGreen = Math.random() > 0.7;
      const color = useGreen ? green : cyan;
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      velocities[i] = 0.02 + Math.random() * 0.05;
    }

    return { positions, colors, velocities };
  }, [count]);

  useFrame(() => {
    if (!pointsRef.current) return;
    const geom = pointsRef.current.geometry;
    const posArr = geom.attributes.position.array as Float32Array;

    for (let i = 0; i < count; i++) {
      posArr[i * 3 + 1] += velocities[i];
      if (posArr[i * 3 + 1] > 20) {
        posArr[i * 3 + 1] = 0;
        posArr[i * 3] = (Math.random() - 0.5) * 50;
        posArr[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={count}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.12}
        vertexColors
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
};

export default DataFlowParticles;
