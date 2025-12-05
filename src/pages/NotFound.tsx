import { Card, Space, Typography, Button } from 'antd';
import { useRouter } from '../router';

const { Title, Text } = Typography;

export default function NotFound() {
  const { navigate } = useRouter();

  return (
    <Card>
      <Space orientation="vertical" size="middle" style={{ width: '100%', textAlign: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>页面不存在</Title>
        <Text type="secondary">请回到主页选择其他工具或模块。</Text>
        <Button type="primary" onClick={() => navigate('/')}>返回主页</Button>
      </Space>
    </Card>
  );
}
