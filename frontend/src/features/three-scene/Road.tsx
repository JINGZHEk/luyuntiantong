import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const LaneLine: React.FC<{ position: [number, number, number]; rotation?: [number, number, number]; size: [number, number] }> = ({
  position,
  rotation = [-Math.PI / 2, 0, 0],
  size,
}) => {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.opacity = 0.3 + Math.sin(clock.getElapsedTime() * 1.5 + position[0] * 0.1) * 0.2;
    }
  });
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={size} />
      <meshBasicMaterial ref={matRef} color="#ffff00" transparent opacity={0.5} />
    </mesh>
  );
};

export const Road: React.FC = () => {
  return (
    <group>
      {/* Main road - horizontal */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[60, 12]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#0a0e1a" emissiveIntensity={0.5} roughness={0.8} />
      </mesh>
      {/* Main road - vertical */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[12, 60]} />
        <meshStandardMaterial color="#1a1a2e" emissive="#0a0e1a" emissiveIntensity={0.5} roughness={0.8} />
      </mesh>

      {/* Center lines - horizontal (breathing) */}
      {[-20, -15, -10, 10, 15, 20].map((x) => (
        <LaneLine key={`h-${x}`} position={[x, 0.01, 0]} size={[3, 0.15]} />
      ))}
      {/* Center lines - vertical (breathing) */}
      {[-20, -15, -10, 10, 15, 20].map((z) => (
        <LaneLine key={`v-${z}`} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} size={[3, 0.15]} />
      ))}

      {/* Stop lines - 4 directions, white glowing */}
      {[
        { pos: [6, 0.02, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [0.4, 12] as [number, number] },
        { pos: [-6, 0.02, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [0.4, 12] as [number, number] },
        { pos: [0, 0.02, 6] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [12, 0.4] as [number, number] },
        { pos: [0, 0.02, -6] as [number, number, number], rot: [0, 0, 0] as [number, number, number], size: [12, 0.4] as [number, number] },
      ].map((sl, i) => (
        <mesh key={`stop-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={sl.pos}>
          <planeGeometry args={sl.size} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
        </mesh>
      ))}

      {/* Crosswalk */}
      {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((i) => (
        <mesh key={`cw-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[7, 0.02, i * 0.8]}>
          <planeGeometry args={[2, 0.5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Road edge lines - cyan glowing */}
      {/* Horizontal road edges */}
      {[6, -6].map((z) => (
        <mesh key={`edge-h-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, z]}>
          <planeGeometry args={[60, 0.1]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.4} />
        </mesh>
      ))}
      {/* Vertical road edges */}
      {[6, -6].map((x) => (
        <mesh key={`edge-v-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.015, 0]}>
          <planeGeometry args={[0.1, 60]} />
          <meshBasicMaterial color="#00d4ff" transparent opacity={0.4} />
        </mesh>
      ))}

      {/* Sidewalks */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 9]}>
        <planeGeometry args={[60, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -9]}>
        <planeGeometry args={[60, 6]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[9, 0.05, 0]}>
        <planeGeometry args={[6, 60]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-9, 0.05, 0]}>
        <planeGeometry args={[6, 60]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
      </mesh>

      {/* Ground grid - custom colors */}
      <gridHelper args={[60, 60, 'rgba(0, 212, 255, 0.1)', 'rgba(0, 212, 255, 0.03)']} position={[0, -0.02, 0]} />
    </group>
  );
};
