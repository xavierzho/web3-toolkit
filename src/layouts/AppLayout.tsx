import { Button, Card, Col, Row, Space, Typography, Tag, App } from 'antd';
import WalletManager from '../components/WalletManager';
import EvmBatchPage from '../pages/EvmBatchPage';
import Home from '../pages/Home';
import NotFound from '../pages/NotFound';
import OkxBridgePage from '../pages/OkxBridgePage';
import SolBatchPage from '../pages/SolBatchPage';
import AirdropPage from '../pages/AirdropPage';
import MultiTradePage from '../pages/MultiTradePage';
import { RouteView, useRouter, type RouteObject } from '../router';

const { Title, Text } = Typography;

const routes: RouteObject[] = [
  { path: '/', element: <Home /> },
  { path: '/evm-batch', element: <EvmBatchPage /> },
  { path: '/sol-batch', element: <SolBatchPage /> },
  { path: '/okx-bridge', element: <OkxBridgePage /> },
  { path: '/airdrop', element: <AirdropPage /> },
  { path: '/multi-trade', element: <MultiTradePage /> },
  { path: '*', element: <NotFound /> },
];

const navLinks = [
  { path: '/', label: '主页' },
  { path: '/evm-batch', label: 'EVM 批量' },
  { path: '/sol-batch', label: 'Solana 批量' },
  { path: '/okx-bridge', label: 'OKX 跨链' },
  { path: '/airdrop', label: '空投工具' },
  { path: '/multi-trade', label: '多钱包交易' },
];

export default function AppLayout() {
  const { path, navigate } = useRouter();

  return (
    <App>
      <div style={{ background: '#f5f6f8', minHeight: '100vh', padding: '40px 16px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Space direction="vertical" size={24} style={{ width: '100%' }}>
            <Card styles={{ body: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' } }}>
              <Space size={16} align="start">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'linear-gradient(135deg,#3875dc,#6f9bff)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 18,
                  }}
                >
                  W3
                </div>
                <div>
                  <Tag color="blue" style={{ marginBottom: 8 }}>Zzzzz</Tag>
                  <Title level={4} style={{ marginBottom: 4 }}>Omni Toolkit 控制台</Title>
                  <Text type="secondary">多链资产批量操作 · 商业化运营工具集</Text>
                </div>
              </Space>
              <Space wrap style={{ marginLeft: 'auto' }}>
                {navLinks.map(link => (
                  <Button
                    key={link.path}
                    type={path === link.path ? 'primary' : 'default'}
                    onClick={() => navigate(link.path)}
                  >
                    {link.label}
                  </Button>
                ))}
              </Space>
            </Card>

            <Row gutter={[24, 24]}>
              <Col xs={24} lg={16}>
                <RouteView routes={routes} />
              </Col>
              <Col xs={24} lg={8}>
                <WalletManager />
              </Col>
            </Row>
          </Space>
        </div>
      </div>
    </App>
  );
}
