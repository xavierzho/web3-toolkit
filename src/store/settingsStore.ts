import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { okxEnvConfig } from '../config/okx';

interface OkxConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

interface SettingsState {
  okxConfig: OkxConfig;
  setOkxConfig: (config: OkxConfig) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      okxConfig: okxEnvConfig,
      setOkxConfig: (config) => set({ okxConfig: config }),
    }),
    { name: 'web3-toolkit-settings' }
  )
);
