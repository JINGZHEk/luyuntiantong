import React from 'react';
import {
  Card,
  Form,
  Switch,
  InputNumber,
  Button,
  Space,
  Row,
  Col,
  Divider,
  message,
  Select,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useSettingsStore } from '@/store/settingsStore';
import { downloadJson, uploadJson } from '@/shared/utils/helpers';
import { ThemeMode } from '@/types/common';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  const {
    theme,
    riskThreshold,
    ttcThreshold,
    refreshInterval,
    setTheme,
    setRiskThreshold,
    setTtcThreshold,
    setRefreshInterval,
    exportConfig,
    importConfig,
  } = useSettingsStore();

  const handleExport = () => {
    const config = exportConfig();
    downloadJson(config, 'v2x-platform-config.json');
    message.success('配置已导出');
  };

  const handleImport = async () => {
    try {
      const config = await uploadJson();
      importConfig(config as Record<string, unknown>);
      message.success('配置已导入');
    } catch (e) {
      message.error('导入失败：无效的配置文件');
    }
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card className="glass-card" title="外观设置" size="small">
            <Form layout="vertical">
              <Form.Item label="主题模式">
                <Space>
                  <Switch
                    checked={theme === 'dark'}
                    onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                    checkedChildren="深色"
                    unCheckedChildren="浅色"
                  />
                  <Text type="secondary">
                    当前：{theme === 'dark' ? '深色模式' : '浅色模式'}
                  </Text>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="数据刷新" size="small">
            <Form layout="vertical">
              <Form.Item label="数据刷新频率">
                <Select
                  value={refreshInterval}
                  onChange={setRefreshInterval}
                  style={{ width: 200 }}
                  options={[
                    { label: '1 秒', value: 1000 },
                    { label: '2 秒（默认）', value: 2000 },
                    { label: '5 秒', value: 5000 },
                    { label: '10 秒', value: 10000 },
                  ]}
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="告警阈值配置" size="small">
            <Form layout="vertical">
              <Form.Item label="风险分阈值（超过则告警）">
                <InputNumber
                  min={0}
                  max={1}
                  step={0.05}
                  value={riskThreshold}
                  onChange={(v) => v !== null && setRiskThreshold(v)}
                  style={{ width: 200 }}
                  addonAfter="分"
                />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">
                    当风险评分超过 {riskThreshold} 时触发高危告警
                  </Text>
                </div>
              </Form.Item>
              <Form.Item label="TTC 阈值（低于则告警）">
                <InputNumber
                  min={0}
                  max={10}
                  step={0.5}
                  value={ttcThreshold}
                  onChange={(v) => v !== null && setTtcThreshold(v)}
                  style={{ width: 200 }}
                  addonAfter="秒"
                />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">
                    当 TTC 低于 {ttcThreshold}s 时触发碰撞预警
                  </Text>
                </div>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="配置管理" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Text type="secondary">
                导出当前平台配置为 JSON 文件，或从文件导入配置。
              </Text>
              <Space>
                <Button icon={<DownloadOutlined />} onClick={handleExport}>
                  导出配置
                </Button>
                <Button icon={<UploadOutlined />} onClick={handleImport}>
                  导入配置
                </Button>
              </Space>
              <Divider style={{ margin: '12px 0' }} />
              <Text type="secondary">系统版本：V2X-Ghost Platform v1.0.0</Text>
              <Text type="secondary">构建环境：Vite + React + TypeScript</Text>
              <Text type="secondary">数据模式：Mock 本地模拟</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
