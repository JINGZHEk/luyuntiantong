import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeMode } from '@/types/common';
import { DEFAULT_REFRESH_INTERVAL, DEFAULT_RISK_THRESHOLD, DEFAULT_TTC_THRESHOLD } from '@/constants/config';
import { DEFAULT_CLOUD_API_BASE_URL, normalizeApiBaseUrl } from '@/services/runtimeConfig';

interface SettingsState {
  theme: ThemeMode;
  cloudApiBaseUrl: string;
  riskThreshold: number;
  ttcThreshold: number;
  refreshInterval: number;
  setTheme: (theme: ThemeMode) => void;
  setCloudApiBaseUrl: (value: string) => void;
  setRiskThreshold: (value: number) => void;
  setTtcThreshold: (value: number) => void;
  setRefreshInterval: (value: number) => void;
  exportConfig: () => object;
  importConfig: (config: Partial<SettingsConfig>) => void;
}

interface SettingsConfig {
  theme: ThemeMode;
  cloudApiBaseUrl: string;
  riskThreshold: number;
  ttcThreshold: number;
  refreshInterval: number;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      cloudApiBaseUrl: DEFAULT_CLOUD_API_BASE_URL,
      riskThreshold: DEFAULT_RISK_THRESHOLD,
      ttcThreshold: DEFAULT_TTC_THRESHOLD,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,

      setTheme: (theme) => set({ theme }),
      setCloudApiBaseUrl: (cloudApiBaseUrl) => set({ cloudApiBaseUrl }),
      setRiskThreshold: (riskThreshold) => set({ riskThreshold }),
      setTtcThreshold: (ttcThreshold) => set({ ttcThreshold }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),

      exportConfig: () => {
        const { theme, cloudApiBaseUrl, riskThreshold, ttcThreshold, refreshInterval } = get();
        return { theme, cloudApiBaseUrl: normalizeApiBaseUrl(cloudApiBaseUrl), riskThreshold, ttcThreshold, refreshInterval };
      },

      importConfig: (config) => {
        set({
          ...(config.theme && { theme: config.theme }),
          ...(config.cloudApiBaseUrl !== undefined && { cloudApiBaseUrl: normalizeApiBaseUrl(config.cloudApiBaseUrl) }),
          ...(config.riskThreshold !== undefined && { riskThreshold: config.riskThreshold }),
          ...(config.ttcThreshold !== undefined && { ttcThreshold: config.ttcThreshold }),
          ...(config.refreshInterval !== undefined && { refreshInterval: config.refreshInterval }),
        });
      },
    }),
    { name: 'v2x-settings' },
  ),
);
