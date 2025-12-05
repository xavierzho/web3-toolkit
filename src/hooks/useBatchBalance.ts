import { useState, useCallback } from 'react';
import { createPublicClient, http, formatUnits, erc20Abi, isAddress } from 'viem';
import { mainnet, bsc, sepolia, bscTestnet, polygon, arbitrum, optimism, avalanche, base } from 'viem/chains';
import { useWalletStore } from '../store/walletStore';

// Supported chains map (centralized here or imported from a constants file)
const SUPPORTED_CHAINS: Record<number, any> = {
    [mainnet.id]: mainnet,
    [sepolia.id]: sepolia,
    [bsc.id]: bsc,
    [bscTestnet.id]: bscTestnet,
    [polygon.id]: polygon,
    [arbitrum.id]: arbitrum,
    [optimism.id]: optimism,
    [avalanche.id]: avalanche,
    [base.id]: base,
};

export interface BalanceResult {
    address: string;
    isNative: boolean;
    token: string;  // Formatted balance (native or token)
    amount: string; // Alias for token (formatted)
    rawAmount: bigint; // Raw balance (native or token)
}

export function useBatchBalance() {
    const { chainId, rpcUrl } = useWalletStore();
    const [loading, setLoading] = useState(false);
    const [balances, setBalances] = useState<Record<string, BalanceResult>>({});

    // Fetch Native Balances (using batch: true for JSON-RPC batching)
    const fetchNative = useCallback(async (addresses: string[]) => {
        if (!addresses.length) return {};
        setLoading(true);
        try {
            const currentChain = SUPPORTED_CHAINS[chainId] || mainnet;
            const client = createPublicClient({
                transport: http(rpcUrl, { batch: true }), // Enable auto-batching
                chain: currentChain,
            });

            const results = await Promise.all(addresses.map(addr => client.getBalance({ address: addr as `0x${string}` })));

            const balanceMap: Record<string, BalanceResult> = {};
            results.forEach((res, i) => {
                const addr = addresses[i];
                balanceMap[addr] = {
                    address: addr,
                    isNative: true,
                    token: formatUnits(res, 18),
                    amount: formatUnits(res, 18),
                    rawAmount: res,
                };
            });

            setBalances(prev => ({ ...prev, ...balanceMap }));
            return balanceMap;
        } catch (e) {
            console.error('Fetch native failed', e);
            return {};
        } finally {
            setLoading(false);
        }
    }, [chainId, rpcUrl]);

    // Fetch Token Balances (using multicall)
    const fetchToken = useCallback(async (addresses: string[], tokenAddress: string, decimals: number = 18) => {
        if (!addresses.length || !tokenAddress || !isAddress(tokenAddress)) return {};
        setLoading(true);
        try {
            const currentChain = SUPPORTED_CHAINS[chainId] || mainnet;
            const client = createPublicClient({
                transport: http(rpcUrl),
                chain: currentChain,
                batch: { multicall: true } // Enable multicall
            });

            const contracts = addresses.map(addr => ({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [addr as `0x${string}`]
            }));

            // @ts-ignore
            const results = await client.multicall({ contracts });

            const balanceMap: Record<string, BalanceResult> = {};
            results.forEach((res: any, i: number) => {
                const addr = addresses[i];
                const raw = res.status === 'success' ? (res.result as bigint) : 0n;
                balanceMap[addr] = {
                    address: addr,
                    isNative: false,
                    token: formatUnits(raw, decimals),
                    amount: formatUnits(raw, decimals),
                    rawAmount: raw,
                };
            });

            setBalances(prev => ({ ...prev, ...balanceMap }));
            return balanceMap;
        } catch (e) {
            console.error('Fetch token failed', e);
            return {};
        } finally {
            setLoading(false);
        }
    }, [chainId, rpcUrl]);

    // Unified fetcher for backward compatibility or convenience
    const fetchBalances = useCallback(async (
        addresses: string[],
        tokenAddress?: string,
        tokenDecimals: number = 18
    ) => {
        if (tokenAddress && isAddress(tokenAddress)) {
            return fetchToken(addresses, tokenAddress, tokenDecimals);
        } else {
            return fetchNative(addresses);
        }
    }, [fetchNative, fetchToken]);

    return {
        fetchBalances,
        fetchNative,
        fetchToken,
        balances,
        loading
    };
}
