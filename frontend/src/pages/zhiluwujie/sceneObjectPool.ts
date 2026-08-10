import * as THREE from 'three';
import {
  CloudObjectPayload,
  PooledObjectState,
} from '@/types/realtime';
import {
  DEFAULT_SCENE_COORDINATES,
  isFiniteRoadPoint,
  mapRoadHeading,
  mapRoadPoint,
  mapRoadVector,
  SceneCoordinateConfig,
} from './sceneCoordinates';

export interface SceneObjectPoolOptions {
  coordinateConfig?: SceneCoordinateConfig;
  ttlMs?: number;
  smoothingRate?: number;
  predictionWindowMs?: number;
  group?: THREE.Group;
  createModel?: (state: PooledObjectState) => THREE.Object3D;
}

function modelTypeForClass(objectClass: string): PooledObjectState['modelType'] {
  const normalized = objectClass.toLowerCase();
  if (normalized === 'person' || normalized === 'pedestrian') return 'person';
  if (normalized === 'bicycle' || normalized === 'bike' || normalized === 'scooter' || normalized === 'motorcycle') {
    return 'bicycle';
  }
  if (normalized === 'car' || normalized === 'truck' || normalized === 'bus' || normalized === 'vehicle') {
    return 'vehicle';
  }
  return 'generic';
}

function finitePair(value: number[] | undefined): [number, number] {
  return [
    Number.isFinite(Number(value?.[0])) ? Number(value?.[0]) : 0,
    Number.isFinite(Number(value?.[1])) ? Number(value?.[1]) : 0,
  ];
}

export class SceneObjectPool {
  private readonly coordinateConfig: SceneCoordinateConfig;
  private readonly ttlMs: number;
  private readonly smoothingRate: number;
  private readonly predictionWindowMs: number;
  private group?: THREE.Group;
  private readonly createModel: (state: PooledObjectState) => THREE.Object3D;
  private readonly states = new Map<string, PooledObjectState>();
  private readonly models = new Map<string, THREE.Object3D>();
  private readonly displayStates = new Map<string, {
    position: THREE.Vector3;
    heading: number;
  }>();

  constructor(options: SceneObjectPoolOptions = {}) {
    this.coordinateConfig = options.coordinateConfig || DEFAULT_SCENE_COORDINATES;
    this.ttlMs = options.ttlMs ?? 1000;
    this.smoothingRate = options.smoothingRate ?? 12;
    this.predictionWindowMs = options.predictionWindowMs ?? 250;
    this.group = options.group;
    this.createModel = options.createModel || this.createDefaultModel;
  }

  attachGroup(group: THREE.Group): void {
    this.group = group;
    this.models.forEach((model) => group.add(model));
  }

  upsert(nodeId: string, object: CloudObjectPayload, receivedAt: number): PooledObjectState | null {
    if (object.track_id === undefined || !isFiniteRoadPoint(object.world_pos)) return null;

    const normalizedNodeId = nodeId || 'unknown';
    const trackId = object.track_id;
    const key = `${normalizedNodeId}:${String(trackId)}`;
    const worldPoint: [number, number] = [Number(object.world_pos[0]), Number(object.world_pos[1])];
    const roadPoint = mapRoadPoint(worldPoint, this.coordinateConfig);
    const velocity = mapRoadVector(finitePair(object.velocity), this.coordinateConfig);
    const state: PooledObjectState = {
      key,
      trackId,
      nodeId: normalizedNodeId,
      class: object.class || 'unknown',
      modelType: modelTypeForClass(object.class || 'unknown'),
      position: roadPoint,
      heading: mapRoadHeading(Number(object.heading || 0), this.coordinateConfig.rotationDeg),
      velocity,
      confidence: object.confidence,
      lastSeenAt: receivedAt,
      occlusionLevel: Number.isFinite(Number(object.occlusion_level)) ? Number(object.occlusion_level) : 0,
      predictedTrajectory: (object.predicted_traj || [])
        .filter(isFiniteRoadPoint)
        .map((point) => mapRoadPoint([Number(point[0]), Number(point[1])], this.coordinateConfig)),
    };

    const previousState = this.states.get(key);
    this.states.set(key, state);
    let model = this.models.get(key);
    if (model && previousState && (previousState.class !== state.class || previousState.modelType !== state.modelType)) {
      this.group?.remove(model);
      this.disposeModel(model);
      this.models.delete(key);
      this.displayStates.delete(key);
      model = undefined;
    }
    if (!model) {
      model = this.createModel(state);
      this.models.set(key, model);
      this.group?.add(model);
      const displayState = {
        position: new THREE.Vector3(state.position.x, state.position.y, state.position.z),
        heading: state.heading,
      };
      this.displayStates.set(key, displayState);
      this.updateModelTransform(model, displayState);
    }
    this.updateModelMetadata(model, state);
    return this.cloneState(state);
  }

