import { useMemo, useState, type ChangeEvent, useEffect } from 'react';
import {
  Card,
  Space,
  Typography,
  Button,
  Input,
  Switch,
  Tag,
  Table,
  App,
  Steps,
} from 'antd';
import TextArea from 'antd/es/input/TextArea';
import { createPublicClient, http, isAddress, parseUnits, formatUnits } from 'viem';
import { erc20Abi } from 'viem';
import { bsc, bscTestnet, mainnet, sepolia } from 'viem/chains';
import { useAccount, usePublicClient } from 'wagmi';
import { useUnifiedSender } from '../hooks/useUnifiedSender';
import { abi as airdropAbi, bytecode as airdropByteCode } from '../utils/airdrop'
const { Text } = Typography;

type ParsedRow = {
  key: number;
  address: string;
  amount: string;
  valid: boolean;
  reason?: string;
  balance?: string;
};


import { useWalletStore } from '../store/walletStore';

export default function AirdropPage() {
  const { message } = App.useApp();
  const { chainId, rpcUrl } = useWalletStore();

  const [rawInput, setRawInput] = useState('0x0eef63f2079e856476c290bd596318f8aef44a93');
  const [hasHeader, setHasHeader] = useState(true);
  const [autoCheckBalance, setAutoCheckBalance] = useState(false);
  // Removed local rpc and chainIdInput state

  const [tokenAddress, setTokenAddress] = useState('0x957AC971ac3063A8AB0029257CcfFD5CFFF97a8a');
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [airdropContract, setAirdropContract] = useState('0xe54636a039e2E1AbD8dDB73373b4e168449389Bb');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [loading, setLoading] = useState(false);

  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: (Number(chainId) || 56) as any });
  const { sendTransaction, deployContract } = useUnifiedSender(); // Uses global state by default
  const [deploying, setDeploying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // 自动推进步骤
  useEffect(() => {
    if (currentStep === 0 && rawInput.trim()) {
      // 有输入内容，可以进入解析步骤
    }
    if (currentStep === 1 && rows.length > 0 && rows.some(r => r.valid)) {
      // 已解析且有有效地址，可以部署或充值
    }
    if (currentStep === 2 && airdropContract && isAddress(airdropContract)) {
      // 已有合约地址，可以充值
      if (currentStep < 3) setCurrentStep(3);
    }
  }, [rawInput, rows, airdropContract, currentStep]);

  const handleDeploy = async () => {
    if (!publicClient) {
      message.error('Public Client not found');
      return;
    }
    try {
      setDeploying(true);
      const hash = await deployContract({
        abi: airdropAbi,
        bytecode: airdropByteCode as `0x${string}`,
        args: [1000n],
      });
      message.success('部署交易已发送，等待确认...');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.contractAddress) {
        setAirdropContract(receipt.contractAddress);
        message.success('合约已部署: ' + receipt.contractAddress);
      }
    } catch (err: any) {
      message.error(err?.message || '部署失败');
    } finally {
      setDeploying(false);
    }
  };

  const summary = useMemo(() => {
    const valid = rows.filter(r => r.valid);
    const invalid = rows.length - valid.length;
    const unique = new Set(rows.map(r => r.address.toLowerCase())).size;
    return { valid: valid.length, invalid, unique };
  }, [rows]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setRawInput(String(reader.result || ''));
    reader.readAsText(file);
  };

  const parseInput = () => {
    const lines = rawInput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) {
      message.warning('请输入地址数据');
      return;
    }
    const parsed: ParsedRow[] = [];
    lines.forEach((line, idx) => {
      if (idx === 0 && hasHeader && line.toLowerCase().includes('address')) return;
      const [addressStr, amountStr] = line.split(/[,\s]+/).filter(Boolean);
      if (!addressStr || !isAddress(addressStr)) {
        parsed.push({ key: parsed.length + 1, address: addressStr || line, amount: amountStr || '0', valid: false, reason: '地址无效' });
        return;
      }
      parsed.push({
        key: parsed.length + 1,
        address: addressStr as `0x${string}`,
        amount: amountStr || '0',
        valid: true,
      });
    });
    setRows(parsed);
    if (autoCheckBalance) fetchBalances(parsed);
  };

  const fetchBalances = async (targetRows = rows) => {
    if (!tokenAddress || !isAddress(tokenAddress)) {
      message.warning('请先填写代币地址');
      return;
    }
    try {
      setLoading(true);
      const chain = [bsc, bscTestnet, mainnet, sepolia].find(c => c.id === chainId) || bscTestnet;
      const client = createPublicClient({
        chain,
        transport: http(rpcUrl)
      });
      let decimals = tokenDecimals;
      try {
        const tokenDec = await client.readContract({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'decimals',
        });
        decimals = Number(tokenDec);
        setTokenDecimals(decimals);
      } catch (e) {
        console.warn('Fetch decimals failed', e);
      }
      const contracts = targetRows
        .filter(row => row.valid)
        .map(row => ({
          address: tokenAddress as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [row.address as `0x${string}`],
        }));

      const results = await client.multicall({ contracts });

      let resultIndex = 0;
      const updated = targetRows.map(row => {
        if (!row.valid) return row;
        const result = results[resultIndex++];
        if (result.status === 'success') {
          const bal = result.result as bigint;
          return { ...row, balance: formatUnits(bal, decimals) };
        } else {
          return { ...row, balance: '查询失败' };
        }
      });
      setRows(updated);
    } finally {
      setLoading(false);
    }
  };

  const dedupe = () => {
    const map = new Map<string, ParsedRow>();
    rows.forEach(row => {
      const key = row.address.toLowerCase();
      if (!map.has(key)) map.set(key, row);
    });
    setRows(Array.from(map.values()).map((row, idx) => ({ ...row, key: idx + 1 })));
  };

  const fillEqualAmounts = () => {
    const value = prompt('请输入每个地址分配的数量', '1');
    if (!value) return;
    setRows(rows.map(row => ({ ...row, amount: value })));
  };

  const updateRowAmount = (index: number, amount: string) => {
    setRows(prev => prev.map((row, idx) => (idx === index ? { ...row, amount } : row)));
  };

  const exportCsv = () => {
    const header = 'address,amount\n';
    const content = rows.map(row => `${row.address},${row.amount}`).join('\n');
    const blob = new Blob([header + content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'airdrop.csv';
    link.click();
  };

  const handleSendBatch = async () => {
    if (!airdropContract || !isAddress(airdropContract)) {
      message.error('请填写空投合约地址');
      return;
    }
    if (!tokenAddress || !isAddress(tokenAddress)) {
      message.error('请填写代币地址');
      return;
    }
    if (!address) {
      message.error('请先连接钱包');
      return;
    }
    try {
      const validRows = rows.filter(r => r.valid);
      if (!validRows.length) {
        message.warning('没有可执行的地址');
        return;
      }
      const amounts = validRows.map(row => parseUnits(row.amount || '0', tokenDecimals));
      await sendTransaction({
        address: airdropContract as `0x${string}`,
        abi: airdropAbi,
        functionName: 'batchAirdrop',
        args: [tokenAddress, validRows.map(r => r.address as `0x${string}`), amounts],
      });
      message.success('批量空投已发送');
    } catch (err: any) {
      message.error(err?.message || '空投失败');
    }
  };

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {/* 步骤指示器 */}
      <Card>
        <Steps
          current={currentStep}
          items={[
            { title: '添加地址', content: '上传或粘贴地址列表' },
            { title: '解析校验', content: '验证地址格式' },
            { title: '部署合约', content: '部署空投合约（可选）' },
            { title: '充值代币', content: '向合约转入代币' },
            { title: '分配数量', content: '设置每个地址的数量' },
            { title: '发起空投', content: '执行批量转账' },
            { title: '提取余额', content: '提取剩余代币（可选）' },
          ]}
        />
      </Card>

      {/* 步骤 1: 添加地址 */}
      <Card title="步骤 1: 添加地址" extra={currentStep === 0 && <Tag color="blue">当前步骤</Tag>}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space align="center" wrap>
            <label>
              <input type="file" accept=".csv,.txt" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
            </label>
            <Button onClick={async () => {
              const text = await navigator.clipboard.readText();
              setRawInput(text);
            }}>
              粘贴
            </Button>
            <Button onClick={() => { setRawInput(''); setRows([]); }}>清空</Button>
          </Space>
          <TextArea
            rows={6}
            placeholder="每行一个地址,amount"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
          />
          <Space wrap>
            <Space>
              <Text type="secondary">包含表头</Text>
              <Switch checked={hasHeader} onChange={setHasHeader} />
            </Space>
            <Space>
              <Text type="secondary">解析后自动查余额</Text>
              <Switch checked={autoCheckBalance} onChange={setAutoCheckBalance} />
            </Space>
          </Space>
        </Space>
      </Card>

      {/* 步骤 2: 解析校验 */}
      <Card
        title="步骤 2: 解析并校验地址"
        extra={currentStep === 1 && <Tag color="blue">当前步骤</Tag>}
      >
        <Space>
          <Button
            type="primary"
            onClick={() => { parseInput(); setCurrentStep(1); }}
            loading={loading}
            disabled={!rawInput.trim()}
          >
            解析并校验
          </Button>
          <Button disabled={!rows.length} loading={loading} onClick={() => fetchBalances()}>
            查询余额
          </Button>
          <Button disabled={!rows.length} onClick={exportCsv}>导出 CSV</Button>
        </Space>
      </Card>

      {/* 步骤 3: 部署合约 */}
      <Card
        title="步骤 3: 部署空投合约（可选）"
        extra={currentStep === 2 && <Tag color="blue">当前步骤</Tag>}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Text type="secondary">如果已有合约地址，可以跳过此步骤，直接在下方输入合约地址</Text>
          <Space>
            <Button type="primary" onClick={handleDeploy} loading={deploying}>
              部署合约
            </Button>
            <Text type="secondary">或</Text>
            <Input
              style={{ width: 400 }}
              placeholder="输入已部署的合约地址"
              value={airdropContract}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAirdropContract(e.target.value)}
            />
            <Button onClick={() => setCurrentStep(3)}>跳过此步骤</Button>
          </Space>
        </Space>
      </Card>



      {/* 数据预览 - 显示在步骤2之后 */}
      {rows.length > 0 && (
        <Card title="地址列表预览">
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <Space wrap>
              <Tag color="blue">共 {rows.length}</Tag>
              <Tag color="green">有效 {summary.valid}</Tag>
              <Tag color="red">无效 {summary.invalid}</Tag>
              <Tag>去重后 {summary.unique}</Tag>
            </Space>
            <Table
              dataSource={rows}
              columns={[
                { title: '#', dataIndex: 'key', width: 60 },
                { title: '地址', dataIndex: 'address', render: (value: string) => <Text code>{value}</Text> },
                {
                  title: '数量',
                  dataIndex: 'amount',
                  render: (_: string, row: ParsedRow, rowIndex: number) => (
                    <Input
                      size="small"
                      value={row.amount}
                      onChange={(e) => updateRowAmount(rowIndex, e.target.value)}
                      style={{ width: 120 }}
                    />
                  ),
                },
                {
                  title: '状态',
                  dataIndex: 'valid',
                  render: (_: boolean, row: ParsedRow) => (
                    <Tag color={row.valid ? 'green' : 'red'}>{row.valid ? '有效' : row.reason || '无效'}</Tag>
                  ),
                },
                { title: '余额', dataIndex: 'balance', render: (value?: string) => value || '-' },
              ]}
              pagination={false}
              rowKey="key"
              scroll={{ y: 360 }}
            />
          </Space>
        </Card>
      )}

      {/* 步骤 4: 充值代币 */}
      {rows.length > 0 && (
        <Card
          title="步骤 4: 充值代币到合约"
          extra={currentStep === 3 && <Tag color="blue">当前步骤</Tag>}
        >
          <Space orientation="vertical" style={{ width: '100%' }}>
            <Input
              placeholder="代币地址"
              value={tokenAddress}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenAddress(e.target.value)}
            />
            <Text type="secondary">确保合约有足够的代币余额以完成空投</Text>
            <Button
              type="primary"
              disabled={!airdropContract || !tokenAddress || !isAddress(airdropContract) || !isAddress(tokenAddress)}
              onClick={async () => {
                const val = prompt('请输入充值数量');
                if (!val || isNaN(Number(val))) return;
                try {
                  const amount = parseUnits(val, tokenDecimals);
                  await sendTransaction({
                    address: tokenAddress as `0x${string}`,
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [airdropContract as `0x${string}`, amount],
                  });
                  message.success('充值交易已发送');
                  setCurrentStep(4);
                } catch (e: any) {
                  message.error(e.message || '充值失败');
                }
              }}
            >
              充值代币
            </Button>
          </Space>
        </Card>
      )}

      {/* 步骤 5: 分配数量 */}
      {rows.length > 0 && (
        <Card
          title="步骤 5: 分配空投数量"
          extra={currentStep === 4 && <Tag color="blue">当前步骤</Tag>}
        >
          <Space>
            <Button onClick={dedupe}>去重地址</Button>
            <Button onClick={fillEqualAmounts}>平均分配</Button>
            <Button
              type="primary"
              disabled={!rows.some(r => r.valid && Number(r.amount) > 0)}
              onClick={() => setCurrentStep(5)}
            >
              确认分配
            </Button>
          </Space>
        </Card>
      )}

      {/* 步骤 6: 发起空投 */}
      {rows.length > 0 && (
        <Card
          title="步骤 6: 执行批量空投"
          extra={currentStep === 5 && <Tag color="blue">当前步骤</Tag>}
        >
          <Space orientation="vertical">
            <Text type="secondary">
              即将向 {rows.filter(r => r.valid).length} 个地址发送代币
            </Text>
            <Button
              type="primary"
              size="large"
              disabled={!rows.some(r => r.valid)}
              onClick={async () => {
                await handleSendBatch();
                setCurrentStep(6);
              }}
            >
              发起批量空投
            </Button>
          </Space>
        </Card>
      )}

      {/* 步骤 7: 提取余额 */}
      {rows.length > 0 && currentStep >= 6 && (
        <Card
          title="步骤 7: 提取剩余代币（可选）"
          extra={currentStep === 6 && <Tag color="green">已完成</Tag>}
        >
          <Space>
            <Text type="secondary">空投完成后，可以提取合约中的剩余代币</Text>
            <Button
              onClick={async () => {
                try {
                  if (!airdropContract || !tokenAddress || !address) {
                    message.error('请先配置合约地址和代币地址');
                    return;
                  }

                  // 查询合约余额
                  const chain = [bsc, bscTestnet, mainnet, sepolia].find(c => c.id === chainId) || bscTestnet;
                  const client = createPublicClient({
                    chain,
                    transport: http(rpcUrl)
                  });

                  const balance = await client.readContract({
                    address: tokenAddress as `0x${string}`,
                    abi: erc20Abi,
                    functionName: 'balanceOf',
                    args: [airdropContract as `0x${string}`],
                  }) as bigint;

                  if (balance === 0n) {
                    message.warning('合约中没有剩余代币');
                    return;
                  }

                  await sendTransaction({
                    address: airdropContract as `0x${string}`,
                    abi: airdropAbi,
                    functionName: 'recoverERC20',
                    args: [tokenAddress as `0x${string}`, address, balance],
                  });
                  message.success(`提取交易已发送，数量: ${formatUnits(balance, tokenDecimals)}`);
                } catch (e: any) {
                  message.error(e.message || '提取失败');
                }
              }}
            >
              提取全部剩余代币
            </Button>
          </Space>
        </Card>
      )}
    </Space>
  );
}
