import { Card, Space, Typography, Button, Table, Tag } from 'antd';
import TextArea from 'antd/es/input/TextArea';
import { useMemo, useState, type ChangeEvent } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { useWalletStore } from '../store/walletStore';

const { Text } = Typography;

const chunk = <T,>(arr: T[], size: number) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

type ParsedSolRow = {
  index: number;
  address: string;
  lamports: number;
  amount: string;
  valid: boolean;
  reason: string;
};

export default function SolBatchSender() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { mode, solAccount } = useWalletStore();
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');

  const parsedRows = useMemo<ParsedSolRow[]>(() => {
    if (!text.trim()) return [];
    const rows: ParsedSolRow[] = [];
    text.split('\n').forEach((line, index) => {
      const [addr, amount] = line.split(/[,\s]+/).filter(Boolean);
      if (!addr && !amount) return;
      try {
        const pk = new PublicKey(addr);
        const floatAmount = Number(amount);
        if (!amount || isNaN(floatAmount)) {
          rows.push({ index, address: addr ?? '', lamports: 0, amount: amount || '', valid: false, reason: '金额错误' });
          return;
        }
        rows.push({ index, address: pk.toBase58(), lamports: Math.floor(floatAmount * LAMPORTS_PER_SOL), amount, valid: true, reason: '' });
      } catch {
        rows.push({ index, address: addr || '', lamports: 0, amount: amount || '', valid: false, reason: '地址无效' });
      }
    });
    return rows;
  }, [text]);

  const summary = useMemo(() => {
    const valid = parsedRows.filter(row => row.valid);
    const totalLamports = valid.reduce((acc, row) => acc + row.lamports, 0);
    return {
      totalRecipients: valid.length,
      totalSol: totalLamports / LAMPORTS_PER_SOL,
    };
  }, [parsedRows]);

  const handleSend = async () => {
    const sender = mode === 'LOCAL' ? solAccount?.publicKey : publicKey;
    if (!sender) {
      alert('无 Solana 账户');
      return;
    }
    try {
      const validRows = parsedRows.filter(row => row.valid);
      if (!validRows.length) {
        setStatus('没有可执行的记录');
        return;
      }
      const items = validRows.map(r => ({ pubkey: new PublicKey(r.address), lamports: r.lamports }));
      const batches = chunk(items, 12);
      for (let i = 0; i < batches.length; i++) {
        setStatus(`处理批次 ${i + 1}/${batches.length}...`);
        const tx = new Transaction();
        batches[i].forEach(item => {
          tx.add(SystemProgram.transfer({ fromPubkey: sender, toPubkey: item.pubkey, lamports: item.lamports }));
        });
        if (mode === 'LOCAL' && solAccount) {
          await sendAndConfirmTransaction(connection, tx, [solAccount]);
        } else {
          const sig = await sendTransaction(tx, connection);
          await connection.confirmTransaction(sig, 'confirmed');
        }
      }
      setStatus('✅ Solana 批量发送完成');
    } catch (e: any) {
      setStatus(`❌ Error: ${e.message ?? '执行失败'}`);
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
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space orientation="vertical" size={4}>
            <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>SOLANA NATIVE</Text>
            <Text strong>SOL 批量转账</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>自动拆分每批 12 条指令以内，实时显示执行进度。</Text>
          </Space>
          <TextArea
            rows={6}
            placeholder="SolAddress, Amount"
            value={text}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value)}
          />
          <Space>
            <Button onClick={() => setText([
              '3GeqAn9SAcY6yBCaUe1wvPhgU5DERwHp6LX4Z45gL6hE, 0.2',
              '9b7UoTEsp9wbj7Z1khxJZWJMPZQShoCZ9KnXFw6exjYf 0.15',
            ].join('\n'))}
            >
              填充示例
            </Button>
            <Button onClick={() => { setText(''); setStatus(''); }}>清空</Button>
          </Space>
        </Space>
      </Card>

      <Card>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Space orientation="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              有效地址 {summary.totalRecipients} 个 · 合计约 {summary.totalSol.toFixed(4)} SOL
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
          <Button type="primary" onClick={handleSend}>执行 SOL 批量</Button>
        </Space>
      </Card>
    </Space>
  );
}
