import { useMemo, useState } from 'react';
import {
    Card,
    Space,
    Typography,
    Button,
    Input,
    Table,
    Tag,
    App,
    Tooltip,
} from 'antd';
import TextArea from 'antd/es/input/TextArea';
import {
    bytesToHex,
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    parseUnits,
    formatEther,
    formatUnits,
    erc20Abi,
} from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { mainnet, sepolia, bsc, bscTestnet } from 'viem/chains';
import { useWalletStore } from '../store/walletStore';

const { Text } = Typography;

// Supported chains map
const SUPPORTED_CHAINS: Record<number, any> = {
    [mainnet.id]: mainnet,
    [sepolia.id]: sepolia,
    [bsc.id]: bsc,
    [bscTestnet.id]: bscTestnet,
};

type AddressState = {
    key: string;
    address: string;
    bnb?: string;
    token?: string;
    amount?: string;
    lastError?: string | null;
};

type TaskAccount = {
    pk: string;
    address: `0x${string}`;
};

// Helper function to abbreviate address
const abbreviateAddress = (addr: string) => {
    if (!addr || addr.length < 10) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

import { useBatchBalance } from '../hooks/useBatchBalance';

// ... (existing imports)

export default function EvmBatchCollection() {
    const { chainId, rpcUrl, mnemonic: globalMnemonic, derivedAccounts } = useWalletStore();
    const { fetchBalances: fetchBatchBalances } = useBatchBalance();
    const { message } = App.useApp();

    const [privateKeysInput, setPrivateKeysInput] = useState('');
    const [mnemonic, setMnemonic] = useState('');
    const [accountCount, setAccountCount] = useState(0);
    const [accountStart, setAccountStart] = useState(0);
    const [targetAddress, setTargetAddress] = useState('');
    const [tokenAddress, setTokenAddress] = useState('');
    const [tokenDecimals, setTokenDecimals] = useState(18);
    const [reserveNative, setReserveNative] = useState('');
    const [gasLimit, setGasLimit] = useState(21000);

    const [addressStates, setAddressStates] = useState<AddressState[]>([]);
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const parsedAccounts = useMemo(() => {
        const accounts: TaskAccount[] = [];

        // 1. Global Wallet Store Accounts
        if (globalMnemonic && derivedAccounts.length > 0) {
            try {
                // Re-derive private keys for derived accounts since they are hidden in store
                derivedAccounts.forEach(da => {
                    const acc = mnemonicToAccount(globalMnemonic, { addressIndex: da.index });
                    const pkBytes = acc.getHdKey().privateKey;
                    if (pkBytes) {
                        const pkHex = bytesToHex(pkBytes) as `0x${string}`;
                        accounts.push({ pk: pkHex, address: acc.address });
                    }
                });
            } catch (e) {
                console.warn('Global mnemonic re-derivation error', e);
            }
        }

        // 2. Local Input Private Keys
        const keys = privateKeysInput
            .split(/[\n,;]/)
            .map(k => k.trim())
            .filter(Boolean);
        keys.forEach(pk => {
            try {
                const acc = privateKeyToAccount(pk as `0x${string}`);
                if (!accounts.find(a => a.address === acc.address)) {
                    accounts.push({ pk, address: acc.address });
                }
            } catch (e) {
                // ignore
            }
        });

        // 3. Local Input Mnemonic
        if (mnemonic) {
            try {
                for (let i = 0; i < accountCount; i++) {
                    const accIndex = accountStart + i;
                    const acc = mnemonicToAccount(mnemonic, { addressIndex: accIndex });
                    const pkBytes = acc.getHdKey().privateKey;
                    if (pkBytes) {
                        const pkHex = bytesToHex(pkBytes) as `0x${string}`;
                        if (!accounts.find(a => a.address === acc.address)) {
                            accounts.push({ pk: pkHex, address: acc.address });
                        }
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        return accounts;
    }, [privateKeysInput, mnemonic, accountCount, accountStart, globalMnemonic, derivedAccounts]);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
    };

    const fetchBalances = async () => {
        if (!parsedAccounts.length) {
            message.warning('请先导入私钥或助记词');
            return;
        }
        try {
            const addresses = parsedAccounts.map(acc => acc.address);
            const balanceMap = await fetchBatchBalances(addresses, tokenAddress, tokenDecimals);

            const currentChain = SUPPORTED_CHAINS[chainId];
            // We still need gasPrice for auto-calculation if needed, but let's keep it simple or fetch it separately if needed.
            // The original code fetched gasPrice to calculate reserve.
            // Let's fetch gasPrice separately if we need to calculate reserve.

            let gasPrice = 0n;
            if (!tokenAddress && !reserveNative) {
                const client = createPublicClient({
                    transport: http(rpcUrl),
                    chain: currentChain
                });
                gasPrice = await client.getGasPrice();
            }

            const list = parsedAccounts.map(acc => {
                const res = balanceMap[acc.address];
                // The new interface returns either native OR token balance based on input
                // If tokenAddress is set, we get token balance in rawAmount
                // If tokenAddress is NOT set, we get native balance in rawAmount
                const rawAmount = res?.rawAmount || 0n;


                // Auto-fill amount
                let autoAmount = '';
                if (tokenAddress) {
                    // Token transfer: use full balance
                    // In token mode, rawAmount is token balance
                    autoAmount = formatUnits(rawAmount, tokenDecimals);
                } else {
                    // Native transfer: balance - reserve
                    // In native mode, rawAmount is native balance
                    let reserve = 0n;
                    if (reserveNative) {
                        reserve = parseEther(reserveNative);
                    } else {
                        // Auto-calculate: gasPrice * gasLimit
                        reserve = gasPrice * BigInt(gasLimit);
                    }

                    if (rawAmount > reserve) {
                        autoAmount = formatEther(rawAmount - reserve);
                    } else {
                        autoAmount = '0';
                    }
                }

                return {
                    key: acc.address,
                    address: acc.address,
                    bnb: !tokenAddress ? formatEther(rawAmount) : '0', // We don't have native bal in token mode anymore
                    token: tokenAddress ? formatUnits(rawAmount, tokenDecimals) : undefined,
                    amount: autoAmount,
                };
            });

            setAddressStates(list);
            message.success('余额刷新成功');
        } catch (err: any) {
            message.error(err?.message || '查询失败');
        }
    };

    const executeTransfer = async (task: TaskAccount) => {
        if (!targetAddress) throw new Error('请填写目标地址');

        const state = addressStates.find(s => s.address === task.address);
        const amountStr = state?.amount || '0';

        if (Number(amountStr) <= 0) throw new Error('转账数量无效 (0)');

        // Fix: Provide a minimal chain definition to satisfy viem types
        const chainDef = {
            id: chainId,
            name: 'Current Chain',
            network: 'current',
            nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
            rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } }
        } as any;

        const walletClient = createWalletClient({
            account: privateKeyToAccount(task.pk as `0x${string}`),
            transport: http(rpcUrl),
            chain: chainDef,
        });

        if (tokenAddress) {
            // Token Transfer
            const amount = parseUnits(amountStr, tokenDecimals);
            await walletClient.writeContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [targetAddress as `0x${string}`, amount],
                gas: BigInt(gasLimit),
                chain: chainDef,
            } as any);
        } else {
            // Native Transfer
            const amount = parseEther(amountStr);
            await walletClient.sendTransaction({
                to: targetAddress as `0x${string}`,
                value: amount,
                gas: BigInt(gasLimit),
                chain: chainDef,
            } as any);
        }
    };

    const clearZeroBalances = () => {
        setAddressStates(prev => prev.filter(s => {
            const bnb = Number(s.bnb || '0');
            const token = Number(s.token || '0');
            return bnb > 0 || token > 0;
        }));
        message.success('已清理零余额账户');
    };

    const startCollection = async () => {
        if (!parsedAccounts.length) {
            message.warning('请先导入私钥或助记词');
            return;
        }
        if (!targetAddress) {
            message.error('请输入目标归集地址');
            return;
        }

        // Filter valid tasks: must be in addressStates and have amount > 0
        const validTasks = parsedAccounts.filter(task => {
            const state = addressStates.find(s => s.address === task.address);
            return state && Number(state.amount) > 0;
        });

        if (validTasks.length === 0) {
            message.warning('没有可归集的账户 (余额不足或未刷新)');
            return;
        }

        setRunning(true);
        const queue = validTasks;
        let success = 0;
        for (const task of queue) {
            try {
                await executeTransfer(task);
                success += 1;
                addLog(`地址 ${task.address} 归集成功`);
            } catch (err: any) {
                addLog(`地址 ${task.address} 失败: ${err?.message || err}`);
            }
        }
        addLog(`任务完成，成功 ${success}/${queue.length}`);
        setRunning(false);
    };

    return (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            <Card title="批量归集参数">
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                    <Space wrap>
                        <Input
                            placeholder="Token 地址 (空则归集 Native)"
                            value={tokenAddress}
                            onChange={(e) => setTokenAddress(e.target.value)}
                            style={{ width: 300 }}
                        />
                        {tokenAddress && (
                            <Input
                                placeholder="Decimals"
                                value={tokenDecimals}
                                onChange={(e) => setTokenDecimals(Number(e.target.value) || 18)}
                                style={{ width: 100 }}
                            />
                        )}
                        <Input
                            placeholder="目标接收地址"
                            value={targetAddress}
                            onChange={(e) => setTargetAddress(e.target.value)}
                            style={{ width: 300 }}
                        />
                        {!tokenAddress && (
                            <Input
                                placeholder="保留 Native (Gas)"
                                value={reserveNative}
                                onChange={(e) => setReserveNative(e.target.value)}
                                style={{ width: 150 }}
                            />
                        )}
                        <Input
                            placeholder="Gas Limit"
                            value={gasLimit}
                            onChange={(e) => setGasLimit(Number(e.target.value) || 100000)}
                            style={{ width: 120 }}
                        />
                    </Space>

                    <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                        <Text>私钥列表 / 助记词</Text>
                        <TextArea rows={4} placeholder="每行一个私钥" value={privateKeysInput} onChange={(e) => setPrivateKeysInput(e.target.value)} />
                        <Space>
                            <Input placeholder="助记词（可选）" value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} style={{ width: 400 }} />
                            <Input placeholder="起始序号" value={accountStart} onChange={(e) => setAccountStart(Number(e.target.value) || 0)} style={{ width: 100 }} />
                            <Input placeholder="数量" value={accountCount} onChange={(e) => setAccountCount(Number(e.target.value) || 0)} style={{ width: 100 }} />
                        </Space>
                    </Space>

                    <Space>
                        <Button onClick={fetchBalances}>刷新余额 (自动填充)</Button>
                        <Button onClick={clearZeroBalances}>清理零余额</Button>
                        <Button
                            danger
                            onClick={() => {
                                setRunning(false);
                                message.info('已重置运行状态');
                            }}
                            disabled={!running}
                        >
                            重置状态
                        </Button>
                        <Button type="primary" loading={running} onClick={startCollection}>
                            开始批量归集
                        </Button>
                    </Space>
                </Space>
            </Card>

            <Card title="账户列表">
                <Table<AddressState>
                    dataSource={addressStates}
                    columns={[
                        {
                            title: '地址',
                            dataIndex: 'address',
                            render: (value: string) => (
                                <Tooltip title={value}>
                                    <Text code>{abbreviateAddress(value)}</Text>
                                </Tooltip>
                            )
                        },
                        { title: 'Native 余额', dataIndex: 'bnb' },
                        { title: 'Token 余额', dataIndex: 'token' },
                        {
                            title: '归集数量',
                            dataIndex: 'amount',
                            render: (val: string, record: AddressState) => (
                                <Input
                                    value={val}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setAddressStates(prev => prev.map(p => p.address === record.address ? { ...p, amount: newVal } : p));
                                    }}
                                    style={{ width: 120 }}
                                />
                            )
                        },
                        {
                            title: '状态',
                            dataIndex: 'lastError',
                            render: (value?: string) => (value ? <Tag color="red">{value}</Tag> : <Tag color="green">正常</Tag>),
                        },
                    ]}
                    rowKey="address"
                    pagination={false}
                    locale={{ emptyText: '暂无数据' }}
                />
            </Card>

            <Card
                title="日志"
                styles={{ body: { maxHeight: 240, overflow: 'auto' } }}
                extra={
                    <Button
                        size="small"
                        onClick={() => {
                            setLogs([]);
                            message.success('日志已清空');
                        }}
                        disabled={logs.length === 0}
                    >
                        清空日志
                    </Button>
                }
            >
                <Space orientation="vertical" style={{ width: '100%' }}>
                    {logs.map((line, idx) => (
                        <Text key={idx} type="secondary">{line}</Text>
                    ))}
                    {!logs.length && <Text type="secondary">暂无日志</Text>}
                </Space>
            </Card>
        </Space>
    );
}
