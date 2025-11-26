import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Card, Space, Typography, Button, Input, Divider, Tag } from 'antd';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { useWalletStore } from '../store/walletStore';
import { Keypair } from '@solana/web3.js';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';

const { Text } = Typography;

export default function WalletManager() {
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
    setSolKeypair,
    setExternalEvmAddress,
    disconnectLocal,
  } = useWalletStore();

  const [input, setInput] = useState('');
  const [inputType, setInputType] = useState<'privateKey' | 'mnemonic'>('privateKey');
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

  useEffect(() => {
    if (mode === 'EXTERNAL') setExternalEvmAddress(address);
  }, [address, mode, setExternalEvmAddress]);

  const handleImport = () => {
    try {
      const val = input.trim();
      if (!val) return;

      // 助记词：同时导入 EVM 和 Solana
      if (val.split(' ').length === 12) {
        // 派生 EVM 账户
        const evmAcc = mnemonicToAccount(val);
        setEvmAccount(evmAcc);

        // 派生 Solana 密钥对
        try {
          const seed = mnemonicToSeedSync(val);
          const derivedSeed = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key;
          const solKeypair = Keypair.fromSeed(derivedSeed);
          setSolKeypair(solKeypair);
          alert('✅ 已从助记词导入 EVM 和 Solana 账户');
        } catch (e) {
          console.error('Solana derivation failed:', e);
          alert('✅ 已导入 EVM 账户\n\n⚠️ Solana 派生失败，请单独导入 Solana 私钥');
        }
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
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space direction="vertical" size={4}>
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

        <Space>
          <Button type={mode === 'EXTERNAL' ? 'primary' : 'default'} onClick={() => setMode('EXTERNAL')}>
            连接钱包
          </Button>
          <Button type={mode === 'LOCAL' ? 'primary' : 'default'} onClick={() => setMode('LOCAL')}>
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
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {showLocalStatus ? (
              <Space direction="vertical" size={4}>
                {activeEvmAddress && <Text code>EVM: {activeEvmAddress}</Text>}
                {activeSolAddress && <Text code>SOL: {activeSolAddress}</Text>}
                <Button type="link" danger onClick={disconnectLocal} style={{ padding: 0 }}>
                  清除账户
                </Button>
              </Space>
            ) : (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
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
