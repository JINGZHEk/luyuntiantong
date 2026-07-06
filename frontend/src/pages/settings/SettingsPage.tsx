import React, { useEffect, useState } from 'react';
import {
  Card,
  Form,
  Switch,
  Input,
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
} from '@ant-design/icons';
import { useSettingsStore } from '@/store/settingsStore';
import { downloadJson, uploadJson } from '@/shared/utils/helpers';
import { buildWebSocketUrl, normalizeApiBaseUrl } from '@/services/runtimeConfig';
import { fetchSceneConfig, saveSceneConfig } from '@/services/settingsApi';

const { Text } = Typography;

const SettingsPage: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loaded' | 'saved' | 'failed'>('idle');
  const {
    theme,
    cloudApiBaseUrl,
    riskThreshold,
    ttcThreshold,
    refreshInterval,
    setTheme,
    setCloudApiBaseUrl,
    setRiskThreshold,
    setTtcThreshold,
    setRefreshInterval,
    exportConfig,
    importConfig,
  } = useSettingsStore();

  const loadCloudConfig = async () => {
    setSyncing(true);
    try {
      const config = await fetchSceneConfig('scene_001', cloudApiBaseUrl);
      importConfig(config);
      setSyncStatus('loaded');
      message.success('云端配置已加载');
    } catch {
      setSyncStatus('failed');
      message.warning('云端配置不可用，已保留本地配置');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadCloudConfig();
    // Only auto-load once on page entry; manual edits should not retrigger a fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveCloudConfig = async () => {
    setSyncing(true);
    try {
      const saved = await saveSceneConfig(
        'scene_001',
        {
          riskThreshold,
          ttcThreshold,
          refreshInterval,
          cloudApiBaseUrl: normalizeApiBaseUrl(cloudApiBaseUrl),
        },
        cloudApiBaseUrl,
      );
      importConfig(saved);
      setSyncStatus('saved');
      message.success('云端配置已保存');
    } catch {
      setSyncStatus('failed');
      message.error('保存失败：Cloud API 不可用或配置无效');
    } finally {
      setSyncing(false);
    }
  };

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
          <Card className="glass-card" title="云端服务" size="small">
            <Form layout="vertical">
              <Form.Item label="Cloud API 地址">
                <Input
                  value={cloudApiBaseUrl}
                  onChange={(e) => setCloudApiBaseUrl(e.target.value)}
                  onBlur={() => setCloudApiBaseUrl(normalizeApiBaseUrl(cloudApiBaseUrl))}
                  placeholder="http://localhost:8000/api/v1"
                />
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">WebSocket：{buildWebSocketUrl(cloudApiBaseUrl)}</Text>
                </div>
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
          <Card className="glass-card" title="云端配置同步" size="small">
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Text type="secondary">
                当前场景：scene_001
              </Text>
              <Space>
                <Button loading={syncing} onClick={loadCloudConfig}>
                  从云端加载
                </Button>
                <Button type="primary" loading={syncing} onClick={handleSaveCloudConfig}>
                  保存到云端
                </Button>
              </Space>
              <Text type={syncStatus === 'failed' ? 'danger' : 'secondary'}>
                状态：{
                  syncStatus === 'loaded'
                    ? '已加载云端配置'
                    : syncStatus === 'saved'
                      ? '已保存云端配置'
                      : syncStatus === 'failed'
                        ? '云端同步失败'
                        : '等待同步'
                }
              </Text>
            </Space>
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
              <Text type="secondary">数据模式：Cloud API + Mock fallback</Text>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
