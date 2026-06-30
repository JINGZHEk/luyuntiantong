import dayjs from 'dayjs';
import { randomBetween, randomId, randomInt, pickRandom } from '@/shared/utils/helpers';
import { RoadsidePerception, DetectedObject } from '@/types/roadside';
import { VehicleState } from '@/types/vehicle';
import { CloudEvent } from '@/types/cloud';
import { RiskLevel } from '@/types/common';

export interface MonitorMessage {
  id: string;
  timestamp: string;
  topic: string;
  payload: string;
}

const topics = [
  'v2x/roadside/perception',
  'v2x/vehicle/state',
  'v2x/cloud/event',
  'v2x/cloud/fusion',
];

function fakeRoadsidePayload(): Partial<RoadsidePerception> {
  return {
    sensorId: `RSU-${randomInt(1, 5).toString().padStart(3, '0')}`,
    timestamp: dayjs().toISOString(),
    objects: Array.from({ length: randomInt(2, 5) }, (): DetectedObject => ({
      id: `OBJ-${randomId()}`,
      type: pickRandom(['vehicle', 'pedestrian', 'bicycle', 'truck']),
      position: { x: randomBetween(-20, 20), y: 0, z: randomBetween(-20, 20) },
      velocity: { vx: randomBetween(-5, 5), vy: randomBetween(-3, 3) },
      heading: randomBetween(0, 360),
      confidence: randomBetween(0.7, 1.0),
      isOccluded: Math.random() > 0.6,
      riskLevel: pickRandom(['low', 'medium', 'high', 'critical']),
      ttc: Math.random() > 0.5 ? randomBetween(1, 8) : null,
    })),
  };
}

function fakeVehiclePayload(): Partial<VehicleState> {
  return {
    vehicleId: `VEH-${randomInt(1, 10).toString().padStart(3, '0')}`,
    timestamp: dayjs().toISOString(),
    speed: randomBetween(10, 60),
    heading: randomBetween(0, 360),
    brakeStatus: {
      isActive: Math.random() > 0.7,
      intensity: randomBetween(0, 1),
      triggerSource: pickRandom(['driver', 'v2x', 'adas', 'none']),
      triggerTime: Math.random() > 0.5 ? dayjs().toISOString() : null,
    },
    decisionInfo: {
      riskScore: randomBetween(0, 1),
      riskLevel: pickRandom(['low', 'medium', 'high', 'critical']),
      ttc: randomBetween(1, 10),
      suggestedAction: pickRandom(['none', 'warn', 'brake', 'emergency_stop']),
      predictedTrajectory: [],
      targetId: null,
    },
  };
}

function fakeCloudPayload(): Partial<CloudEvent> {
  return {
    eventId: `EVT-${randomId()}`,
    timestamp: dayjs().toISOString(),
    type: pickRandom(['ghost_probe', 'near_miss', 'collision_warning', 'brake_trigger']),
    riskLevel: pickRandom(['low', 'medium', 'high', 'critical']),
    ttc: randomBetween(1, 8),
    riskScore: randomBetween(0, 1),
    description: pickRandom([
      '检测到遮挡行人横穿',
      '车辆紧急制动已触发',
      '高风险碰撞预警',
      '行人从遮挡物后方出现',
    ]),
  };
}

export function generateMonitorUpdate(): MonitorMessage {
  const topic = pickRandom(topics);
  let payload: unknown;
  if (topic.includes('roadside')) payload = fakeRoadsidePayload();
  else if (topic.includes('vehicle')) payload = fakeVehiclePayload();
  else payload = fakeCloudPayload();

  return {
    id: randomId(),
    timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
    topic,
    payload: JSON.stringify(payload, null, 2),
  };
}

export function generateInitialRoadsideData(): RoadsidePerception {
  return {
    sensorId: 'RSU-001',
    timestamp: dayjs().toISOString(),
    objects: Array.from({ length: 4 }, (_, i): DetectedObject => ({
      id: `OBJ-${i}`,
      type: i < 2 ? 'vehicle' : 'pedestrian',
      position: { x: randomBetween(-15, 15), y: 0, z: randomBetween(-15, 15) },
      velocity: { vx: randomBetween(-3, 3), vy: randomBetween(-2, 2) },
      heading: randomBetween(0, 360),
      confidence: randomBetween(0.8, 1.0),
      isOccluded: i === 3,
      riskLevel: i === 3 ? 'critical' : pickRandom(['low', 'medium']),
      ttc: i === 3 ? 2.1 : randomBetween(4, 10),
    })),
    occlusionZones: [{
      id: 'OZ-1',
      vertices: [
        { x: 5, y: 0, z: -3 },
        { x: 8, y: 0, z: -3 },
        { x: 8, y: 0, z: 3 },
        { x: 5, y: 0, z: 3 },
      ],
      severity: 'high',
      potentialPedestrians: 2,
    }],
    trafficState: { phase: 'green', countdown: 15, crosswalkActive: true },
  };
}

export function generateInitialVehicleData(): VehicleState {
  return {
    vehicleId: 'VEH-001',
    timestamp: dayjs().toISOString(),
    position: { x: -10, y: 0, z: 0 },
    velocity: { vx: 8, vy: 0 },
    heading: 90,
    speed: 35,
    acceleration: -0.5,
    brakeStatus: {
      isActive: false,
      intensity: 0,
      triggerSource: 'none',
      triggerTime: null,
    },
    decisionInfo: {
      riskScore: 0.45,
      riskLevel: 'medium',
      ttc: 4.2,
      suggestedAction: 'warn',
      predictedTrajectory: [
        { x: -8, y: 0, z: 0 },
        { x: -5, y: 0, z: 0 },
        { x: -2, y: 0, z: 0.5 },
        { x: 1, y: 0, z: 1 },
      ],
      targetId: 'OBJ-3',
    },
  };
}

export function generateInitialCloudEvents(): CloudEvent[] {
  const types: CloudEvent['type'][] = ['ghost_probe', 'near_miss', 'collision_warning', 'brake_trigger'];
  const levels: RiskLevel[] = ['critical', 'high', 'medium', 'low'];
  return types.map((type, i) => ({
    eventId: `EVT-${randomId()}`,
    timestamp: dayjs().subtract(i * 5, 'minute').toISOString(),
    type,
    riskLevel: levels[i],
    vehicleId: `VEH-${randomInt(1, 5).toString().padStart(3, '0')}`,
    pedestrianId: i < 2 ? `PED-${randomInt(100, 999)}` : null,
    location: pickRandom(['路口A-东侧', '路口B-南侧', '路口C-中央']),
    ttc: randomBetween(1, 6),
    riskScore: randomBetween(0.3, 1.0),
    resolved: i > 1,
    description: pickRandom([
      '行人从停放车辆后方突然出现',
      '遮挡区域检测到移动目标',
      '车辆紧急制动避免碰撞',
      '路侧预警信号已发送',
    ]),
  }));
}
