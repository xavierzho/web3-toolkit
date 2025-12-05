import { create } from 'zustand';
import { type PrivateKeyAccount, type HDAccount } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';

export type WalletMode = 'EXTERNAL' | 'LOCAL';

export interface DerivedAccount {
  index: number;
  evmAddress: `0x${string}`;
  solAddress: string;
  evmPrivateKey?: string; // Optional, for export
  solPrivateKey?: string; // Optional, for export
}

interface WalletState {
  mode: WalletMode;
  evmAccount: PrivateKeyAccount | HDAccount | null;
  solAccount: Keypair | null;
  activeEvmAddress: `0x${string}` | null;
  activeSolAddress: string | null;
  chainId: number;
  rpcUrl: string;

  // Batch Derivation State
  mnemonic: string | null;
  derivedAccounts: DerivedAccount[];

  setMode: (mode: WalletMode) => void;
  setEvmAccount: (account: PrivateKeyAccount | HDAccount) => void;
  setSolAccount: (secretStr: string) => void;
  setSolKeypair: (keypair: Keypair) => void;
  setExternalEvmAddress: (address: `0x${string}` | undefined) => void;
  setChainId: (chainId: number) => void;
  setRpcUrl: (rpcUrl: string) => void;
  disconnectLocal: () => void;

  // Batch Actions
  importMnemonic: (mnemonic: string) => void;
  generateAccounts: (count: number) => void;
  deleteAccount: (index: number) => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  mode: 'LOCAL',
  evmAccount: null,
  solAccount: null,
  activeEvmAddress: null,
  activeSolAddress: null,
  chainId: 56, // Default to BSC
  rpcUrl: 'https://four.rpc.48.club',

  mnemonic: null,
  derivedAccounts: [],

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

  setChainId: (chainId) => set({ chainId }),
  setRpcUrl: (rpcUrl) => set({ rpcUrl }),

  disconnectLocal: () => set({
    mode: 'LOCAL',
    evmAccount: null,
    solAccount: null,
    activeEvmAddress: null,
    activeSolAddress: null,
    mnemonic: null,
    derivedAccounts: []
  }),

  importMnemonic: (mnemonic: string) => {
    const cleanMnemonic = mnemonic.trim();
    if (cleanMnemonic.split(' ').length !== 12) {
      throw new Error('Invalid mnemonic length');
    }

    // Generate first account (index 0)
    const evmAccount = mnemonicToAccount(cleanMnemonic, { accountIndex: 0 });

    const seed = mnemonicToSeedSync(cleanMnemonic);
    const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
    const solKeypair = Keypair.fromSeed(derivedSeed);

    set({
      mode: 'LOCAL',
      mnemonic: cleanMnemonic,
      evmAccount,
      activeEvmAddress: evmAccount.address,
      solAccount: solKeypair,
      activeSolAddress: solKeypair.publicKey.toBase58(),
      derivedAccounts: [{
        index: 0,
        evmAddress: evmAccount.address,
        solAddress: solKeypair.publicKey.toBase58(),
        evmPrivateKey: 'Hidden (Mnemonic Derived)',
        solPrivateKey: bs58.encode(solKeypair.secretKey)
      }]
    });
  },

  generateAccounts: (count: number) => {
    const { mnemonic, derivedAccounts } = get();
    if (!mnemonic) return;

    const startIndex = derivedAccounts.length;
    const newAccounts: DerivedAccount[] = [];
    const seed = mnemonicToSeedSync(mnemonic);

    for (let i = 0; i < count; i++) {
      const index = startIndex + i;

      // EVM
      const evmAccount = mnemonicToAccount(mnemonic, { addressIndex: index });

      // Solana (m/44'/501'/index'/0') - Standard derivation path often changes the third element (account)
      // Phantom uses: m/44'/501'/index'/0'
      const derivedSeed = derivePath(`m/44'/501'/${index}'/0'`, seed.toString('hex')).key;
      const solKeypair = Keypair.fromSeed(derivedSeed);

      newAccounts.push({
        index,
        evmAddress: evmAccount.address,
        solAddress: solKeypair.publicKey.toBase58(),
        evmPrivateKey: 'Hidden',
        solPrivateKey: bs58.encode(solKeypair.secretKey)
      });
    }

    set({ derivedAccounts: [...derivedAccounts, ...newAccounts] });
  },

  deleteAccount: (index: number) => {
    const { derivedAccounts } = get();
    set({ derivedAccounts: derivedAccounts.filter(acc => acc.index !== index) });
  }
}));
