import { Card, Space, Typography, Button, Input, Select, Tag } from 'antd';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { useUnifiedSender } from '../hooks/useUnifiedSender';
import { useSettingsStore } from '../store/settingsStore';
import { useWalletStore } from '../store/walletStore';
import { useOkxApi } from '../hooks/useOkxApi';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';

const { Text } = Typography;


type BridgeToken = {
  id: string;
  symbol: string;
  fromChainId: string;
  toChainId: string;
  tokenContractAddress: string;
  toTokenContractAddress: string;
  decimals: number;
  bridgeType?: 'okx' | 'solana';
};

const CHAIN_OPTIONS = [
  { value: 'solana', label: 'Solana Mainnet' },
  { value: '1', label: 'Ethereum Mainnet' },
  { value: '56', label: 'BNB Smart Chain' },
  { value: '137', label: 'Polygon' },
  { value: '42161', label: 'Arbitrum One' },
  { value: '10', label: 'Optimism' },
  { value: '8453', label: 'Base' },
];

const fallbackTokens: BridgeToken[] = [{
  id: 'usdt',
  symbol: 'USDT',
  fromChainId: '56',
  toChainId: '42161',
  tokenContractAddress: '0x55d398326f99059ff775485246999027b3197955',
  toTokenContractAddress: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
  decimals: 18,
  bridgeType: 'okx',
}];

