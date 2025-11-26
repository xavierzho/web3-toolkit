import { Card, Space, Typography, Tag, Button, Input, Table, message } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import { useMemo, useState, type ChangeEvent } from 'react';
import { parseEther, parseUnits, isAddress } from 'viem';
import { useAccount } from 'wagmi';
import { useUnifiedSender } from '../hooks/useUnifiedSender';
import { BATCH_TRANSFER_ABI, ERC20_ABI, CONTRACT_ADDRESSES } from '../constants/abis';

const { Text } = Typography;

type ParsedRecipient = {
  index: number;
  address: string;
  amount: string;
  valid: boolean;
  reason: string;
};

const CHAIN_LABELS: Record<number, string> = {
  1: 'Ethereum Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  42161: 'Arbitrum',
  10: 'Optimism',
  43114: 'Avalanche',
  8453: 'Base',
};

export default function EvmBatchSender() {
  const { chainId } = useAccount();
  const currentChainId = chainId || 1;
  const { sendTransaction } = useUnifiedSender(currentChainId);

  const [mode, setMode] = useState<'ETH' | 'ERC20'>('ETH');
  const [tokenAddr, setTokenAddr] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState('18');
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  const parsedRows = useMemo<ParsedRecipient[]>(() => {
    if (!text.trim()) return [];
    const rows: ParsedRecipient[] = [];
    text.split('\n').forEach((line, index) => {
      const [addr, amount] = line.split(/[,\s]+/).filter(Boolean);
      if (!addr && !amount) return;
      if (!addr || !isAddress(addr)) {
        rows.push({ index, address: addr || '', amount: amount || '', valid: false, reason: '地址无效' });
        return;
      }
      if (!amount || isNaN(Number(amount))) {
        rows.push({ index, address: addr, amount: amount || '', valid: false, reason: '金额错误' });
        return;
      }
      rows.push({ index, address: addr, amount, valid: true, reason: '' });
    });
    return rows;
  }, [text]);

  const summary = useMemo(() => {
    const valid = parsedRows.filter(row => row.valid);
    const total = valid.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    return { validCount: valid.length, totalAmount: total };
  }, [parsedRows]);

  const handleSend = async () => {
    try {
      const contractAddr = CONTRACT_ADDRESSES[currentChainId];
      if (!contractAddr) {
        message.error(`未配置链 ID ${currentChainId} 的合约地址`);
        return;
      }
      if (!parsedRows.length) {
        setStatus('输入为空');
        return;
      }
      const validRows = parsedRows.filter(row => row.valid);
      if (!validRows.length) {
        setStatus('暂无有效记录，请检查格式');
        return;
      }
      if (mode === 'ERC20' && !isAddress(tokenAddr)) {
        setStatus('Token 地址无效');
        return;
      }
      const recipients = validRows.map(row => row.address as `0x${string}`);
      const values = validRows.map(row => row.amount);
      if (mode === 'ETH') {
        const weiVals = values.map(v => parseEther(v));
        const total = weiVals.reduce((a, b) => a + b, 0n);
        setStatus('Tx 1/1: Sending Native ...');
        await sendTransaction({
          address: contractAddr,
          abi: BATCH_TRANSFER_ABI,
          functionName: 'disperseEther',
          args: [recipients, weiVals],
          value: total,
        });
      } else {
        const decimals = Number(tokenDecimals) || 18;
        const bnVals = values.map(v => parseUnits(v, decimals));
        const total = bnVals.reduce((a, b) => a + b, 0n);
        setStatus('Tx 1/2: Approving ...');
        await sendTransaction({
          address: tokenAddr as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [contractAddr, total],
        });
        setStatus('Tx 2/2: Dispersing ...');
        await sendTransaction({
          address: contractAddr,
          abi: BATCH_TRANSFER_ABI,
          functionName: 'disperseToken',
          args: [tokenAddr, recipients, bnVals],
        });
      }
      setStatus('✅ 完成');
    } catch (e: any) {
      setStatus(`❌ 错误: ${e.message ?? '执行失败'}`);
    }
  };

  const tableData = parsedRows.slice(0, 50).map(row => ({
    key: row.index,
    index: row.index + 1,
    address: row.address,
    amount: row.amount,
    status: row.valid ? 'success' : row.reason,
  }));

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>EVM BATCH DISPATCH</Text>
            <Text strong>批量转账（Native & ERC20）</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>粘贴地址清单后即时校验，自动统计预计总额。</Text>
          </Space>
          <Space wrap>
            <Tag color="blue">当前链：{CHAIN_LABELS[currentChainId] || `Chain ${currentChainId}`}</Tag>
            <Tag color={CONTRACT_ADDRESSES[currentChainId] ? 'green' : 'red'}>
              合约：{CONTRACT_ADDRESSES[currentChainId] ? '已配置' : '未配置'}
            </Tag>
          </Space>
          <Space>
            <Button type={mode === 'ETH' ? 'primary' : 'default'} onClick={() => setMode('ETH')}>Native</Button>
            <Button type={mode === 'ERC20' ? 'primary' : 'default'} onClick={() => setMode('ERC20')}>ERC20</Button>
          </Space>
          {mode === 'ERC20' && (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Input placeholder="Token Address" value={tokenAddr} onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenAddr(e.target.value)} />
              <Input placeholder="Decimals" value={tokenDecimals} onChange={(e: ChangeEvent<HTMLInputElement>) => setTokenDecimals(e.target.value)} />
            </Space>
          )}
          <TextArea
            rows={6}
            placeholder="0xabc..., 0.5"
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          />
          <Space>
            <Button onClick={() => setText(['0x1A2b3C4d5E6F7081928374655647382910111213, 0.25', '0xb794F5eA0ba39494cE839613fffBA74279579268, 1.5'].join('\n'))}>填充示例</Button>
            <Button onClick={() => { setText(''); setStatus(''); }}>清空</Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              有效地址 {summary.validCount} 个 · 预计总额 {summary.totalAmount} {mode === 'ETH' ? 'Native' : 'Token'}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{status}</Text>
          </Space>
          <Table
            size="small"
            pagination={false}
            dataSource={tableData}
            columns={[
              { title: '#', dataIndex: 'index', width: 60 },
              { title: 'Address', dataIndex: 'address', render: (value: string) => <Text code>{value}</Text> },
              { title: 'Amount', dataIndex: 'amount', align: 'right' },
              {
                title: '状态',
                dataIndex: 'status',
                align: 'right',
                render: (value: string) => value === 'success' ? <Tag color="green">✓</Tag> : <Tag color="red">{value}</Tag>,
              },
            ]}
            scroll={{ y: 240 }}
          />
          <Button type="primary" onClick={handleSend}>执行批量发送</Button>
        </Space>
      </Card>
    </Space>
  );
}
