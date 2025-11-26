import { useMemo } from 'react';
// @ts-ignore - okx-os-api has types but package.json exports config issues
import { createOkxOsApi } from 'okx-os-api';
import { useSettingsStore } from '../store/settingsStore';

export function useOkxApi() {
    const { okxConfig } = useSettingsStore();

    const api = useMemo(() => {
        return createOkxOsApi({
            apiKey: okxConfig.apiKey,
            secretKey: okxConfig.secretKey,
            passphrase: okxConfig.passphrase,
            project: 'web3-toolkit',
        });
    }, [okxConfig]);

    return api;
}