export default function OkxBridge() {
  const { okxConfig } = useSettingsStore();
  const api = useOkxApi();
  const { activeEvmAddress } = useWalletStore();
  const { connection } = useConnection();
  const { publicKey, sendTransaction: sendSolTransaction } = useWallet();

  const [amount, setAmount] = useState('10');
  const [log, setLog] = useState('');
  const [tokenOptions, setTokenOptions] = useState<BridgeToken[]>(fallbackTokens);
  const [selectedToken, setSelectedToken] = useState<string>(fallbackTokens[0]?.id ?? '');
  const [form, setForm] = useState(() => ({
    fromChainId: fallbackTokens[0]?.fromChainId ?? '56',
    toChainId: fallbackTokens[0]?.toChainId ?? '42161',
    tokenContractAddress: fallbackTokens[0]?.tokenContractAddress ?? '',
    toTokenContractAddress: fallbackTokens[0]?.toTokenContractAddress ?? '',
    decimals: String(fallbackTokens[0]?.decimals ?? 18),
  }));
  const [bridgeSolAddress, setBridgeSolAddress] = useState('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth');
  const [targetEvmAddress, setTargetEvmAddress] = useState('');
  const [solAmount, setSolAmount] = useState('0.1');
  const [solMemo, setSolMemo] = useState('');
  const [solLog, setSolLog] = useState('');
  const [solLoading, setSolLoading] = useState(false);
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

  const selectedTokenDef = tokenOptions.find(token => token.id === selectedToken);
  const isSolBridge = selectedTokenDef?.bridgeType === 'solana';

  const currentRoute = useMemo(() => {
    const from = CHAIN_OPTIONS.find(opt => opt.value === form.fromChainId)?.label || `Chain ${form.fromChainId}`;
    const to = CHAIN_OPTIONS.find(opt => opt.value === form.toChainId)?.label || `Chain ${form.toChainId}`;
    return `${from} → ${to}`;
  }, [form]);

  const handleTokenChange = (value: string) => {
    setSelectedToken(value);
    const token = tokenOptions.find(t => t.id === value);
    if (token) {
      setForm({
        fromChainId: token.fromChainId,
        toChainId: token.toChainId,
        tokenContractAddress: token.tokenContractAddress,
        toTokenContractAddress: token.toTokenContractAddress,
        decimals: String(token.decimals),
      });
    }
  };
  const { sendTransaction } = useUnifiedSender(Number(form.fromChainId) || 56);

  const logSol = (line: string) => {
    setSolLog(prev => `[${new Date().toLocaleTimeString()}] ${line}\n${prev}`);
  };

  const handleSolBridge = async () => {
    if (!publicKey) {
      logSol('请连接 Solana 钱包');
      return;
    }
    if (!bridgeSolAddress) {
      logSol('请填写桥接合约地址');
      return;
    }
    try {
      setSolLoading(true);
      const tx = new Transaction();
      tx.add(SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(bridgeSolAddress),
        lamports: Math.floor(Number(solAmount || '0') * 1_000_000_000),
      }));
      const memoText = solMemo || targetEvmAddress;
      if (memoText) {
        tx.add(new TransactionInstruction({
          keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memoText, 'utf8'),
        }));
      }
      const signature = await sendSolTransaction(tx, connection);
      logSol(`Sol → Bridge TX: ${signature}`);
    } catch (err: any) {
      logSol(`失败: ${err?.message || err}`);
    } finally {
      setSolLoading(false);
    }
  };

  useEffect(() => {
    const fetchTokens = async () => {
      try {
        const data = await api.dex.get_all_tokens({});
        if (Array.isArray(data)) {
          const mapped: BridgeToken[] = (data as any[]).map((item: any) => ({
            id: `${item.chainId}-${item.tokenContractAddress}`,
            symbol: item.symbol || item.tokenSymbol || 'Token',
            fromChainId: item.chainId,
            toChainId: item.chainId,
            tokenContractAddress: item.tokenContractAddress,
            toTokenContractAddress: item.tokenContractAddress,
            decimals: Number(item.decimals || item.tokenDecimals || 18),
            bridgeType: 'okx' as const,
          })).filter((token: BridgeToken) => token.tokenContractAddress);
          setTokenOptions((prev) => {
            const map = new Map(prev.map((t) => [t.id, t]));
            mapped.forEach((token) => {
              if (!map.has(token.id)) map.set(token.id, token);
            });
            return Array.from(map.values());
          });
        }
      } catch (err: any) {
        setLog(prev => `同步 Token 列表失败: ${err?.message || err}\n${prev}`);
      }
    };
    fetchTokens();
  }, [api]);

  useEffect(() => {
    if (!selectedToken && tokenOptions.length) {
      const first = tokenOptions[0];
      setSelectedToken(first.id);
      setForm({
        fromChainId: first.fromChainId,
        toChainId: first.toChainId,
        tokenContractAddress: first.tokenContractAddress,
        toTokenContractAddress: first.toTokenContractAddress,
        decimals: String(first.decimals),
      });
    }
  }, [tokenOptions, selectedToken]);


  const runBridge = async () => {
    if (!okxConfig.apiKey) {
      alert('请先配置 API');
      return;
    }
    setLog('获取报价...');
    try {
      const params = {
        fromChainId: form.fromChainId,
        toChainId: form.toChainId,
        fromTokenAddress: form.tokenContractAddress,
        toTokenAddress: form.toTokenContractAddress,
        amount: parseUnits(amount, Number(form.decimals) || 18).toString(),
        userWalletAddress: activeEvmAddress,
        slippage: '0.01',
        sort: 1,
        dexIds: '',
        feePercent: '0',
        priceImpactProtectionPercentage: '1',
      };


      const quoteData = await api.dex.crossChain.quote(params);
      // Handle potential array response if the API returns a list
      const quote = Array.isArray(quoteData) ? quoteData[0] : quoteData;

      if (!quote) throw new Error('No quote received');
      setLog(`报价: 预计获得 ${formatUnits(BigInt(quote.toTokenAmount), 18)}`);


      const txDataRes = await api.dex.crossChain.build_tx(params);
      const txRes = Array.isArray(txDataRes) ? txDataRes[0] : txDataRes;

      if (!txRes) throw new Error('No tx data received');

      setLog('发送交易...');
      const txData = txRes.tx;
      const hash = await sendTransaction({
        address: txData.to as `0x${string}`,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value),
      });
      setLog(`成功: ${hash}`);
    } catch (e: any) {
      setLog(`失败: ${e.message}`);
    }
  };

  if (isSolBridge) {
    return (
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>SOLANA PORTAL BRIDGE</Text>
            <Text strong>通过 Portal Bridge 发送 SOL</Text>
            <Text type="secondary">向 Wormhole Portal Bridge 地址转账 SOL，并在 Memo 中写入目标链地址或备注。</Text>
          </Space>

          <Input placeholder="Portal Bridge 地址" value={bridgeSolAddress} onChange={(e) => setBridgeSolAddress(e.target.value)} />
          <Input placeholder="目标 EVM 地址（写入 Memo）" value={targetEvmAddress} onChange={(e) => setTargetEvmAddress(e.target.value)} />
          <Input placeholder="发送 SOL 数量" value={solAmount} onChange={(e) => setSolAmount(e.target.value)} />
          <Input placeholder="Memo（可选）" value={solMemo} onChange={(e) => setSolMemo(e.target.value)} />

          <Button type="primary" loading={solLoading} onClick={handleSolBridge}>
            发送 Sol → EVM 桥
          </Button>

          <Text type="secondary">提示：完成 Sol→Bridge 后，请前往 Portal Bridge 官方界面领取到目标链地址。</Text>

          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>日志</Text>
            <Input.TextArea value={solLog} rows={4} readOnly placeholder="尚未开始" />
          </Space>
        </Space>
      </Card>
    );
  }

  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>OKX CROSS-CHAIN</Text>
          <Text strong>OKX 跨链桥</Text>
          <Text type="secondary">调用官方 API，动态获取最优路由并构建交易。</Text>
        </Space>

        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="horizontal" size="large" style={{ width: '100%' }} wrap>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>来源链</Text>
              <Select
                style={{ minWidth: 200 }}
                value={form.fromChainId}
                options={CHAIN_OPTIONS}
                disabled={isSolBridge}
                onChange={(value: string) => {
                  if (isSolBridge) return;
                  setForm(prev => ({ ...prev, fromChainId: value }));
                }}
              />
            </Space>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>目标链</Text>
              <Select
                style={{ minWidth: 200 }}
                value={form.toChainId}
                options={CHAIN_OPTIONS}
                disabled={isSolBridge}
                onChange={(value: string) => {
                  if (isSolBridge) return;
                  setForm(prev => ({ ...prev, toChainId: value }));
                }}
              />
            </Space>
          </Space>

          <Space direction="horizontal" size="large" style={{ width: '100%' }} wrap>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>数量</Text>
              <Input value={amount} onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)} placeholder="发送数量" />
            </Space>
            <Space direction="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>Token Decimals</Text>
              <Input value={form.decimals} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, decimals: e.target.value }))} />
            </Space>
          </Space>

          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>选择代币</Text>
            <Select
              value={selectedToken}
              onChange={handleTokenChange}
              options={tokenOptions.map(token => ({ label: `${token.symbol} (${token.fromChainId}→${token.toChainId})`, value: token.id }))}
            />
          </Space>
        </Space>

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>来源 Token 合约</Text>
          <Input value={form.tokenContractAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, tokenContractAddress: e.target.value }))} />
        </Space>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>目标 Token 合约</Text>
          <Input value={form.toTokenContractAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, toTokenContractAddress: e.target.value }))} />
        </Space>

        <Card size="small" bordered>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
              <Space direction="vertical" size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>Route</Text>
                <Text>{currentRoute}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  地址：{activeEvmAddress ? `${activeEvmAddress.slice(0, 6)}...${activeEvmAddress.slice(-4)}` : '未连接'}
                </Text>
              </Space>
              <Tag color={okxConfig.apiKey ? 'green' : 'red'}>
                {okxConfig.apiKey ? 'Env 已配置' : '缺少 env'}
              </Tag>
            </Space>
            {['获取报价', '构建交易', '广播确认'].map((step, idx) => (
              <Card key={step} size="small" style={{ borderColor: '#eef2ff' }}>
                <Space>
                  <Tag color="green">{idx + 1}</Tag>
                  <Text>{step}</Text>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>

        <Button type="primary" onClick={runBridge}>执行跨链</Button>

        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>执行日志</Text>
          <Input.TextArea value={log} readOnly placeholder="尚未开始" rows={4} />
        </Space>
      </Space>
    </Card>
  );
}
