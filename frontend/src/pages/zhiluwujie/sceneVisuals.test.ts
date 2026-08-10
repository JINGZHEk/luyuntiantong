import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { shouldShowTrajectory, ZhiluWujieScene } from './scene';
import {
  createBuilding,
  createIntersectionLayout,
  createRealtimeActorModel,
  createTrafficSignal,
  createTree,
  DEFAULT_SCENE_STYLE,
} from './sceneVisuals';

function namedDescendants(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((object) => {
    if (object.name) names.push(object.name);
  });
  return names;
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) result.push(object);
  });
  return result;
}

describe('semi-realistic scene visual factory', () => {
  it('exports the approved dark night scene style', () => {
    expect(DEFAULT_SCENE_STYLE.background).toBe(0x030712);
    expect(DEFAULT_SCENE_STYLE.bloomStrength).toBeCloseTo(0.16);
    expect(DEFAULT_SCENE_STYLE.scanlineOpacity).toBeCloseTo(0.018);
    expect(DEFAULT_SCENE_STYLE.palette.road).toBe(0x080c16);
    expect(DEFAULT_SCENE_STYLE.palette.ground).toBe(0x0d1721);
    expect(DEFAULT_SCENE_STYLE.palette.windowGlow).toBe(0xb09a72);
  });

  it('uses the shared style for the scene bloom default', () => {
    const style = DEFAULT_SCENE_STYLE as { bloomStrength: number };
    const originalBloomStrength = style.bloomStrength;
    style.bloomStrength = 0.07;

    try {
      expect(new ZhiluWujieScene().bloomStrength).toBe(0.07);
    } finally {
      style.bloomStrength = originalBloomStrength;
    }
  });

  it('keeps trajectory overlays limited to traffic and algo modes', () => {
    expect(shouldShowTrajectory('ego')).toBe(false);
    expect(shouldShowTrajectory('traffic')).toBe(true);
    expect(shouldShowTrajectory('v2i')).toBe(false);
    expect(shouldShowTrajectory('algo')).toBe(true);
  });

  it('builds a layered intersection layout with four signals and crosswalks', () => {
    const layout = createIntersectionLayout();

    expect(layout).toBeInstanceOf(THREE.Group);
    expect(namedDescendants(layout)).toEqual(expect.arrayContaining([
      'road-surface',
      'sidewalk-north',
      'lane-markings',
      'crosswalk-north',
      'traffic-signals',
      'crosswalks',
      'streetscape',
    ]));
    expect(layout.getObjectByName('traffic-signals')?.children.length).toBe(4);
    expect(layout.getObjectByName('crosswalks')?.children.length).toBe(4);
    expect(layout.getObjectByName('streetscape')?.children.length).toBeGreaterThanOrEqual(4);

    const roadMeshes = meshes(layout.getObjectByName('road-surface') as THREE.Object3D);
    expect(roadMeshes).toHaveLength(2);
    expect(roadMeshes.every((mesh) => mesh.geometry instanceof THREE.PlaneGeometry)).toBe(true);
    expect(roadMeshes.every((mesh) => mesh.material instanceof THREE.MeshStandardMaterial)).toBe(true);
  });

  it('extends road and sidewalk bounds across the fallback travel envelope', () => {
    const layout = createIntersectionLayout();

    const northSouthRoad = layout.getObjectByName('road-surface-north-south') as THREE.Mesh<THREE.PlaneGeometry>;
    const eastWestRoad = layout.getObjectByName('road-surface-east-west') as THREE.Mesh<THREE.PlaneGeometry>;
    expect(northSouthRoad.geometry.parameters.height).toBeGreaterThanOrEqual(220);
    expect(eastWestRoad.geometry.parameters.width).toBeGreaterThanOrEqual(220);

    for (const name of ['sidewalk-north', 'sidewalk-south']) {
      expect((layout.getObjectByName(`${name}-surface`) as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters.width)
        .toBeGreaterThanOrEqual(220);
    }
    for (const name of ['sidewalk-east', 'sidewalk-west']) {
      expect((layout.getObjectByName(`${name}-surface`) as THREE.Mesh<THREE.BoxGeometry>).geometry.parameters.depth)
        .toBeGreaterThanOrEqual(220);
    }
  });

  it('builds a gray building with semantic window geometry', () => {
    const building = createBuilding(8, 12, 6);

    expect(building).toBeInstanceOf(THREE.Group);
    expect(namedDescendants(building)).toEqual(expect.arrayContaining(['building-body', 'building-windows']));
    expect(meshes(building).some((mesh) => mesh.geometry instanceof THREE.BoxGeometry)).toBe(true);
    expect(meshes(building).some((mesh) => mesh.name.startsWith('window-'))).toBe(true);
  });

  it('builds a low-poly tree from a trunk and canopy', () => {
    const tree = createTree();

    expect(tree).toBeInstanceOf(THREE.Group);
    expect(namedDescendants(tree)).toEqual(expect.arrayContaining(['tree-trunk', 'tree-canopy']));
    expect(meshes(tree).some((mesh) => mesh.geometry instanceof THREE.CylinderGeometry)).toBe(true);
    expect(meshes(tree).some((mesh) => mesh.geometry instanceof THREE.IcosahedronGeometry)).toBe(true);
  });

  it('builds a four-light traffic signal with a low-intensity active lamp', () => {
    const signal = createTrafficSignal('yellow');

    expect(signal).toBeInstanceOf(THREE.Group);
    expect(namedDescendants(signal)).toEqual(expect.arrayContaining([
      'signal-pole',
      'signal-housing',
      'signal-red',
      'signal-yellow',
      'signal-green',
    ]));
    expect(meshes(signal).some((mesh) => mesh.material instanceof THREE.MeshStandardMaterial)).toBe(true);
    for (const mesh of meshes(signal)) {
      const material = mesh.material as THREE.Material & { emissiveIntensity?: number };
      if (material.emissiveIntensity !== undefined) {
        expect(material.emissiveIntensity).toBeLessThanOrEqual(0.3);
      }
    }
  });

  it('builds readable person, bicycle, vehicle, and generic actor models', () => {
    const vehicle = createRealtimeActorModel({ class: 'car', modelType: 'vehicle' });
    const person = createRealtimeActorModel({ class: 'pedestrian', modelType: 'person' });
    const bicycle = createRealtimeActorModel({ class: 'cyclist', modelType: 'bicycle' });
    const generic = createRealtimeActorModel({ class: 'unknown-obstacle', modelType: 'generic' });

    expect(namedDescendants(vehicle)).toEqual(expect.arrayContaining([
      'vehicle-body',
      'vehicle-windows',
      'vehicle-wheel-front-left',
      'vehicle-wheel-front-right',
      'vehicle-wheel-rear-left',
      'vehicle-wheel-rear-right',
      'vehicle-headlight-front',
      'vehicle-taillight-rear',
    ]));
    expect(namedDescendants(person)).toEqual(expect.arrayContaining([
      'person-head',
      'person-torso',
      'person-arm-left',
      'person-arm-right',
      'person-leg-left',
      'person-leg-right',
    ]));
    expect(namedDescendants(bicycle)).toEqual(expect.arrayContaining([
      'bicycle-wheel-front',
      'bicycle-wheel-rear',
      'bicycle-frame',
      'bicycle-rider',
    ]));
    for (const wheelName of ['bicycle-wheel-front', 'bicycle-wheel-rear']) {
      const wheel = bicycle.getObjectByName(wheelName);
      expect(wheel).toBeInstanceOf(THREE.Mesh);
      const wheelSize = new THREE.Box3().setFromObject(wheel as THREE.Mesh).getSize(new THREE.Vector3());
      expect(wheelSize.y).toBeGreaterThan(wheelSize.z * 2);
    }
    expect(namedDescendants(generic)).toEqual(expect.arrayContaining(['generic-body', 'generic-label-anchor']));
  });

  it('gives truck and bus actors readable proportions while keeping generic actors renderable', () => {
    const car = createRealtimeActorModel({ class: 'car', modelType: 'vehicle' });
    const truck = createRealtimeActorModel({ class: 'truck', modelType: 'vehicle' });
    const bus = createRealtimeActorModel({ class: 'bus', modelType: 'vehicle' });

    const sizeOf = (model: THREE.Group) => {
      model.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    };
    const carSize = sizeOf(car);
    const truckSize = sizeOf(truck);
    const busSize = sizeOf(bus);

    expect(truckSize.y).toBeGreaterThan(carSize.y);
    expect(truckSize.z).toBeGreaterThan(carSize.z);
    expect(busSize.y).toBeGreaterThan(carSize.y);
    expect(busSize.z).toBeGreaterThan(carSize.z);
    for (const model of [truck, bus]) {
      expect(namedDescendants(model)).toEqual(expect.arrayContaining([
        'vehicle-body',
        'vehicle-windows',
        'vehicle-wheel-front-left',
        'vehicle-wheel-front-right',
        'vehicle-wheel-rear-left',
        'vehicle-wheel-rear-right',
        'vehicle-headlight-front',
        'vehicle-taillight-rear',
      ]));
    }
  });
});
