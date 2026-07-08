import React from 'react';

interface TrafficLightProps {
  state?: 'red' | 'yellow' | 'green';
  position?: [number, number, number];
}

export const TrafficLight: React.FC<TrafficLightProps> = ({
  state = 'red',
  position = [0, 0, 0],
}) => {
  const states: Array<'red' | 'yellow' | 'green'> = ['red', 'yellow', 'green'];
  const colors: Record<string, string> = {
    red: '#ff4d4f',
    yellow: '#faad14',
    green: '#00ff88',
  };

  return (
    <group position={position}>
      {/* Pole */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 4, 8]} />
        <meshStandardMaterial color="#333" metalness={0.8} roughness={0.4} />
      </mesh>
      {/* Light box */}
      <mesh position={[0, 4.2, 0]}>
        <boxGeometry args={[0.5, 1.2, 0.3]} />
        <meshStandardMaterial color="#1a1a2e" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Three light spheres */}
      {states.map((s, i) => {
        const isActive = s === state;
        const color = colors[s];
        return (
          <mesh key={s} position={[0, 4.6 - i * 0.4, 0.16]}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={isActive ? 1.0 : 0.1}
            />
          </mesh>
        );
      })}
      {/* Point light for active state */}
      <pointLight
        position={[0, 4.2, 0.3]}
        intensity={state === 'red' ? 1.5 : 0.8}
        color={colors[state]}
        distance={8}
      />
    </group>
  );
};

export default TrafficLight;
