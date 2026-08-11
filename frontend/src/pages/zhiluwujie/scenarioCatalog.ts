import type { ScenarioCategory, ScenarioSummary } from '@/types/realtime';

export type ScenarioVisualPreset = 'day' | 'dusk' | 'night';
export type ScenarioOccluder = 'bus' | 'truck' | 'parked_vehicle' | 'building' | 'none';
export type ScenarioSensorCue = 'none' | 'infrared';
export type ScenarioSignalMode = 'normal' | 'yellow_to_red' | 'none';
export type ScenarioConflictCue = 'none' | 'cross_traffic' | 'left_turn' | 'ramp_merge';
export type ScenarioBehaviorCue =
  | 'standard_crossing'
  | 'consecutive_pedestrians'
  | 'pedestrian_return'
  | 'fast_ebike'
  | 'wrong_way_delivery'
  | 'bicycle_lane_change'
  | 'child_cyclist'
  | 'signal_transition';

export interface ScenarioVisualContext {
  preset: ScenarioVisualPreset;
  occluder: ScenarioOccluder;
  sensorCue: ScenarioSensorCue;
  signalMode: ScenarioSignalMode;
  conflictCue: ScenarioConflictCue;
  behavior: ScenarioBehaviorCue;
}

export interface ScenarioVisualSpec extends ScenarioSummary {
  description: string;
  visualCue: string;
  visualContext: ScenarioVisualContext;
}

const scenario = (
  scenarioId: string,
  name: string,
  category: ScenarioCategory,
  durationMs: number,
  description: string,
  visualCue: string,
  environment: Record<string, unknown>,
  visualContext: ScenarioVisualContext,
  roadProfile: string,
): ScenarioVisualSpec => ({
  scenario_id: scenarioId,
  name,
  category,
  duration_ms: durationMs,
  default_fps: 10,
  environment,
  description,
  visualCue,
  visualContext,
  road_layout: { profile: roadProfile, lanes: 2 },
  expected_outcome: '协同感知提前预警并完成安全减速',
  source_refs: ['NHTSA pre-crash typology', 'ASAM OpenSCENARIO'],
});

