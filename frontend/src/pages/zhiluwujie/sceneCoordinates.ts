export interface SceneCoordinateConfig {
  originX: number;
  originZ: number;
  scale: number;
  rotationDeg: number;
}

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

export const DEFAULT_SCENE_COORDINATES: SceneCoordinateConfig = {
  originX: 0,
  originZ: 0,
  scale: 1,
  rotationDeg: 0,
};

export function mapRoadPoint(
  [worldX, worldY]: [number, number],
  config: SceneCoordinateConfig = DEFAULT_SCENE_COORDINATES,
): ScenePoint {
  const x = config.originX + worldY * config.scale;
  const z = config.originZ + worldX * config.scale;
  const angle = (config.rotationDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) - z * Math.sin(angle),
    y: 0,
    z: x * Math.sin(angle) + z * Math.cos(angle),
  };
}

export function mapRoadVector(
  [worldX, worldY]: [number, number],
  config: SceneCoordinateConfig = DEFAULT_SCENE_COORDINATES,
): [number, number] {
  const x = worldY * config.scale;
  const z = worldX * config.scale;
  const angle = (config.rotationDeg * Math.PI) / 180;
  return [
    x * Math.cos(angle) - z * Math.sin(angle),
    x * Math.sin(angle) + z * Math.cos(angle),
  ];
}

export function mapRoadHeading(headingDeg: number, rotationDeg: number): number {
  return ((headingDeg + rotationDeg) * Math.PI) / 180;
}

export function isFiniteRoadPoint(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}
