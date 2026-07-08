import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Road } from './Road';
import { Vehicle } from './Vehicle';
import { Pedestrian } from './Pedestrian';
import { Obstacle } from './Obstacle';
import { TrajectoryLine } from './TrajectoryLine';
import { TrafficLight } from './TrafficLight';
import { BuildingWireframe } from './BuildingWireframe';
import { OcclusionZone } from './OcclusionZone';
import { DataFlowParticles } from './DataFlowParticles';
import { ReplayFrame } from '@/types/event';

interface SceneData {
  vehicles: {
    id: string;
    position: { x: number; y: number; z: number };
    heading: number;
    isEgo?: boolean;
    predictedPath?: { x: number; y: number; z: number }[];
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  }[];
  pedestrians: {
    id: string;
    position: { x: number; y: number; z: number };
    heading: number;
    isOccluded: boolean;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  }[];
  obstacles: {
    id: string;
    position: { x: number; y: number; z: number };
    size: { width: number; height: number; depth: number };
    type: 'parked_car' | 'bus' | 'truck' | 'wall' | 'pillar';
  }[];
}

interface IntersectionSceneProps {
  sceneData?: SceneData;
  replayFrame?: ReplayFrame;
  height?: number | string;
  showLabel?: boolean;
  cameraMode?: 'orbit' | 'follow' | 'cinematic';
}

function SceneContent({
  sceneData,
  showLabel,
  cameraMode = 'orbit',
}: {
  sceneData: SceneData;
  showLabel: boolean;
  cameraMode?: 'orbit' | 'follow' | 'cinematic';
}) {
  return (
    <>
      {/* Enhanced lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[20, 30, 10]} intensity={0.5} castShadow />
      <pointLight position={[0, 12, 0]} intensity={0.8} color="#00d4ff" distance={30} />
      <pointLight position={[-15, 8, -15]} intensity={0.4} color="#00ff88" distance={25} />
      <pointLight position={[15, 8, 15]} intensity={0.3} color="#a855f7" distance={25} />

      {/* Fog */}
      <fogExp2 attach="fog" args={['#050816', 0.012]} />

      {/* Road */}
      <Road />

      {/* Traffic lights at 4 corners */}
      <TrafficLight state="red" position={[8, 0, 8]} />
      <TrafficLight state="green" position={[-8, 0, -8]} />
      <TrafficLight state="yellow" position={[8, 0, -8]} />
      <TrafficLight state="green" position={[-8, 0, 8]} />

      {/* Buildings at corners */}
      <BuildingWireframe position={[15, 0, 15]} size={[6, 22, 6]} seed={42} />
      <BuildingWireframe position={[-15, 0, -15]} size={[5, 16, 7]} seed={99} />
      <BuildingWireframe position={[15, 0, -15]} size={[7, 26, 5]} seed={77} />

      {/* Occlusion zone near pedestrian */}
      <OcclusionZone position={[5, 0, -3]} size={[4, 3, 3]} />

      {/* Data flow particles */}
      <DataFlowParticles count={150} />

      {/* Vehicles */}
      {sceneData.vehicles.map((v) => (
        <React.Fragment key={v.id}>
          <Vehicle
            position={v.position}
            heading={v.heading}
            isEgo={v.isEgo}
            riskLevel={v.riskLevel}
          />
          {v.predictedPath && v.predictedPath.length > 1 && (
            <TrajectoryLine points={v.predictedPath} color="#00ff88" />
          )}
        </React.Fragment>
      ))}

      {/* Pedestrians */}
      {sceneData.pedestrians.map((p) => (
        <Pedestrian
          key={p.id}
          position={p.position}
          heading={p.heading}
          isOccluded={p.isOccluded}
          riskLevel={p.riskLevel}
        />
      ))}

      {/* Obstacles */}
      {sceneData.obstacles.map((o) => (
        <Obstacle key={o.id} position={o.position} size={o.size} type={o.type} />
      ))}

      {/* Scene label */}
      {showLabel && (
        <Text
          position={[0, 8, 0]}
          fontSize={0.8}
          color="#00d4ff"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#050816"
        >
          V2X 路口场景
        </Text>
      )}
    </>
  );
}

const defaultSceneData: SceneData = {
  vehicles: [
    {
      id: 'ego',
      position: { x: -10, y: 0, z: 0 },
      heading: 90,
      isEgo: true,
      riskLevel: 'medium',
      predictedPath: [
        { x: -8, y: 0, z: 0 },
        { x: -5, y: 0, z: 0 },
        { x: -2, y: 0, z: 0.3 },
        { x: 1, y: 0, z: 0.6 },
      ],
    },
    {
      id: 'v2',
      position: { x: 0, y: 0, z: -12 },
      heading: 0,
      riskLevel: 'low',
    },
  ],
  pedestrians: [
    {
      id: 'p1',
      position: { x: 5, y: 0, z: -3 },
      heading: 0,
      isOccluded: true,
      riskLevel: 'critical',
    },
    {
      id: 'p2',
      position: { x: -3, y: 0, z: 7 },
      heading: 180,
      isOccluded: false,
      riskLevel: 'low',
    },
  ],
  obstacles: [
    {
      id: 'obs1',
      position: { x: 6, y: 0, z: -5 },
      size: { width: 4, height: 2, depth: 2 },
      type: 'parked_car',
    },
  ],
};

function replayFrameToSceneData(frame: ReplayFrame): SceneData {
  return {
    vehicles: frame.vehicles.map((v) => ({
      id: v.id,
      position: v.position,
      heading: v.heading,
      isEgo: true,
      predictedPath: v.predictedPath,
      riskLevel: frame.brakeActive ? 'critical' : 'medium',
    })),
    pedestrians: frame.pedestrians.map((p) => ({
      id: p.id,
      position: p.position,
      heading: p.heading,
      isOccluded: p.isOccluded,
      riskLevel: p.riskLevel,
    })),
    obstacles: frame.obstacles.map((o) => ({
      id: o.id,
      position: o.position,
      size: o.size,
      type: o.type,
    })),
  };
}

export const IntersectionScene: React.FC<IntersectionSceneProps> = ({
  sceneData,
  replayFrame,
  height = 500,
  showLabel = false,
  cameraMode = 'orbit',
}) => {
  let data: SceneData;
  if (replayFrame) {
    data = replayFrameToSceneData(replayFrame);
  } else {
    data = sceneData || defaultSceneData;
  }

  return (
    <div className="tech-border" style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }}>
      <Canvas shadows>
        <PerspectiveCamera
          makeDefault
          position={cameraMode === 'cinematic' ? [15, 8, 20] : [25, 20, 25]}
          fov={cameraMode === 'cinematic' ? 60 : 50}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={10}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate={cameraMode === 'cinematic'}
          autoRotateSpeed={0.5}
        />
        <Suspense fallback={null}>
          <SceneContent sceneData={data} showLabel={showLabel} cameraMode={cameraMode} />
        </Suspense>
        {/* Bloom postprocessing */}
        <EffectComposer>
          <Bloom luminanceThreshold={0.4} intensity={0.8} radius={0.4} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};
