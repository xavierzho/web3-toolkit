import { Card, Col, Row, Space, Typography, Button, Tag } from 'antd';
import { useRouter } from '../router';

const { Title, Text } = Typography;

const tools = [
  {
    path: '/evm-batch',
    title: 'EVM 批量转账',
    tag: 'Native / ERC20',
    desc: '粘贴地址清单即刻执行，自动统计金额与批次。',
  },
  {
    path: '/sol-batch',
    title: 'Solana 批量派发',
    tag: 'Native SOL',
    desc: '拆分 12 条指令以内，多批次传输，实时监控状态。',
  },
  {
    path: '/okx-bridge',
    title: 'OKX 跨链桥',
    tag: 'USDT / Stablecoin',
    desc: '调用官方 API 获取最佳路由，构建并发送跨链交易。',
  },
  {
    path: '/airdrop',
    title: '空投名单与批量发放',
    tag: 'Airdrop',
    desc: '解析 CSV / 粘贴地址，查询余额，批量调用空投合约。',
  },
  {
    path: '/multi-trade',
    title: '多钱包买卖',
    tag: 'Spot Trade',
    desc: '导入多私钥，配置 Router，在 BSC 上批量买入/卖出。',
  },
];

export default function Home() {
  const { navigate } = useRouter();

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Tag color="blue">Zzzzz · Web3 Toolkit</Tag>
          <Title level={3} style={{ margin: 0 }}>多链资产调度导航台</Title>
          <Text type="secondary">
            在一个统一界面中完成地址连接、批量派发、跨链，以及后续扩展的空投/交易模块。
            右侧多钱包中心统一管理 EVM 与 Solana，多团队协同可视化。
          </Text>
          <Space wrap>
            <Tag>多链覆盖</Tag>
            <Tag>本地私钥 + 外部钱包</Tag>
            <Tag>批量任务实时反馈</Tag>
          </Space>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        {tools.map(tool => (
          <Col xs={24} md={8} key={tool.path}>
            <Card hoverable onClick={() => navigate(tool.path)}>
              <Space direction="vertical" size="small">
                <Tag>{tool.tag}</Tag>
                <Title level={4} style={{ margin: 0 }}>{tool.title}</Title>
                <Text type="secondary">{tool.desc}</Text>
                <Button type="link" onClick={() => navigate(tool.path)}>前往</Button>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
