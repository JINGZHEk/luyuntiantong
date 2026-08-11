import { describe, expect, it } from 'vitest';
import {
  SCENARIO_CATALOG,
  buildZhiluWujieUrl,
  findScenario,
  resolveScenarioVisualContext,
} from './scenarioCatalog';

const EXPECTED_IDS = [
  'GP-01', 'GP-02', 'GP-03', 'GP-04', 'GP-05', 'GP-06', 'GP-07', 'GP-08',
  'NM-01', 'NM-02', 'NM-03', 'NM-04',
  'IC-01', 'IC-02', 'IC-03', 'IC-04',
];

describe('shared 16-scenario catalog', () => {
  it('keeps the complete backend scenario set in stable order', () => {
    expect(SCENARIO_CATALOG.map((scenario) => scenario.scenario_id)).toEqual(EXPECTED_IDS);
    expect(SCENARIO_CATALOG.every((scenario) => scenario.description.length > 10)).toBe(true);
    expect(SCENARIO_CATALOG.every((scenario) => scenario.visualCue.length > 5)).toBe(true);
  });

  it('exposes descriptions that identify the actual event', () => {
    expect(findScenario('GP-01').description).toContain('公交靠站');
    expect(findScenario('GP-06').description).toContain('红外');
    expect(findScenario('NM-02').description).toContain('外卖骑手');
    expect(findScenario('IC-04').description).toContain('辅路');
  });

  it('resolves visual context for the scene renderer', () => {
    expect(resolveScenarioVisualContext(findScenario('GP-06'))).toMatchObject({
      preset: 'night',
      occluder: 'parked_vehicle',
      sensorCue: 'infrared',
    });
    expect(resolveScenarioVisualContext(findScenario('IC-03'))).toMatchObject({
      signalMode: 'none',
      conflictCue: 'cross_traffic',
    });
    expect(resolveScenarioVisualContext(findScenario('IC-04'))).toMatchObject({
      conflictCue: 'ramp_merge',
    });
  });

  it('builds a linked 3D route without losing the loop setting', () => {
    expect(buildZhiluWujieUrl('NM-02', true)).toBe('/zhiluwujie?scenario=NM-02&loop=true');
    expect(buildZhiluWujieUrl('GP-01', false)).toBe('/zhiluwujie?scenario=GP-01&loop=false');
  });
});