  advance(deltaSeconds: number): void {
    const dt = Number.isFinite(deltaSeconds)
      ? Math.min(1, Math.max(0, deltaSeconds))
      : 0;
    const blend = 1 - Math.exp(-this.smoothingRate * dt);
    const predictionSeconds = Math.min(this.predictionWindowMs / 1000, dt);

    for (const [key, state] of this.states) {
      const model = this.models.get(key);
      const displayState = this.displayStates.get(key);
      if (!model || !displayState) continue;

      const targetX = state.position.x + state.velocity[0] * predictionSeconds;
      const targetZ = state.position.z + state.velocity[1] * predictionSeconds;
      displayState.position.x += (targetX - displayState.position.x) * blend;
      displayState.position.z += (targetZ - displayState.position.z) * blend;
      displayState.position.y = state.position.y;

      const headingDelta = state.heading - displayState.heading;
      displayState.heading += Math.atan2(
        Math.sin(headingDelta),
        Math.cos(headingDelta),
      ) * blend;
      this.updateModelTransform(model, displayState);
    }
  }

  tick(now: number): void {
    for (const [key, state] of this.states) {
      if (now - state.lastSeenAt > this.ttlMs) {
        this.remove(key);
      }
    }
  }

  clear(): void {
    for (const key of this.states.keys()) this.remove(key);
    this.displayStates.clear();
  }

  snapshot(): PooledObjectState[] {
    return Array.from(this.states.values(), (state) => this.cloneState(state));
  }

  get size(): number {
    return this.states.size;
  }

  private remove(key: string): void {
    const model = this.models.get(key);
    if (model) {
      this.group?.remove(model);
      this.disposeModel(model);
      this.models.delete(key);
    }
    this.states.delete(key);
    this.displayStates.delete(key);
  }

  private updateModelMetadata(model: THREE.Object3D, state: PooledObjectState): void {
    model.userData.realtimeState = state;
    const opacity = state.occlusionLevel >= 3 ? 0.35 : state.occlusionLevel >= 1 ? 0.65 : 1;
    model.traverse((child) => {
      const material = (child as THREE.Mesh).material;
      if (material && !Array.isArray(material) && 'opacity' in material) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
      }
    });
  }

  private updateModelTransform(
    model: THREE.Object3D,
    displayState: { position: THREE.Vector3; heading: number },
  ): void {
    model.position.copy(displayState.position);
    model.rotation.y = displayState.heading;
  }

  private createDefaultModel(state: PooledObjectState): THREE.Object3D {
    const group = new THREE.Group();
    const dimensions = state.modelType === 'person'
      ? [0.55, 1.8, 0.55]
      : state.modelType === 'bicycle'
        ? [1.0, 1.2, 2.0]
        : state.modelType === 'vehicle'
          ? [2.0, 1.3, 4.5]
          : [1.5, 1.5, 1.5];
    const color = state.modelType === 'person'
      ? 0xffb6a3
      : state.modelType === 'bicycle'
        ? 0x00ffaa
        : state.modelType === 'vehicle'
          ? 0x3388ff
          : 0xb0b8c8;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(dimensions[0], dimensions[1], dimensions[2]),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.12 }),
    );
    body.position.y = dimensions[1] / 2;
    group.add(body);
    group.userData.trackId = state.trackId;
    group.userData.class = state.class;
    return group;
  }

  private disposeModel(model: THREE.Object3D): void {
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material?.dispose();
    });
  }

  private cloneState(state: PooledObjectState): PooledObjectState {
    return {
      ...state,
      position: { ...state.position },
      velocity: [...state.velocity],
      predictedTrajectory: state.predictedTrajectory.map((point) => ({ ...point })),
    };
  }
}
