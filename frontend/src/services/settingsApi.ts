import { buildApiUrl } from './runtimeConfig.js';

export interface SceneConfig {
  scene_id: string;
  riskThreshold: number;
  ttcThreshold: number;
  refreshInterval: number;
  cloudApiBaseUrl: string;
}

export type SceneConfigPatch = Omit<SceneConfig, 'scene_id'>;

async function requestSceneConfig(
  sceneId: string,
  init?: RequestInit,
  baseUrl?: string | null,
): Promise<SceneConfig> {
  const response = await fetch(buildApiUrl(`/config/${sceneId}`, baseUrl), init);
  if (!response.ok) {
    throw new Error(`Config API ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export function fetchSceneConfig(sceneId = 'scene_001', baseUrl?: string | null): Promise<SceneConfig> {
  return requestSceneConfig(sceneId, undefined, baseUrl);
}

export function saveSceneConfig(
  sceneId: string,
  patch: SceneConfigPatch,
  baseUrl?: string | null,
): Promise<SceneConfig> {
  return requestSceneConfig(
    sceneId,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
    baseUrl,
  );
}
