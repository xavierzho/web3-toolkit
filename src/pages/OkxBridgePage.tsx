import { Card, Space, Typography, Button } from 'antd';
import OkxBridge from '../components/OkxBridge';
import { useRouter } from '../router';

const { Text, Title } = Typography;

export default function OkxBridgePage() {
  const { navigate } = useRouter();

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size="small">
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>CROSS-CHAIN</Text>
          <Title level={3} style={{ margin: 0 }}>跨链桥</Title>
          <Text type="secondary">
            支持 OKX 跨链 API 以及 Solana Portal Bridge，选中不同链/代币即可在同一界面完成跨链操作。
          </Text>
          <Button type="link" onClick={() => navigate('/')}>返回主页</Button>
        </Space>
      </Card>
      <OkxBridge />
    </Space>
  );
}
