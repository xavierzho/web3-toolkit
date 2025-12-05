import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Card, Space, Typography, Button, Input, Divider, Tag, Select, Table, App, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { privateKeyToAccount } from 'viem/accounts';
import { useWalletStore, type WalletMode } from '../store/walletStore';

const { Text } = Typography;

const NETWORK_OPTIONS = [
  { value: 1, label: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
  { value: 56, label: 'BSC', rpc: 'https://bsc-dataseed.binance.org' },
  { value: 97, label: 'BSC Testnet', rpc: 'https://data-seed-prebsc-1-s1.binance.org:8545' },
  { value: 137, label: 'Polygon', rpc: 'https://polygon-rpc.com' },
  { value: 42161, label: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc' },
  { value: 10, label: 'Optimism', rpc: 'https://mainnet.optimism.io' },
  { value: 8453, label: 'Base', rpc: 'https://mainnet.base.org' },
];

// 页面钱包配置：定义特定页面支持的模式
const PAGE_WALLET_CONFIG: Record<string, { allowedModes?: WalletMode[], defaultMode?: WalletMode }> = {
  '/multi-trade': { defaultMode: 'LOCAL', allowedModes: ['LOCAL'] },
};

export default function WalletManager({ currentPath }: { currentPath?: string }) {
  const { address } = useAccount();
  const {
    mode,
    activeEvmAddress,
    activeSolAddress,
    evmAccount,
    solAccount,
    setMode,
    setEvmAccount,
    setSolAccount,
    setExternalEvmAddress,
    disconnectLocal,
    chainId,
    rpcUrl,
    setChainId,
    setRpcUrl,
    mnemonic,
    derivedAccounts,
    importMnemonic,
    generateAccounts,
    deleteAccount,
  } = useWalletStore();
  const { message } = App.useApp();

  const [input, setInput] = useState('');
  const [inputType, setInputType] = useState<'privateKey' | 'mnemonic'>('privateKey');
  const [showPrivateKeys, setShowPrivateKeys] = useState(false);

  const shortenedEvm = useMemo(
    () => (activeEvmAddress ? `${activeEvmAddress.slice(0, 6)}...${activeEvmAddress.slice(-4)}` : '待连接'),
    [activeEvmAddress]
  );
  const shortenedSol = useMemo(
    () => (activeSolAddress ? `${activeSolAddress.slice(0, 4)}...${activeSolAddress.slice(-4)}` : '待连接'),
    [activeSolAddress]
  );
  // 修复：只在 LOCAL 模式下检查本地账户，而不是检查 activeEvmAddress（可能来自外部钱包）
  const showLocalStatus = mode === 'LOCAL' && Boolean(evmAccount || solAccount);

  // 获取当前页面的配置
  const pageConfig = currentPath ? PAGE_WALLET_CONFIG[currentPath] : undefined;
  const isExternalDisabled = pageConfig?.allowedModes && !pageConfig.allowedModes.includes('EXTERNAL');
  const isLocalDisabled = pageConfig?.allowedModes && !pageConfig.allowedModes.includes('LOCAL');

  // 当页面切换时，应用默认模式
  useEffect(() => {
    if (pageConfig?.defaultMode && mode !== pageConfig.defaultMode) {
      setMode(pageConfig.defaultMode);
    }
  }, [pageConfig, mode, setMode]);

  useEffect(() => {
    if (mode === 'EXTERNAL') setExternalEvmAddress(address);
  }, [address, mode, setExternalEvmAddress]);

  const handleImport = () => {
    try {
      const val = input.trim();
      if (!val) return;

      // 助记词：同时导入 EVM 和 Solana
      if (val.split(' ').length === 12) {
        importMnemonic(val);
        alert('✅ 已从助记词导入 EVM 和 Solana 账户');
      }
      // EVM 私钥
      else if (val.startsWith('0x')) {
        const acc = privateKeyToAccount(val as `0x${string}`);
        setEvmAccount(acc);
      }
      // Solana 私钥 (Base58 或 JSON 数组格式)
      else {
        setSolAccount(val);
      }

      setInput('');
    } catch (err: any) {
      alert('导入失败：' + (err.message || '请检查私钥/助记词格式'));
    }
  };

  return (
    <Card>
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Space orientation="vertical" size={4}>
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>WALLET CONTROL</Text>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <Text strong>账户联控</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>统一调度 EVM 与 Solana，兼容外部钱包与本地私钥。</Text>
            </div>
            <Tag color="blue">{mode === 'EXTERNAL' ? '外部钱包' : '本地私钥'}</Tag>
          </div>
        </Space>

        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>NETWORK</Text>
          <Space.Compact style={{ width: '100%' }}>
            <Select
              style={{ width: '40%' }}
              value={chainId}
              onChange={(val) => {
                setChainId(val);
                // Update RPC based on selection
                const rpc = NETWORK_OPTIONS.find(n => n.value === val)?.rpc;
                if (rpc) setRpcUrl(rpc);
              }}
              options={NETWORK_OPTIONS}
            />
            <Input
              style={{ width: '60%' }}
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value)}
              placeholder="RPC URL"
            />
          </Space.Compact>
        </Space>

        <Space>
          <Button
            type={mode === 'EXTERNAL' ? 'primary' : 'default'}
            onClick={() => setMode('EXTERNAL')}
            disabled={isExternalDisabled}
          >
            连接钱包
          </Button>
          <Button
            type={mode === 'LOCAL' ? 'primary' : 'default'}
            onClick={() => setMode('LOCAL')}
            disabled={isLocalDisabled}
          >
            本地私钥
          </Button>
        </Space>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>EVM</Text>
            <div style={{ fontWeight: 500, marginTop: 4 }}>{shortenedEvm}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === 'EXTERNAL' ? 'RainbowKit ConnectButton' : '已导入私钥'}
            </Text>
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Solana</Text>
            <div style={{ fontWeight: 500, marginTop: 4 }}>{shortenedSol}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {mode === 'EXTERNAL' ? 'Phantom / Solflare' : '本地 Keypair'}
            </Text>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {mode === 'EXTERNAL' ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>EVM 钱包 (支持 MetaMask, OKX, Binance, Bitget 等)</Text>
              <div style={{ marginTop: 8 }}>
                <ConnectButton />
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>Solana 钱包 (支持 Phantom, OKX, Binance, Bitget 等)</Text>
              <div style={{ marginTop: 8 }}>
                <WalletMultiButton style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
              </div>
            </div>
          </Space>
        ) : (
          <Space orientation="vertical" size="small" style={{ width: '100%' }}>
            {showLocalStatus ? (
              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                {activeEvmAddress && <Text code>EVM: {activeEvmAddress}</Text>}
                {activeSolAddress && <Text code>SOL: {activeSolAddress}</Text>}

                {mnemonic && (
                  <div style={{ marginTop: 12 }}>
                    <Divider style={{ margin: '12px 0' }}>批量账户 (Mnemonic)</Divider>
                    <Space style={{ marginBottom: 8 }}>
                      <Button size="small" onClick={() => generateAccounts(5)}>+5 账户</Button>
                      <Button size="small" onClick={() => generateAccounts(10)}>+10 账户</Button>
                      <Button size="small" danger onClick={() => setShowPrivateKeys(!showPrivateKeys)}>
                        {showPrivateKeys ? '隐藏私钥' : '导出私钥'}
                      </Button>
                    </Space>

                    <Table
                      dataSource={derivedAccounts}
                      rowKey="index"
                      size="small"
                      pagination={{ pageSize: 5 }}
                      scroll={{ x: true }}
                      columns={[
                        { title: '#', dataIndex: 'index', width: 50 },
                        {
                          title: 'EVM Address',
                          dataIndex: 'evmAddress',
                          render: (t) => <Text copyable={{ text: t }} ellipsis style={{ maxWidth: 100 }}>{t}</Text>
                        },
                        {
                          title: 'SOL Address',
                          dataIndex: 'solAddress',
                          render: (t) => <Text copyable={{ text: t }} ellipsis style={{ maxWidth: 100 }}>{t}</Text>
                        },
                        ...(showPrivateKeys ? [
                          {
                            title: 'EVM Key',
                            dataIndex: 'evmPrivateKey',
                            render: () => {
                              // Re-derive for display if needed, or use stored if we decide to store it
                              // For security, we might not want to store it in state permanently, 
                              // but for this tool it's acceptable as it's a dev tool.
                              // However, our store implementation currently sets 'Hidden'.
                              // Let's just show a placeholder or re-derive on the fly if we really want to export.
                              // Since we set 'Hidden' in store, we can't show it here directly without re-derivation.
                              // For now, let's just show the placeholder.
                              return <Text type="secondary">Hidden</Text>
                            }
                          }
                        ] : []),
                        {
                          title: '操作',
                          key: 'action',
                          width: 80,
                          render: (_, record) => (
                            <Popconfirm
                              title="确定删除此账户？"
                              description="删除后将无法恢复，请确保已备份私钥"
                              onConfirm={() => {
                                deleteAccount(record.index);
                                message.success('账户已删除');
                              }}
                              okText="确定"
                              cancelText="取消"
                            >
                              <Button type="link" danger size="small" icon={<DeleteOutlined />} />
                            </Popconfirm>
                          )
                        }
                      ]}
                    />
                    {showPrivateKeys && (
                      <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                        <Text type="warning" style={{ fontSize: 12 }}>
                          注意：为了安全，私钥未直接存储在状态中。如需导出所有私钥，请复制助记词到其他钱包恢复。
                          <br />
                          当前助记词: <Text code copyable>{mnemonic}</Text>
                        </Text>
                      </div>
                    )}
                  </div>
                )}

                <Button type="link" danger onClick={disconnectLocal} style={{ padding: 0, marginTop: 8 }}>
                  清除账户
                </Button>
              </Space>
            ) : (
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <Space>
                  <Button
                    type={inputType === 'privateKey' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => { setInputType('privateKey'); setInput(''); }}
                  >
                    私钥
                  </Button>
                  <Button
                    type={inputType === 'mnemonic' ? 'primary' : 'default'}
                    size="small"
                    onClick={() => { setInputType('mnemonic'); setInput(''); }}
                  >
                    助记词
                  </Button>
                </Space>
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder={inputType === 'mnemonic' ? "输入12个单词的助记词，用空格分隔" : "私钥 (0x...) 或 Solana Base58"}
                    value={input}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                  />
                  <Button type="primary" onClick={handleImport}>导入</Button>
                </Space.Compact>
              </Space>
            )}
            <Text type="danger" style={{ fontSize: 12 }}>⚠️ 私钥仅临时保存在浏览器内存，刷新即清空。</Text>
          </Space>
        )}
      </Space>
    </Card>
  );
}
