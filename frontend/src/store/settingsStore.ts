import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ThemeMode } from '@/types/common';
import { DEFAULT_REFRESH_INTERVAL, DEFAULT_RISK_THRESHOLD, DEFAULT_TTC_THRESHOLD } from '@/constants/config';

interface SettingsState {
  theme: ThemeMode;
  riskThreshold: number;
  ttcThreshold: number;
  refreshInterval: number;
  setTheme: (theme: ThemeMode) => void;
  setRiskThreshold: (value: number) => void;
  setTtcThreshold: (value: number) => void;
  setRefreshInterval: (value: number) => void;
  exportConfig: () => object;
  importConfig: (config: Partial<SettingsConfig>) => void;
}

interface SettingsConfig {
  theme: ThemeMode;
  riskThreshold: number;
  ttcThreshold: number;
  refreshInterval: number;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      riskThreshold: DEFAULT_RISK_THRESHOLD,
      ttcThreshold: DEFAULT_TTC_THRESHOLD,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,

      setTheme: (theme) => set({ theme }),
      setRiskThreshold: (riskThreshold) => set({ riskThreshold }),
      setTtcThreshold: (ttcThreshold) => set({ ttcThreshold }),
      setRefreshInterval: (refreshInterval) => set({ refreshInterval }),

      exportConfig: () => {
        const { theme, riskThreshold, ttcThreshold, refreshInterval } = get();
        return { theme, riskThreshold, ttcThreshold, refreshInterval };
      },

      importConfig: (config) => {
        set({
          ...(config.theme && { theme: config.theme }),
          ...(config.riskThreshold !== undefined && { riskThreshold: config.riskThreshold }),
          ...(config.ttcThreshold !== undefined && { ttcThreshold: config.ttcThreshold }),
          ...(config.refreshInterval !== undefined && { refreshInterval: config.refreshInterval }),
        });
      },
    }),
    { name: 'v2x-settings' },
  ),
);
