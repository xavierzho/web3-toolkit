import { useMemo, useState } from 'react';
import {
  Card,
  Space,
  Typography,
  Button,
  Input,
  Table,
  Tag,
  message,
  Select,
  Switch,
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
import { bsc } from 'viem/chains';

const { Text } = Typography;

type TradeMode = 'buy' | 'sell';
type BuyMode = 'exactSpend' | 'exactOut' | 'spendAll';

type AddressState = {
  key: string;
  address: string;
  bnb?: string;
  token?: string;
  lastError?: string | null;
};

type TaskAccount = {
  pk: string;
  address: `0x${string}`;
};

const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'amountIn' },
      { type: 'address[]', name: 'path' },
    ],
    outputs: [{ type: 'uint256[]', name: 'amounts' }],
  },
  {
    name: 'getAmountsIn',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { type: 'uint256', name: 'amountOut' },
      { type: 'address[]', name: 'path' },
    ],
    outputs: [{ type: 'uint256[]', name: 'amounts' }],
  },
  {
    name: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { type: 'uint256', name: 'amountOutMin' },
      { type: 'address[]', name: 'path' },
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'deadline' },
    ],
    outputs: [],
  },
  {
    name: 'swapETHForExactTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { type: 'uint256', name: 'amountOut' },
      { type: 'address[]', name: 'path' },
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'deadline' },
    ],
    outputs: [{ type: 'uint256[]', name: 'amounts' }],
  },
  {
    name: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { type: 'uint256', name: 'amountIn' },
      { type: 'uint256', name: 'amountOutMin' },
      { type: 'address[]', name: 'path' },
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'deadline' },
    ],
    outputs: [],
  },
] as const;

const defaultForm = () => ({
  readRpc: 'https://bsc-dataseed.binance.org/',
  writeRpc: 'https://bsc-dataseed.binance.org/',
  router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
  wbnb: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  token: '',
  tokenDecimals: 18,
  slippage: 0.015,
  gasLimit: 300000,
  concurrency: 3,
  mode: 'buy' as TradeMode,
  buyMode: 'exactSpend' as BuyMode,
  amountInBnb: '',
  amountOutToken: '',
  sellAmountToken: '',
  reserveBnb: '0.003',
  sellAll: false,
});

