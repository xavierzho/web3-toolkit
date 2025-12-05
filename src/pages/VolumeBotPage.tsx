import { Card, Space, Typography, Button, Input, Select, Tag, App, Statistic, Row, Col, Table, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useVolumeBot } from '../hooks/useVolumeBot';

const { Text } = Typography;
const { Option } = Select;

export default function VolumeBotPage() {
    const { config, state, actions } = useVolumeBot();
    const { message } = App.useApp();

    const handleStart = () => {
        if (!actions.startBot()) {
            message.error('启动失败，请查看日志获取详情。');
        }
    };

    const columns = [
        {
            title: '账户地址',
            dataIndex: 'address',
            key: 'address',
            render: (text: string) => (
                <Tooltip title={text}>
                    <Text copyable={{ text }}>{text.slice(0, 6)}...{text.slice(-4)}</Text>
                </Tooltip>
            ),
        },
        {
            title: `余额 (${config.baseTokenSymbol})`,
            dataIndex: 'base',
            key: 'base',
            render: (val: string) => Number(val).toFixed(4),
        },
        {
            title: `余额 (${state.targetTokenSymbol})`,
            dataIndex: 'token',
            key: 'token',
            render: (val: string) => Number(val).toFixed(4),
        },
    ];

    return (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
            {/* 1. 顶部：配置与控制 */}
            <Row gutter={24}>
                <Col span={14}>
                    <Card title="配置参数 (Configuration)">
                        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                            {/* Token & DEX */}
                            <Space style={{ width: '100%' }}>
                                <Select
                                    value={config.baseTokenSymbol}
                                    onChange={config.setBaseTokenSymbol}
                                    style={{ width: 100 }}
                                >
                                    <Option value="WETH">Native</Option>
                                    <Option value="USDC">USDC</Option>
                                    <Option value="USDT">USDT</Option>
                                </Select>
                                <Space.Compact style={{ flex: 1 }}>
                                    <Input
                                        placeholder="Token Address"
                                        value={config.tokenAddress}
                                        onChange={e => config.setTokenAddress(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                    {state.targetTokenSymbol !== 'TOKEN' && (
                                        <Tag color="blue" style={{ margin: 0, height: 32, display: 'flex', alignItems: 'center', lineHeight: '32px' }}>
                                            {state.targetTokenSymbol}
                                        </Tag>
                                    )}
                                </Space.Compact>
                            </Space>

                            <Space style={{ width: '100%' }}>
                                <Select value={config.dexType} onChange={config.setDexType} style={{ width: 120 }}>
                                    <Option value="V2">Uniswap V2</Option>
                                    <Option value="V3">Uniswap V3</Option>
                                </Select>
                                <Input
                                    placeholder="Router Address"
                                    value={config.routerAddress}
                                    onChange={e => config.setRouterAddress(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </Space>

                            {/* Amounts */}
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Text type="secondary">单笔数量 ({config.baseTokenSymbol})</Text>
                                    <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                                        <Input placeholder="Min" value={config.amountMin} onChange={e => config.setAmountMin(e.target.value)} />
                                        <Input placeholder="Max" value={config.amountMax} onChange={e => config.setAmountMax(e.target.value)} />
                                    </Space.Compact>
                                </Col>
                                <Col span={12}>
                                    <Text type="secondary">交易间隔 (秒)</Text>
                                    <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                                        <Input placeholder="Min" value={config.intervalMin} onChange={e => config.setIntervalMin(Number(e.target.value))} />
                                        <Input placeholder="Max" value={config.intervalMax} onChange={e => config.setIntervalMax(Number(e.target.value))} />
                                    </Space.Compact>
                                </Col>
                            </Row>

                            {/* V3 Fee */}
                            {config.dexType === 'V3' && (
                                <div>
                                    <Text type="secondary">V3 费率 (Fee Tier)</Text>
                                    <Select value={config.v3Fee} onChange={config.setV3Fee} style={{ width: '100%', marginTop: 4 }}>
                                        <Option value={100}>0.01% (100)</Option>
                                        <Option value={500}>0.05% (500)</Option>
                                        <Option value={2500}>0.25% (2500)</Option>
                                        <Option value={10000}>1% (10000)</Option>
                                    </Select>
                                </div>
                            )}
                        </Space>
                    </Card>
                </Col>

                <Col span={10}>
                    <Card title="运行控制 (Control)" style={{ height: '100%' }}>
                        <Space orientation="vertical" size="large" style={{ width: '100%', textAlign: 'center', marginTop: 20 }}>
                            <Row gutter={16}>
                                <Col span={12}><Statistic title="执行次数" value={state.stats.txCount} /></Col>
                                <Col span={12}><Statistic title="成功/失败" value={`${state.stats.success} / ${state.stats.fail}`} /></Col>
                            </Row>

                            <Space size="middle">
                                {!state.isRunning ? (
                                    <Button type="primary" size="large" onClick={handleStart} style={{ minWidth: 120 }}>
                                        开始刷量
                                    </Button>
                                ) : (
                                    <>
                                        <Button danger size="large" onClick={actions.stopBot}>停止</Button>
                                        <Button size="large" onClick={actions.togglePause}>
                                            {state.isPaused ? '继续' : '暂停'}
                                        </Button>
                                    </>
                                )}
                            </Space>

                            <Button
                                danger
                                onClick={() => {
                                    actions.resetState();
                                    message.info('已重置运行状态');
                                }}
                                disabled={!state.isRunning}
                                style={{ marginTop: 12 }}
                            >
                                重置状态
                            </Button>

                            {state.isRunning && (
                                <Tag color={state.isPaused ? 'warning' : 'processing'} style={{ fontSize: 14, padding: '4px 12px' }}>
                                    {state.isPaused ? '已暂停 (Paused)' : '运行中 (Running)'}
                                </Tag>
                            )}
                        </Space>
                    </Card>
                </Col>
            </Row>

            {/* 2. 中部：账户状态 */}
            <Card
                title="账户状态 (Account Status)"
                extra={<Button icon={<ReloadOutlined />} onClick={actions.fetchBalances}>刷新余额</Button>}
            >
                <Table
                    dataSource={state.accountBalances}
                    columns={columns}
                    rowKey="address"
                    pagination={{ pageSize: 5 }}
                    size="small"
                />
            </Card>

            {/* 3. 底部：日志 */}
            <Card
                title="运行日志 (Logs)"
                styles={{ body: { height: 200, overflow: 'auto', backgroundColor: '#f5f5f5' } }}
                extra={
                    <Button
                        size="small"
                        onClick={() => {
                            actions.clearLogs();
                            message.success('日志已清空');
                        }}
                        disabled={state.logs.length === 0}
                    >
                        清空日志
                    </Button>
                }
            >
                {state.logs.map((log, i) => (
                    <div key={i} style={{ fontFamily: 'monospace' }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{log}</Text>
                    </div>
                ))}
            </Card>
        </Space>
    );
}