export const SCENARIO_CATALOG: ScenarioVisualSpec[] = [
  scenario('GP-01', '公交车遮挡行人横穿', 'ghost_probe', 12000, '公交靠站时行人从车头前穿出，路侧感知提前发现目标。', '公交车头形成遮挡，行人从车头前横穿。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'bus', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'standard_crossing' }, 'bus'),
  scenario('GP-02', '大货车遮挡行人', 'ghost_probe', 12000, '排队等灯的大货车遮挡行人，目标从车缝走出。', '大货车静止排队，行人从车缝露出。', { time: 'day', weather: 'overcast', light: 'diffuse' }, { preset: 'day', occluder: 'truck', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'standard_crossing' }, 'truck'),
  scenario('GP-03', '路边违停车辆遮挡', 'ghost_probe', 11000, '右侧违停车辆挡住视线，行人从车缝突然进入车道。', '右侧违停车辆贴近路缘，行人从车缝突然出现。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'parked_vehicle', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'standard_crossing' }, 'car'),
  scenario('GP-04', '弯道建筑盲区行人', 'ghost_probe', 13000, '车辆转弯经过建筑墙角，行人从弯道盲区窜出。', '建筑墙角与转弯路径形成实体盲区。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'building', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'standard_crossing' }, 'building'),
  scenario('GP-05', '双车道二次遮挡', 'ghost_probe', 13000, '左侧大车造成第一次遮挡，右侧车道行人再次穿出。', '左侧大车遮挡后，行人在第二车道再次进入视野。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'truck', sensorCue: 'none', signalMode: 'normal', conflictCue: 'cross_traffic', behavior: 'standard_crossing' }, 'truck'),
  scenario('GP-06', '夜间红外鬼探头', 'ghost_probe', 12000, '低照度路口由路侧红外感知发现突然横穿行人。', '夜间低照度环境叠加红外感知环，突出突然横穿目标。', { time: 'night', weather: 'clear', light: 'low_light', sensor: 'infrared' }, { preset: 'night', occluder: 'parked_vehicle', sensorCue: 'infrared', signalMode: 'normal', conflictCue: 'none', behavior: 'standard_crossing' }, 'car'),
  scenario('GP-07', '多行人连续穿越', 'ghost_probe', 15000, '第一名行人通过后第二名紧跟进入，第二目标短暂被遮挡。', '两名行人保持时间间隔连续横穿，后者短暂被遮挡。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'parked_vehicle', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'consecutive_pedestrians' }, 'car'),
  scenario('GP-08', '行人犹豫折返', 'ghost_probe', 15000, '行人走到路中间后犹豫折返，轨迹方向在事件窗口内反转。', '行人轨迹在冲突区内反向，显示犹豫与折返。', { time: 'day', weather: 'light_rain', light: 'diffuse' }, { preset: 'day', occluder: 'parked_vehicle', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'pedestrian_return' }, 'car'),
  scenario('NM-01', '电动车从遮挡处高速穿出', 'non_motor', 10000, '电动车从厢式车遮挡处高速穿出，制动距离短。', '电动车以更快横向速度从厢式车后穿出。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'parked_vehicle', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'fast_ebike' }, 'van'),
  scenario('NM-02', '外卖骑手逆行横穿', 'non_motor', 11000, '外卖骑手沿相反方向横穿机动车道，TTC 快速下降。', '外卖骑手沿逆向箭头横穿机动车道，TTC 快速下降。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'parked_vehicle', sensorCue: 'none', signalMode: 'normal', conflictCue: 'cross_traffic', behavior: 'wrong_way_delivery' }, 'car'),
  scenario('NM-03', '自行车队列突然变道', 'non_motor', 14000, '自行车队列中第二辆突然向机动车道变道。', '三辆自行车成队，第二辆用变道轨迹切入机动车道。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'bicycle_lane_change' }, 'bicycle'),
  scenario('NM-04', '儿童骑车轨迹不稳定', 'non_motor', 14000, '儿童骑行速度与方向不稳定，预测轨迹需要持续修正。', '儿童骑车模型缩小，速度与预测轨迹持续摆动。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'normal', conflictCue: 'none', behavior: 'child_cyclist' }, 'car'),
  scenario('IC-01', '黄灯变红抢行', 'intersection_conflict', 13000, '信号灯由黄变红时侧向车辆提前起步进入冲突区。', '信号灯从黄转红，侧向车辆提前起步进入冲突区。', { time: 'day', weather: 'clear', light: 'daylight', signal: 'yellow_to_red' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'yellow_to_red', conflictCue: 'cross_traffic', behavior: 'signal_transition' }, 'signal'),
  scenario('IC-02', '左转车与直行车冲突', 'intersection_conflict', 14000, '左转车辆与对向直行车辆交汇，双方航向连续变化。', '左转弧线与对向直行轨迹在交汇点重叠。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'normal', conflictCue: 'left_turn', behavior: 'standard_crossing' }, 'car'),
  scenario('IC-03', '无信号灯横向来车', 'intersection_conflict', 12000, '无信号灯路口横向车辆未减速直接进入主路。', '隐藏信号灯杆，横向车辆不减速穿过无信号交叉口。', { time: 'day', weather: 'clear', light: 'daylight', signal: 'none' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'none', conflictCue: 'cross_traffic', behavior: 'standard_crossing' }, 'none'),
  scenario('IC-04', '匝道汇入主路冲突', 'intersection_conflict', 15000, '辅路车辆汇入主路时主路车辆速度较高，形成汇入冲突。', '辅路汇入线与主路高速车流在合流点交叉。', { time: 'day', weather: 'clear', light: 'daylight' }, { preset: 'day', occluder: 'none', sensorCue: 'none', signalMode: 'normal', conflictCue: 'ramp_merge', behavior: 'standard_crossing' }, 'ramp'),
];

const CATALOG_BY_ID = new Map(SCENARIO_CATALOG.map((item) => [item.scenario_id, item]));

export function findScenario(scenarioId?: string | null): ScenarioVisualSpec {
  return CATALOG_BY_ID.get(scenarioId || '') || SCENARIO_CATALOG[0];
}

export function resolveScenarioVisualContext(scenarioSpec: ScenarioVisualSpec): ScenarioVisualContext {
  return scenarioSpec.visualContext;
}

export function mergeScenarioCatalog(remoteItems: ScenarioSummary[]): ScenarioSummary[] {
  const remoteById = new Map(remoteItems.map((item) => [item.scenario_id, item]));
  const canonical = SCENARIO_CATALOG.map((item) => ({
    ...item,
    ...(remoteById.get(item.scenario_id) || {}),
  }));
  const canonicalIds = new Set(SCENARIO_CATALOG.map((item) => item.scenario_id));
  return [...canonical, ...remoteItems.filter((item) => !canonicalIds.has(item.scenario_id))];
}

export function buildZhiluWujieUrl(scenarioId: string, loop: boolean): string {
  const params = new URLSearchParams({ scenario: scenarioId, loop: String(loop) });
  return `/zhiluwujie?${params.toString()}`;
}
