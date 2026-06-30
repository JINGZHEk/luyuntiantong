import React from 'react';

export const Road: React.FC = () => {
  return (
    <group>
      {/* Main road - horizontal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[60, 12]} />
        <meshStandardMaterial color="#2a2a3a" />
      </mesh>
      {/* Main road - vertical */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[12, 60]} />
        <meshStandardMaterial color="#2a2a3a" />
      </mesh>
      {/* Center lines - horizontal */}
      {[-20, -15, -10, 10, 15, 20].map((x) => (
        <mesh key={`h-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.01, 0]}>
          <planeGeometry args={[3, 0.15]} />
          <meshStandardMaterial color="#ffff00" opacity={0.6} transparent />
        </mesh>
      ))}
      {/* Center lines - vertical */}
      {[-20, -15, -10, 10, 15, 20].map((z) => (
        <mesh key={`v-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, z]}>
          <planeGeometry args={[0.15, 3]} />
          <meshStandardMaterial color="#ffff00" opacity={0.6} transparent />
        </mesh>
      ))}
      {/* Crosswalk */}
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => (
        <mesh key={`cw-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[7, 0.02, i * 0.8]}>
          <planeGeometry args={[2, 0.5]} />
          <meshStandardMaterial color="#ffffff" opacity={0.8} transparent />
        </mesh>
      ))}
      {/* Sidewalks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 9]}>
        <planeGeometry args={[60, 6]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -9]}>
        <planeGeometry args={[60, 6]} />
        <meshStandardMaterial color="#3a3a4a" />
      </mesh>
    </group>
  );
};
