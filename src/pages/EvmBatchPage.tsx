import { Card, Space, Typography, Button, Tabs } from 'antd';
import EvmBatchSender from '../components/EvmBatchSender';
import EvmBatchCollection from '../components/EvmBatchCollection';
import EvmBatchTransfer from '../components/EvmBatchTransfer';
import { useRouter } from '../router';

const { Text, Title } = Typography;

export default function EvmBatchPage() {
  const { navigate } = useRouter();

  const items = [
    {
      key: 'dispatch',
      label: '批量分发 (Dispatch)',
      children: <EvmBatchSender />,
    },
    {
      key: 'collection',
      label: '批量归集 (Collection)',
      children: <EvmBatchCollection />,
    },
    {
      key: 'transfer',
      label: '批量转账 (P2P)',
      children: <EvmBatchTransfer />,
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>BATCH OPERATIONS · EVM</Text>
          <Title level={3} style={{ margin: 0 }}>EVM 批量操作中心</Title>
          <Text type="secondary">
            一站式管理批量转账与归集。支持 One-to-Many (分发)、Many-to-One (归集)、Many-to-Many (P2P) 模式。
          </Text>
          <Button type="link" onClick={() => navigate('/')} style={{ paddingLeft: 0 }}>返回主页</Button>
        </Space>
      </Card>

      <Tabs defaultActiveKey="dispatch" items={items} type="card" />
    </Space>
  );
}
