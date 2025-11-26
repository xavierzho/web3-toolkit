import { Card, Space, Typography, Button } from 'antd';
import EvmBatchSender from '../components/EvmBatchSender';
import { useRouter } from '../router';

const { Text, Title } = Typography;

export default function EvmBatchPage() {
  const { navigate } = useRouter();

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>BATCH DISPATCH · EVM</Text>
          <Title level={3} style={{ margin: 0 }}>EVM 批量转账中心</Title>
          <Text type="secondary">
            导入地址清单，支持同时控制外部钱包或本地私钥，Native 与 ERC20 一键切换。表格内联校验，实时输出统计。
          </Text>
          <Button type="link" onClick={() => navigate('/')}>返回主页</Button>
        </Space>
      </Card>
      <EvmBatchSender />
    </Space>
  );
}
