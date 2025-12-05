import { useMemo } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import '@solana/wallet-adapter-react-ui/styles.css';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from './wagmi';
import AppLayout from './layouts/AppLayout';
import { RouterProvider } from './router';
import { ConfigProvider, App as AntdApp } from 'antd';

const queryClient = new QueryClient();

function App() {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);

  // 配置 Solana 钱包适配器，包括 Phantom 和多链钱包（通过标准钱包接口自动检测）
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      // OKX, Binance, Bitget 等多链钱包会通过 Wallet Standard 自动检测
      // 无需额外配置，只要用户安装了这些钱包的浏览器扩展即可
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
              <RainbowKitProvider>
                <ConfigProvider
                  theme={{
                    token: {
                      colorPrimary: '#3875dc',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      borderRadius: 12,
                    },
                  }}
                >
                  <AntdApp>
                    <RouterProvider>
                      <AppLayout />
                    </RouterProvider>
                  </AntdApp>
                </ConfigProvider>
              </RainbowKitProvider>
            </QueryClientProvider>
          </WagmiProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
