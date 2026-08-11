import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PooledObjectState } from '@/types/realtime';
import { SceneObjectPool } from './sceneObjectPool';
import { trafficHeadingForLane } from './scene';

function objectPayload(objectClass: string) {
  return {
    track_id: 'track-1',
    class: objectClass,
    world_pos: [0, 0] as [number, number],
  };
}

describe('scene object pool model lifecycle', () => {
  it('points horizontal traffic actors along their movement direction', () => {
    expect(trafficHeadingForLane(-6)).toBe(-Math.PI / 2);
    expect(trafficHeadingForLane(6)).toBe(Math.PI / 2);
  });

  it('rebuilds a changed actor model and keeps one group child', () => {
    const group = new THREE.Group();
    const models: THREE.Group[] = [];
    const createModel = vi.fn((state: PooledObjectState) => {
      const model = new THREE.Group();
      model.name = state.modelType;
      model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
      models.push(model);
      return model;
    });
    const pool = new SceneObjectPool({ group, createModel });

    pool.upsert('node-1', objectPayload('car'), 1000);
    pool.upsert('node-1', objectPayload('car'), 1100);
    expect(createModel).toHaveBeenCalledTimes(1);

    const oldModel = models[0];
    const oldMesh = oldModel.children[0] as THREE.Mesh;
    const geometryDispose = vi.spyOn(oldMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(oldMesh.material as THREE.Material, 'dispose');

    pool.upsert('node-1', objectPayload('person'), 1200);

    expect(createModel).toHaveBeenCalledTimes(2);
    expect(createModel.mock.calls[1][0].modelType).toBe('person');
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBe(models[1]);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps detector subtypes for scenario-specific actor styling', () => {
    const group = new THREE.Group();
    const createModel = vi.fn((state: PooledObjectState) => {
      const model = new THREE.Group();
      model.name = state.subtype || 'actor';
      return model;
    });
    const pool = new SceneObjectPool({ group, createModel });

    pool.upsert('node-1', { ...objectPayload('bicycle'), subtype: 'child' }, 1000);

    expect(pool.snapshot()[0]?.subtype).toBe('child');
    expect(createModel.mock.calls[0]?.[0].subtype).toBe('child');
  });

  it('smoothly interpolates a reused model between updates', () => {
    const group = new THREE.Group();
    const pool = new SceneObjectPool({ group, predictionWindowMs: 0 });

    pool.upsert('node-1', { ...objectPayload('car'), world_pos: [0, 0] }, 1000);
    const model = group.children[0];
    pool.upsert('node-1', { ...objectPayload('car'), world_pos: [0, 10] }, 1100);

    pool.advance(0.05);
    expect(model.position.x).toBeGreaterThan(0);
    expect(model.position.x).toBeLessThan(10);

    pool.advance(1);
    expect(model.position.x).toBeCloseTo(10, 1);
  });

  it('bounds velocity prediction and cleans up models', () => {
    const group = new THREE.Group();
    const pool = new SceneObjectPool({ group, predictionWindowMs: 50 });

    pool.upsert(
      'node-1',
      { ...objectPayload('car'), world_pos: [0, 0], velocity: [100, 0] },
      1000,
    );
    const model = group.children[0];

    pool.advance(2);
    expect(model.position.z).toBeLessThanOrEqual(5);

    pool.clear();
    expect(pool.size).toBe(0);
    expect(group.children).toHaveLength(0);
  });

  it('removes expired objects with tick and clears remaining objects', () => {
    const group = new THREE.Group();
    const pool = new SceneObjectPool({ group, ttlMs: 1000 });

    pool.upsert('node-1', objectPayload('car'), 1000);
    pool.tick(1950);
    expect(pool.size).toBe(1);
    expect(group.children).toHaveLength(1);

    pool.tick(2101);
    expect(pool.size).toBe(0);
    expect(group.children).toHaveLength(0);

    pool.upsert('node-1', objectPayload('bus'), 2200);
    pool.clear();
    expect(pool.size).toBe(0);
    expect(group.children).toHaveLength(0);
  });
});
