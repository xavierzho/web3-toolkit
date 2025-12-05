import { Card, Space, Typography, Button } from 'antd';
import SolBatchSender from '../components/SolBatchSender';
import { useRouter } from '../router';

const { Text, Title } = Typography;

export default function SolBatchPage() {
  const { navigate } = useRouter();

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space orientation="vertical" size="small" style={{ width: '100%' }}>
          <Text type="secondary" style={{ letterSpacing: '0.3em', fontSize: 12 }}>BATCH DISPATCH · SOLANA</Text>
          <Title level={3} style={{ margin: 0 }}>Solana 批量派发</Title>
          <Text type="secondary">
            自动拆分至 12 条指令一批，执行过程实时显示进度。适配右侧钱包中心的外部/本地账户。
          </Text>
          <Button type="link" onClick={() => navigate('/')}>返回主页</Button>
        </Space>
      </Card>
      <SolBatchSender />
    </Space>
  );
}
