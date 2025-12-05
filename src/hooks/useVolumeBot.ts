import { useState, useEffect, useRef } from 'react';
import { useWalletStore } from '../store/walletStore';
import { createPublicClient, createWalletClient, http, erc20Abi, formatUnits, parseUnits, isAddress, maxUint256 } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { mainnet, bsc, sepolia } from 'viem/chains';
import { ROUTERS, V2_ROUTER_ABI, V3_ROUTER_ABI, BASE_TOKENS } from '../constants/volumeBot';
import { useBatchBalance } from './useBatchBalance';

// Helper to get random number in range
const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

// Helper to delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useVolumeBot() {
    const { chainId, rpcUrl, derivedAccounts } = useWalletStore();
    const { fetchBalances: fetchBatchBalances } = useBatchBalance();

    // Config State
    const [tokenAddress, setTokenAddress] = useState('');
    const [baseTokenSymbol, setBaseTokenSymbol] = useState<'WETH' | 'USDC' | 'USDT'>('WETH');
    const [dexType, setDexType] = useState<'V2' | 'V3'>('V2');
    const [routerAddress, setRouterAddress] = useState('');
    const [amountMin, setAmountMin] = useState('0.001');
    const [amountMax, setAmountMax] = useState('0.01');
    const [intervalMin, setIntervalMin] = useState(5);
    const [intervalMax, setIntervalMax] = useState(15);
    const [v3Fee, setV3Fee] = useState(2500); // 0.25% (PancakeSwap V3 standard)
    const [slippageBps, setSlippageBps] = useState(200); // 2% slippage (200 basis points)

    // Target Token Metadata State (NEW)
    const [targetTokenDecimals, setTargetTokenDecimals] = useState(18);
    const [targetTokenSymbol, setTargetTokenSymbol] = useState('TOKEN');

    // Runtime State
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState({ txCount: 0, volumeEth: 0, success: 0, fail: 0 });

    const stopRef = useRef(false);
    const pauseRef = useRef(false);

    // Update default router when chain/dex changes
    useEffect(() => {
        const defaultRouter = ROUTERS[dexType]?.[chainId];
        if (defaultRouter) setRouterAddress(defaultRouter);
    }, [chainId, dexType]);

    // Sync refs
    useEffect(() => {
        pauseRef.current = isPaused;
    }, [isPaused]);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
    };

    const getClient = () => {
        const chain = [mainnet, bsc, sepolia].find(c => c.id === chainId) || mainnet;
        return createPublicClient({
            transport: http(rpcUrl),
            chain
        });
    };

    /**
     * 检查并加载目标交易代币的元数据
     * @returns {boolean} 是否成功加载
     */
    const fetchTokenMetadata = async () => {
        if (!tokenAddress || !isAddress(tokenAddress)) {
            addLog('错误: 目标代币地址无效或为空。');
            return false;
        }

        try {
            const client = getClient();

            // 尝试读取代币的小数位
            const decimals = await client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'decimals',
            }) as number;

            // 尝试读取代币的符号
            const symbol = await client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'symbol',
            }) as string;

            setTargetTokenDecimals(decimals);
            setTargetTokenSymbol(symbol);
            addLog(`目标代币验证成功: ${symbol} (Decimals: ${decimals})`);
            return true;
        } catch (e: any) {
            // 捕获 "returned no data" 错误
            addLog(`错误: 无法读取目标代币元数据。请检查地址是否为有效的 ERC20 合约。`);
            addLog(`详情: ${e.message ? e.message.slice(0, 100) : '未知合约错误'}`);
            setTargetTokenDecimals(18); // 重置为默认值
            setTargetTokenSymbol('TOKEN');
            return false;
        }
    }

    // Helper to parse the user input amount string based on token decimals
    const parseAmount = (amountStr: string, decimals: number): bigint => {
        try {
            return parseUnits(amountStr, decimals);
        } catch (e) {
            addLog(`错误: 转换交易数量 ${amountStr} 时出错，使用默认值 0n。`);
            return 0n;
        }
    };

    // Helper: Execute a single trade (Buy or Sell)
    const executeSingleTrade = async (
        mnemonic: string,
        accountData: any,
        accountIdx: number,
        action: 'BUY' | 'SELL',
        baseTokenAddress: `0x${string}`,
        baseTokenDecimals: number,
        currentTargetTokenDecimals: number,
        isNativeTrade: boolean
    ) => {
        try {
            const account = mnemonicToAccount(mnemonic, { addressIndex: accountData.index });
            const client = createPublicClient({ chain: chainId === bsc.id ? bsc : (chainId === sepolia.id ? sepolia : mainnet), transport: http(rpcUrl) });
            const walletClient = createWalletClient({ account, chain: chainId === bsc.id ? bsc : (chainId === sepolia.id ? sepolia : mainnet), transport: http(rpcUrl) });

            // 1. Check Balances
            const baseTokenBalance = isNativeTrade
                ? await client.getBalance({ address: account.address })
                : await client.readContract({ address: baseTokenAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });

            const tokenBalance = await client.readContract({ address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });

            // 2. Validate Action
            const minTradeAmount = parseAmount(amountMin, baseTokenDecimals);
            if (action === 'BUY') {
                if (baseTokenBalance < minTradeAmount) {
                    throw new Error(`基础代币余额不足 (${formatUnits(baseTokenBalance, baseTokenDecimals).slice(0, 6)})`);
                }
            } else { // SELL
                if (tokenBalance === 0n) {
                    throw new Error(`目标代币余额为 0`);
                }
            }

            // 3. Calculate Amount
            let amountIn = 0n;
            let sellAmount = 0n;

            if (action === 'BUY') {
                amountIn = parseAmount(randomInRange(Number(amountMin), Number(amountMax)).toFixed(baseTokenDecimals), baseTokenDecimals);
                if (amountIn > baseTokenBalance) amountIn = baseTokenBalance; // Cap at balance
                addLog(`[账户#${accountIdx}] 准备买入: ${formatUnits(amountIn, baseTokenDecimals)} ${baseTokenSymbol}`);
            } else {
                // Sell 50-90% of holdings (Increased from 30-70% to prevent accumulation)
                const sellPercentage = randomInRange(50, 90) / 100;
                sellAmount = (tokenBalance * BigInt(Math.floor(sellPercentage * 100))) / 100n;
                if (sellAmount === 0n) throw new Error('卖出数量过小');
                addLog(`[账户#${accountIdx}] 准备卖出: ${formatUnits(sellAmount, currentTargetTokenDecimals)} ${targetTokenSymbol} (${Math.floor(sellPercentage * 100)}%)`);
            }

            // 4. Approve & Swap
            let txHash: `0x${string}` = '0x';

            if (action === 'BUY') {
                // Approve Base Token if not native
                if (!isNativeTrade) {
                    const allowance = await client.readContract({
                        address: baseTokenAddress, abi: erc20Abi, functionName: 'allowance', args: [account.address, routerAddress as `0x${string}`]
                    });
                    if (allowance < amountIn) {
                        addLog(`[账户#${accountIdx}] 授权 ${baseTokenSymbol}...`);
                        const hash = await walletClient.writeContract({
                            address: baseTokenAddress, abi: erc20Abi, functionName: 'approve', args: [routerAddress as `0x${string}`, maxUint256]
                        });
                        await client.waitForTransactionReceipt({ hash });
                    }
                }

                // Swap
                const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
                const minOut = (amountIn * BigInt(10000 - slippageBps)) / 10000n;

                if (dexType === 'V2') {
                    const path = [baseTokenAddress, tokenAddress];
                    if (isNativeTrade) {
                        txHash = await walletClient.writeContract({
                            address: routerAddress as `0x${string}`, abi: V2_ROUTER_ABI, functionName: 'swapExactETHForTokens',
                            args: [0n, path as [`0x${string}`, `0x${string}`], account.address, deadline], value: amountIn
                        });
                    } else {
                        txHash = await walletClient.writeContract({
                            address: routerAddress as `0x${string}`, abi: V2_ROUTER_ABI, functionName: 'swapExactTokensForTokens',
                            args: [amountIn, 0n, path as [`0x${string}`, `0x${string}`], account.address, deadline]
                        });
                    }
                } else { // V3
                    txHash = await walletClient.writeContract({
                        address: routerAddress as `0x${string}`, abi: V3_ROUTER_ABI, functionName: 'exactInputSingle',
                        args: [{
                            tokenIn: baseTokenAddress, tokenOut: tokenAddress as `0x${string}`, fee: v3Fee, recipient: account.address,
                            amountIn: amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n
                        }], value: isNativeTrade ? amountIn : 0n
                    });
                }
            } else { // SELL
                // Approve Target Token
                const allowance = await client.readContract({
                    address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: 'allowance', args: [account.address, routerAddress as `0x${string}`]
                });
                if (allowance < sellAmount) {
                    addLog(`[账户#${accountIdx}] 授权 ${targetTokenSymbol}...`);
                    const hash = await walletClient.writeContract({
                        address: tokenAddress as `0x${string}`, abi: erc20Abi, functionName: 'approve', args: [routerAddress as `0x${string}`, maxUint256]
                    });
                    await client.waitForTransactionReceipt({ hash });
                }

                // Swap
                const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
                const minOut = 0n; // Safe for sell

                if (dexType === 'V2') {
                    const path = [tokenAddress as `0x${string}`, baseTokenAddress];
                    if (isNativeTrade) {
                        txHash = await walletClient.writeContract({
                            address: routerAddress as `0x${string}`, abi: V2_ROUTER_ABI, functionName: 'swapExactTokensForETH',
                            args: [sellAmount, 0n, path as [`0x${string}`, `0x${string}`], account.address, deadline]
                        });
                    } else {
                        txHash = await walletClient.writeContract({
                            address: routerAddress as `0x${string}`, abi: V2_ROUTER_ABI, functionName: 'swapExactTokensForTokens',
                            args: [sellAmount, 0n, path as [`0x${string}`, `0x${string}`], account.address, deadline]
                        });
                    }
                } else { // V3
                    txHash = await walletClient.writeContract({
                        address: routerAddress as `0x${string}`, abi: V3_ROUTER_ABI, functionName: 'exactInputSingle',
                        args: [{
                            tokenIn: tokenAddress as `0x${string}`, tokenOut: baseTokenAddress, fee: v3Fee, recipient: account.address,
                            amountIn: sellAmount, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n
                        }], value: 0n
                    });
                }
            }

            addLog(`[账户#${accountIdx}] 交易已发送: ${txHash.slice(0, 10)}...`);
            await client.waitForTransactionReceipt({ hash: txHash });
            return { success: true, hash: txHash, action, amount: action === 'BUY' ? amountIn : sellAmount };

        } catch (e: any) {
            let msg = e.message || '未知错误';
            if (msg.includes('execution reverted')) msg = '交易被回滚 (可能原因: 滑点/余额/授权)';
            return { success: false, error: msg, action };
        }
    };

    const executeTrade = async () => {
        if (stopRef.current) return;
        if (pauseRef.current) {
            addLog('任务暂停中...');
            await delay(2000);
            executeTrade();
            return;
        }

        if (!tokenAddress || !isAddress(tokenAddress)) {
            addLog('请输入有效的代币地址');
            return;
        }

        const baseTokenInfo = BASE_TOKENS[chainId]?.[baseTokenSymbol];
        if (!baseTokenInfo) {
            addLog('不支持的链或基础代币');
            return;
        }

        const isNativeTrade = baseTokenSymbol === 'WETH';
        const baseTokenAddress = baseTokenInfo.address as `0x${string}`;
        const baseTokenDecimals = baseTokenInfo.decimals;
        const currentTargetTokenDecimals = targetTokenDecimals;

        try {
            if (derivedAccounts.length < 2) {
                addLog('至少需要2个账户才能执行配对交易');
                return;
            }

            const { mnemonic } = useWalletStore.getState();
            if (!mnemonic) throw new Error('未找到助记词');

            // Select two different accounts
            const idx1 = Math.floor(Math.random() * derivedAccounts.length);
            let idx2;
            do {
                idx2 = Math.floor(Math.random() * derivedAccounts.length);
            } while (idx2 === idx1);

            const account1Data = derivedAccounts[idx1];
            const account2Data = derivedAccounts[idx2];

            addLog(`\n========== 配对交易开始 ==========`);
            addLog(`账户A (#${idx1}) -> 买入`);
            addLog(`账户B (#${idx2}) -> 卖出`);

            // Execute concurrent trades
            const results = await Promise.all([
                executeSingleTrade(mnemonic, account1Data, idx1, 'BUY', baseTokenAddress, baseTokenDecimals, currentTargetTokenDecimals, isNativeTrade),
                executeSingleTrade(mnemonic, account2Data, idx2, 'SELL', baseTokenAddress, baseTokenDecimals, currentTargetTokenDecimals, isNativeTrade)
            ]);

            // Process results
            results.forEach((res, i) => {
                const accIdx = i === 0 ? idx1 : idx2;
                if (res.success) {
                    addLog(`✓ [账户#${accIdx}] ${res.action} 成功! Hash: ${res.hash?.slice(0, 10)}...`);
                    setStats(prev => ({
                        ...prev,
                        txCount: prev.txCount + 1,
                        success: prev.success + 1,
                        volumeEth: res.action === 'BUY' ? prev.volumeEth + Number(formatUnits(res.amount || 0n, baseTokenDecimals)) : prev.volumeEth
                    }));
                } else {
                    addLog(`✗ [账户#${accIdx}] ${res.action} 失败: ${res.error}`);
                    setStats(prev => ({ ...prev, txCount: prev.txCount + 1, fail: prev.fail + 1 }));
                }
            });

        } catch (e: any) {
            addLog(`配对交易执行错误: ${e.message}`);
        }

        // Schedule next
        const nextDelay = randomInRange(intervalMin, intervalMax) * 1000;
        addLog(`等待 ${Math.floor(nextDelay / 1000)} 秒后执行下一轮...`);
        await delay(nextDelay);
        executeTrade();
    };

    const startBot = async () => {
        // 关键修复: 启动前检查目标代币有效性
        const isValid = await fetchTokenMetadata();
        if (!isValid) {
            return;
        }

        stopRef.current = false;
        pauseRef.current = false;
        setIsRunning(true);
        setIsPaused(false);
        executeTrade();
    };

    const stopBot = () => {
        stopRef.current = true;
        setIsRunning(false);
        setIsPaused(false);
        addLog('任务已停止');
    };

    const togglePause = () => {
        setIsPaused(prev => !prev);
    };

    // Account Balances State (NEW)
    const [accountBalances, setAccountBalances] = useState<{ address: string; base: string; token: string }[]>([]);

    /**
     * 批量获取所有衍生账户的余额
     */
    const fetchBalances = async () => {
        if (!tokenAddress) return;

        const baseTokenInfo = BASE_TOKENS[chainId]?.[baseTokenSymbol];
        const isNativeTrade = baseTokenSymbol === 'WETH';
        const baseTokenAddress = isNativeTrade ? undefined : baseTokenInfo?.address;

        // Use the new generic hook
        // Note: The hook returns a map, we need to convert it back to array for the UI table
        const addresses = derivedAccounts.map(acc => acc.evmAddress);

        // Fetch target token and native balances
        const targetTokenAndNativeBalances = await fetchBatchBalances(
            addresses,
            tokenAddress,
            targetTokenDecimals
        );

        let baseErc20Balances: Record<string, import('./useBatchBalance').BalanceResult> = {};
        if (!isNativeTrade && baseTokenAddress) {
            // If base is ERC20, fetch its balances separately
            baseErc20Balances = await fetchBatchBalances(addresses, baseTokenAddress, baseTokenInfo?.decimals);
        }

        const list = derivedAccounts.map(acc => {
            const targetRes = targetTokenAndNativeBalances[acc.evmAddress];
            let baseVal = '0';

            if (isNativeTrade) {
                // In native mode, targetRes has native balance (isNative=true)
                baseVal = targetRes?.amount || '0';
            } else {
                // If Base is ERC20, we use the token balance from second fetch
                baseVal = baseErc20Balances[acc.evmAddress]?.amount || '0';
            }

            return {
                address: acc.evmAddress,
                base: baseVal,
                token: targetRes?.amount || '0'
            };
        });

        setAccountBalances(list);
        addLog('账户余额已更新');
    };

    const clearLogs = () => {
        setLogs([]);
    };

    const resetState = () => {
        setIsRunning(false);
        setIsPaused(false);
        stopRef.current = true;
        pauseRef.current = false;
    };

    // Auto-fetch balances when config changes or bot starts
    useEffect(() => {
        if (tokenAddress && isAddress(tokenAddress)) {
            fetchBalances();
        }
    }, [tokenAddress, baseTokenSymbol, chainId, derivedAccounts.length]);

    return {
        config: {
            tokenAddress, setTokenAddress,
            baseTokenSymbol, setBaseTokenSymbol,
            dexType, setDexType,
            routerAddress, setRouterAddress,
            amountMin, setAmountMin,
            amountMax, setAmountMax,
            intervalMin, setIntervalMin,
            intervalMax, setIntervalMax,
            v3Fee, setV3Fee,
            slippageBps, setSlippageBps,
            targetTokenDecimals, setTargetTokenDecimals,
            targetTokenSymbol, setTargetTokenSymbol
        },
        state: {
            isRunning,
            isPaused,
            logs,
            stats,
            targetTokenSymbol,
            accountBalances,
        },
        actions: {
            startBot,
            stopBot,
            togglePause,
            fetchBalances,
            clearLogs,
            resetState,
        }
    };
}