export default function MultiTradePage() {
  const [form, setForm] = useState(defaultForm());
  const [privateKeysInput, setPrivateKeysInput] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [accountCount, setAccountCount] = useState(0);
  const [accountStart, setAccountStart] = useState(0);
  const [addressStates, setAddressStates] = useState<AddressState[]>([]);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const pathWbnbToToken = useMemo(() => [form.wbnb, form.token], [form]);
  const pathTokenToWbnb = useMemo(() => [form.token, form.wbnb], [form]);

  const parsedAccounts = useMemo(() => {
    const keys = privateKeysInput
      .split(/[\n,;]/)
      .map(k => k.trim())
      .filter(Boolean);
    const accounts: TaskAccount[] = [];
    keys.forEach(pk => {
      try {
        const acc = privateKeyToAccount(pk as `0x${string}`);
        accounts.push({ pk, address: acc.address });
      } catch (e) {
        console.warn('PK parse error', e);
      }
    });
    if (mnemonic) {
      try {
        for (let i = 0; i < accountCount; i++) {
          const accIndex = accountStart + i;
          const acc = mnemonicToAccount(mnemonic, { addressIndex: accIndex });
          const pkBytes = acc.getHdKey().privateKey;
          if (!pkBytes) throw new Error('无法解析助记词私钥');
          const pkHex = bytesToHex(pkBytes) as `0x${string}`;
          accounts.push({ pk: pkHex, address: acc.address });
        }
      } catch (e) {
        console.warn('Mnemonic parse error', e);
      }
    }
    return accounts;
  }, [privateKeysInput, mnemonic, accountCount, accountStart]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 200));
  };

  const fetchBalances = async () => {
    if (!parsedAccounts.length) {
      message.warning('请先导入私钥或助记词');
      return;
    }
    try {
      // Enable JSON-RPC batching
      const client = createPublicClient({
        transport: http(form.readRpc, { batch: true }),
        chain: bsc
      });

      const list = await Promise.all(
        parsedAccounts.map(async acc => {
          try {
            const [bnb, tokenBal] = await Promise.all([
              client.getBalance({ address: acc.address }),
              form.token
                ? client.readContract({
                  address: form.token as `0x${string}`,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [acc.address],
                })
                : Promise.resolve(0n),
            ]);

            return {
              key: acc.address,
              address: acc.address,
              bnb: formatEther(bnb),
              token: form.token ? formatUnits(tokenBal as bigint, form.tokenDecimals) : undefined,
            };
          } catch (err: any) {
            return { key: acc.address, address: acc.address, lastError: err?.message };
          }
        })
      );
      setAddressStates(list);
    } catch (err: any) {
      message.error(err?.message || '查询失败');
    }
  };

  const applySlippage = (amount: bigint, slip: number, orientation: 'down' | 'up') => {
    const factor = BigInt(Math.floor((orientation === 'down' ? 1 - slip : 1 + slip) * 10_000));
    return (amount * factor) / 10_000n;
  };

  const executeBuy = async (task: TaskAccount) => {
    if (!form.token) throw new Error('请填写代币地址');
    const publicClient = createPublicClient({ transport: http(form.readRpc), chain: bsc });
    const walletClient = createWalletClient({
      account: privateKeyToAccount(task.pk as `0x${string}`),
      transport: http(form.writeRpc),
      chain: bsc,
    });
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    if (form.buyMode === 'exactOut') {
      if (!form.amountOutToken) throw new Error('请输入目标 Token 数量');
      const desired = parseUnits(form.amountOutToken, form.tokenDecimals);
      const amountsIn = await publicClient.readContract({
        address: form.router as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'getAmountsIn',
        args: [desired, pathWbnbToToken as `0x${string}`[]],
      });
      const maxIn = applySlippage(amountsIn[0], form.slippage, 'up');
      await walletClient.writeContract({
        address: form.router as `0x${string}`,
        abi: ROUTER_ABI,
        functionName: 'swapETHForExactTokens',
        args: [desired, pathWbnbToToken as `0x${string}`[], task.address, deadline],
        value: maxIn,
        gas: BigInt(form.gasLimit),
      });
      return;
    }
    let amountIn: bigint;
    if (form.buyMode === 'spendAll') {
      const balance = await publicClient.getBalance({ address: task.address });
      const reserve = parseEther(form.reserveBnb || '0.003');
      if (balance <= reserve) throw new Error('BNB 余额不足');
      amountIn = balance - reserve;
    } else {
      if (!form.amountInBnb) throw new Error('请填写买入数量');
      amountIn = parseEther(form.amountInBnb);
    }
    if (amountIn <= 0n) throw new Error('买入数量无效');
    const amountsOut = await publicClient.readContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, pathWbnbToToken as `0x${string}`[]],
    });
    const minOut = applySlippage(amountsOut[amountsOut.length - 1], form.slippage, 'down');
    await walletClient.writeContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'swapExactETHForTokensSupportingFeeOnTransferTokens',
      args: [minOut, pathWbnbToToken as `0x${string}`[], task.address, deadline],
      value: amountIn,
      gas: BigInt(form.gasLimit),
    });
  };

  const executeSell = async (task: TaskAccount) => {
    if (!form.token) throw new Error('请填写代币地址');
    const publicClient = createPublicClient({ transport: http(form.readRpc), chain: bsc });
    const walletClient = createWalletClient({
      account: privateKeyToAccount(task.pk as `0x${string}`),
      transport: http(form.writeRpc),
      chain: bsc,
    });
    let amountIn: bigint;
    if (form.sellAll) {
      const bal = await publicClient.readContract({
        address: form.token as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [task.address],
      });
      if (bal <= 0n) throw new Error('Token 余额不足');
      amountIn = bal;
    } else {
      if (!form.sellAmountToken) throw new Error('请填写卖出数量');
      amountIn = parseUnits(form.sellAmountToken, form.tokenDecimals);
    }
    if (amountIn <= 0n) throw new Error('卖出数量无效');
    await walletClient.writeContract({
      address: form.token as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [form.router as `0x${string}`, amountIn],
    });
    const amountsOut = await publicClient.readContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, pathTokenToWbnb as `0x${string}`[]],
    });
    const minOut = applySlippage(amountsOut[amountsOut.length - 1], form.slippage, 'down');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    await walletClient.writeContract({
      address: form.router as `0x${string}`,
      abi: ROUTER_ABI,
      functionName: 'swapExactTokensForETHSupportingFeeOnTransferTokens',
      args: [amountIn, minOut, pathTokenToWbnb as `0x${string}`[], task.address, deadline],
      gas: BigInt(form.gasLimit),
    });
  };

  const startTrading = async () => {
    if (!parsedAccounts.length) {
      message.warning('请先导入私钥或助记词');
      return;
    }
    setRunning(true);
    const queue = [...parsedAccounts];
    let success = 0;
    for (const task of queue) {
      try {
        if (form.mode === 'buy') {
          await executeBuy(task);
        } else {
          await executeSell(task);
        }
        success += 1;
        addLog(`地址 ${task.address} 执行成功`);
      } catch (err: any) {
        addLog(`地址 ${task.address} 失败: ${err?.message || err}`);
      }
    }
    addLog(`任务完成，成功 ${success}/${queue.length}`);
    setRunning(false);
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card title="批量交易参数">
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Input style={{ width: 260 }} placeholder="读 RPC" value={form.readRpc} onChange={(e) => setForm({ ...form, readRpc: e.target.value })} />
            <Input style={{ width: 260 }} placeholder="写 RPC" value={form.writeRpc} onChange={(e) => setForm({ ...form, writeRpc: e.target.value })} />
            <Input style={{ width: 260 }} placeholder="Router 地址" value={form.router} onChange={(e) => setForm({ ...form, router: e.target.value })} />
            <Input style={{ width: 260 }} placeholder="WBNB 地址" value={form.wbnb} onChange={(e) => setForm({ ...form, wbnb: e.target.value })} />
            <Input style={{ width: 260 }} placeholder="Token 地址" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} />
            <Input style={{ width: 120 }} placeholder="Token Decimals" value={form.tokenDecimals} onChange={(e) => setForm({ ...form, tokenDecimals: Number(e.target.value) || 18 })} />
          </Space>
          <Space wrap>
            <Select
              value={form.mode}
              onChange={(value: TradeMode) => setForm({ ...form, mode: value })}
              options={[
                { label: '批量买入', value: 'buy' },
                { label: '批量卖出', value: 'sell' },
              ]}
            />
            {form.mode === 'buy' && (
              <Space>
                <Select
                  value={form.buyMode}
                  onChange={(value: BuyMode) => setForm({ ...form, buyMode: value })}
                  options={[
                    { label: 'Exact Spend', value: 'exactSpend' },
                    { label: 'Exact Out', value: 'exactOut' },
                    { label: '花光 BNB（保留备用）', value: 'spendAll' },
                  ]}
                />
                {form.buyMode === 'exactSpend' && (
                  <Input placeholder="花费 BNB" value={form.amountInBnb} onChange={(e) => setForm({ ...form, amountInBnb: e.target.value })} />
                )}
                {form.buyMode === 'exactOut' && (
                  <Input placeholder="得到 Token 数量" value={form.amountOutToken} onChange={(e) => setForm({ ...form, amountOutToken: e.target.value })} />
                )}
                {form.buyMode === 'spendAll' && (
                  <Input placeholder="保留 BNB" value={form.reserveBnb} onChange={(e) => setForm({ ...form, reserveBnb: e.target.value })} />
                )}
              </Space>
            )}
            {form.mode === 'sell' && (
              <Space align="center">
                <Switch checked={form.sellAll} onChange={(checked) => setForm({ ...form, sellAll: checked })} />
                <Text type="secondary">卖出全部 Token</Text>
                {!form.sellAll && (
                  <Input placeholder="卖出 Token 数量" value={form.sellAmountToken} onChange={(e) => setForm({ ...form, sellAmountToken: e.target.value })} />
                )}
              </Space>
            )}
            <Input placeholder="滑点 (0.01=1%)" value={form.slippage} onChange={(e) => setForm({ ...form, slippage: Number(e.target.value) || 0 })} style={{ width: 150 }} />
          </Space>
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            <Text>私钥列表 / 助记词</Text>
            <TextArea rows={4} placeholder="每行一个私钥" value={privateKeysInput} onChange={(e) => setPrivateKeysInput(e.target.value)} />
            <Input placeholder="助记词（可选）" value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} />
            <Input placeholder="助记词起始序号" value={accountStart} onChange={(e) => setAccountStart(Number(e.target.value) || 0)} />
            <Input placeholder="助记词导出账户数量" value={accountCount} onChange={(e) => setAccountCount(Number(e.target.value) || 0)} />
          </Space>
          <Space>
            <Button onClick={fetchBalances}>刷新余额</Button>
            <Button type="primary" loading={running} onClick={startTrading}>
              {form.mode === 'buy' ? '开始批量买入' : '开始批量卖出'}
            </Button>
          </Space>
        </Space>
      </Card>

      <Card title="账户列表">
        <Table<AddressState>
          dataSource={addressStates}
          columns={[
            { title: '地址', dataIndex: 'address', render: (value: string) => <Text code>{value}</Text> },
            { title: 'BNB', dataIndex: 'bnb' },
            { title: 'Token', dataIndex: 'token' },
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

      <Card title="日志" styles={{ body: { maxHeight: 240, overflow: 'auto' } }}>
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
