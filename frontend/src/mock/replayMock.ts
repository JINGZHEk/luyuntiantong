import { ReplayEvent, ReplayFrame, ReplayObstacle, ReplayPedestrian, ReplayVehicle } from '@/types/event';
import { RiskLevel } from '@/types/common';
import { randomBetween, randomId, randomInt, pickRandom } from '@/shared/utils/helpers';
import dayjs from 'dayjs';

function generateFrames(frameCount: number): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const vehicleStartX = -20;
  const pedStartZ = -15;

  for (let i = 0; i < frameCount; i++) {
    const t = i / frameCount;
    const vehicleX = vehicleStartX + t * 40;
    const pedZ = pedStartZ + t * 30;
    const distance = Math.sqrt((vehicleX - 5) ** 2 + (pedZ - 0) ** 2);
    const riskScore = Math.max(0, 1 - distance / 25);
    const ttc = Math.max(0.5, distance / 8);
    const brakeActive = t > 0.6 && riskScore > 0.6;

    const vehicle: ReplayVehicle = {
      id: 'VEH-001',
      position: { x: vehicleX, y: 0, z: 0 },
      heading: 90,
      speed: brakeActive ? 15 : 35,
      predictedPath: [
        { x: vehicleX + 3, y: 0, z: 0 },
        { x: vehicleX + 6, y: 0, z: 0.2 },
        { x: vehicleX + 9, y: 0, z: 0.5 },
      ],
    };

    const pedestrian: ReplayPedestrian = {
      id: 'PED-101',
      position: { x: 5, y: 0, z: pedZ },
      heading: 0,
      speed: 1.5,
      isOccluded: t < 0.4,
      riskLevel: (riskScore > 0.7 ? 'critical' : riskScore > 0.4 ? 'high' : 'medium') as RiskLevel,
    };

    const obstacle: ReplayObstacle = {
      id: 'OBS-001',
      position: { x: 6, y: 0, z: -5 },
      size: { width: 4, height: 2, depth: 2 },
      type: 'parked_car',
    };

    frames.push({
      frameIndex: i,
      timestamp: dayjs().subtract(frameCount - i, 'second').format('YYYY-MM-DD HH:mm:ss.SSS'),
      vehicles: [vehicle],
      pedestrians: [pedestrian],
      obstacles: [obstacle],
      riskScore: parseFloat(riskScore.toFixed(2)),
      ttc: parseFloat(ttc.toFixed(1)),
      brakeActive,
    });
  }
  return frames;
}

export function generateReplayEvents(): ReplayEvent[] {
  const types = ['ghost_probe', 'near_miss', 'collision_warning', 'brake_trigger'];
  const levels: RiskLevel[] = ['critical', 'high', 'high', 'medium'];
  return Array.from({ length: 12 }, (_, i) => ({
    eventId: `RPL-${randomId()}`,
    timestamp: dayjs().subtract(i * 15, 'minute').format('YYYY-MM-DD HH:mm:ss'),
    type: types[i % types.length],
    riskLevel: levels[i % levels.length],
    duration: randomInt(5, 30),
    location: pickRandom(['路口A-东侧', '路口B-南侧', '路口C-中央', '路口D-西侧']),
    description: pickRandom([
      '鬼探头场景：行人从停放车辆后突然出现，车辆紧急制动',
      '遮挡行人预警触发，V2X提前3.2秒发出预警',
      '路侧感知检测到遮挡区移动目标，云端下发避障指令',
      '多传感器融合检测到高风险行人，制动系统介入',
    ]),
    frameCount: randomInt(30, 80),
  }));
}

export function generateReplayFrames(event: ReplayEvent): ReplayFrame[] {
  return generateFrames(event.frameCount);
}
