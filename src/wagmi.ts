// src/wagmi.ts (或你的配置文件)
import { createConfig, http } from 'wagmi'
import { mainnet, sepolia, bsc, bscTestnet } from 'wagmi/chains'
import { bitgetWallet, metaMaskWallet, okxWallet, injectedWallet } from "@rainbow-me/rainbowkit/wallets";

import binanceWallet from '@binance/w3w-rainbow-connector-v2'
import { connectorsForWallets, type WalletList } from "@rainbow-me/rainbowkit";
const recommendedWalletList: WalletList = [
  {
    groupName: "Recommended",
    wallets: [
      okxWallet,
      binanceWallet,
      bitgetWallet,
      injectedWallet,
      metaMaskWallet
    ],
  }
]
const connectors = connectorsForWallets(
  recommendedWalletList,
  { projectId: 'c2a20bfa84a9d441f2b0bfef94244bd5', appName: "web3-toolkit" })
export const config = createConfig({
  chains: [mainnet, sepolia, bsc, bscTestnet],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
  },
})

// 👇 关键：添加这行类型扩展！
declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
