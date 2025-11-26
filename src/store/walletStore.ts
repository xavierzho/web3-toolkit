import { create } from 'zustand';
import { type PrivateKeyAccount, type HDAccount } from 'viem';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export type WalletMode = 'EXTERNAL' | 'LOCAL';

interface WalletState {
  mode: WalletMode;
  evmAccount: PrivateKeyAccount | HDAccount | null;
  solAccount: Keypair | null;
  activeEvmAddress: `0x${string}` | null;
  activeSolAddress: string | null;

  setMode: (mode: WalletMode) => void;
  setEvmAccount: (account: PrivateKeyAccount | HDAccount) => void;
  setSolAccount: (secretStr: string) => void;
  setSolKeypair: (keypair: Keypair) => void;
  setExternalEvmAddress: (address: `0x${string}` | undefined) => void;
  disconnectLocal: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  mode: 'EXTERNAL',
  evmAccount: null,
  solAccount: null,
  activeEvmAddress: null,
  activeSolAddress: null,

  setMode: (mode) => set({ mode }),

  setExternalEvmAddress: (address) => set((state) => {
    if (state.mode === 'EXTERNAL') {
      return { activeEvmAddress: address || null };
    }
    return {};
  }),

  setEvmAccount: (account) => set({
    mode: 'LOCAL',
    evmAccount: account,
    activeEvmAddress: account.address
  }),

  setSolAccount: (secretStr) => {
    try {
      let secretKey: Uint8Array;
      if (secretStr.trim().startsWith('[') && secretStr.trim().endsWith(']')) {
        secretKey = Uint8Array.from(JSON.parse(secretStr));
      } else {
        secretKey = bs58.decode(secretStr.trim());
      }
      const pair = Keypair.fromSecretKey(secretKey);
      set({
        mode: 'LOCAL',
        solAccount: pair,
        activeSolAddress: pair.publicKey.toBase58()
      });
    } catch (e) {
      console.error(e);
      throw new Error("无效的 Solana 私钥");
    }
  },

  setSolKeypair: (keypair) => set({
    mode: 'LOCAL',
    solAccount: keypair,
    activeSolAddress: keypair.publicKey.toBase58()
  }),

  disconnectLocal: () => set({
    mode: 'EXTERNAL',
    evmAccount: null,
    solAccount: null,
    activeEvmAddress: null,
    activeSolAddress: null
  }),
}));
