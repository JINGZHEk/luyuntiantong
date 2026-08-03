export const DEFAULT_REFRESH_INTERVAL = 2000;
export const LOG_MAX_ENTRIES = 200;
export const MESSAGE_MAX_ENTRIES = 50;
export const REPLAY_FPS = 10;

export const DEFAULT_RISK_THRESHOLD = 0.7;
export const DEFAULT_TTC_THRESHOLD = 3.0;

export const MQTT_TOPICS = {
  roadsidePerception: 'v2x/roadside/perception',
  vehicleState: 'v2x/vehicle/state',
  cloudEvent: 'v2x/cloud/event',
  cloudFusion: 'v2x/cloud/fusion',
  cloudAlert: 'v2x/cloud/alert',
} as const;

export const NAV_ITEMS = [
  { key: '/zhiluwujie', label: '路云天瞳大屏', icon: 'RocketOutlined' },
  { key: '/', label: '总览大屏', icon: 'DashboardOutlined' },
  { key: '/monitor', label: '实时监控', icon: 'MonitorOutlined' },
  { key: '/replay', label: '事件回放', icon: 'PlayCircleOutlined' },
  { key: '/evaluation', label: '模型评估', icon: 'ExperimentOutlined' },
  { key: '/settings', label: '系统设置', icon: 'SettingOutlined' },
] as const;

export const ROUTE_META = {
  '/zhiluwujie': {
    label: '路云天瞳大屏',
    description: 'V2X 数字孪生交通全景',
  },
  '/': {
    label: '总览大屏',
    description: '实时路口态势与风险信号',
  },
  '/monitor': {
    label: '实时监控',
    description: '路侧感知、车端决策与云端链路',
  },
  '/replay': {
    label: '事件回放',
    description: '还原事件帧与风险演化轨迹',
  },
  '/evaluation': {
    label: '模型评估',
    description: '指标达标、基线对比与消融结果',
  },
  '/settings': {
    label: '系统设置',
    description: '主题、阈值、接口与配置同步',
  },
} as const;

export const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];
