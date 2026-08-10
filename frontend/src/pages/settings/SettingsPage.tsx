import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  message,
  Row,
  Select,
  Space,
  Typography,
} from 'antd';
import { DownloadOutlined, SettingOutlined, UploadOutlined } from '@ant-design/icons';
import { useSettingsStore } from '@/store/settingsStore';
import { downloadJson, uploadJson } from '@/shared/utils/helpers';
import { buildWebSocketUrl, normalizeApiBaseUrl } from '@/services/runtimeConfig';
import { fetchSceneConfig, saveSceneConfig } from '@/services/settingsApi';
import { PageHeader } from '@/shared/components/PageHeader';
import styles from './SettingsPage.module.css';

const { Text } = Typography;

const SettingsPage: React.FC = () => {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loaded' | 'saved' | 'failed'>('idle');
  const theme = useSettingsStore((state) => state.theme);
  const cloudApiBaseUrl = useSettingsStore((state) => state.cloudApiBaseUrl);
  const riskThreshold = useSettingsStore((state) => state.riskThreshold);
  const ttcThreshold = useSettingsStore((state) => state.ttcThreshold);
  const refreshInterval = useSettingsStore((state) => state.refreshInterval);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setCloudApiBaseUrl = useSettingsStore((state) => state.setCloudApiBaseUrl);
  const setRiskThreshold = useSettingsStore((state) => state.setRiskThreshold);
  const setTtcThreshold = useSettingsStore((state) => state.setTtcThreshold);
  const setRefreshInterval = useSettingsStore((state) => state.setRefreshInterval);
  const exportConfig = useSettingsStore((state) => state.exportConfig);
  const importConfig = useSettingsStore((state) => state.importConfig);

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
    void loadCloudConfig();
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
    downloadJson(exportConfig(), 'v2x-platform-config.json');
    message.success('配置已导出');
  };

  const handleImport = async () => {
    try {
      const config = await uploadJson();
      importConfig(config as Record<string, unknown>);
      message.success('配置已导入');
    } catch {
      message.error('导入失败：无效的配置文件');
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="PLATFORM CONFIGURATION"
        title="系统设置"
        subtitle="主题、阈值、接口与配置同步"
        icon={<SettingOutlined />}
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card className="glass-card" title="外观设置" size="small">
            <Form layout="vertical">
              <Form.Item label="主题模式">
                <div className={styles.themeOptions} role="group" aria-label="主题模式">
                  <button
                    type="button"
                    className={`${styles.themeOption} ${theme === 'dark' ? styles.themeOptionActive : ''}`}
                    aria-pressed={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                  >
                    <span className={`${styles.themePreview} ${styles.darkPreview}`} aria-hidden="true" />
                    <span><strong>深空暗色</strong><small>适合实时态势与大屏</small></span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.themeOption} ${theme === 'light' ? styles.themeOptionActive : ''}`}
                    aria-pressed={theme === 'light'}
                    onClick={() => setTheme('light')}
                  >
                    <span className={`${styles.themePreview} ${styles.lightPreview}`} aria-hidden="true" />
                    <span><strong>清晰浅色</strong><small>适合评估与配置</small></span>
                  </button>
                </div>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="数据刷新" size="small">
            <Form layout="vertical">
              <Form.Item label="数据刷新频率" extra="刷新频率只影响 mock 数据轮询，不改变 WebSocket 推送频率。">
                <Select
                  value={refreshInterval}
                  onChange={setRefreshInterval}
                  className={styles.control}
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
              <Form.Item label="Cloud API 地址" extra={`WebSocket：${buildWebSocketUrl(cloudApiBaseUrl)}`}>
                <Input
                  value={cloudApiBaseUrl}
                  onChange={(event) => setCloudApiBaseUrl(event.target.value)}
                  onBlur={() => setCloudApiBaseUrl(normalizeApiBaseUrl(cloudApiBaseUrl))}
                  placeholder="http://localhost:8011/api/v1"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="告警阈值配置" size="small">
            <Form layout="vertical">
              <Form.Item label="风险分阈值（超过则告警）" extra={`当风险评分超过 ${riskThreshold} 时触发高危告警`}>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.05}
                  value={riskThreshold}
                  onChange={(value) => value !== null && setRiskThreshold(value)}
                  className={styles.control}
                  addonAfter="分"
                />
              </Form.Item>
              <Form.Item label="TTC 阈值（低于则告警）" extra={`当 TTC 低于 ${ttcThreshold}s 时触发碰撞预警`}>
                <InputNumber
                  min={0}
                  max={10}
                  step={0.5}
                  value={ttcThreshold}
                  onChange={(value) => value !== null && setTtcThreshold(value)}
                  className={styles.control}
                  addonAfter="秒"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="云端配置同步" size="small">
            <Space direction="vertical" size="middle" className={styles.fullWidth}>
              <Text type="secondary">当前场景：scene_001</Text>
              <Space wrap>
                <Button loading={syncing} onClick={loadCloudConfig}>从云端加载</Button>
                <Button type="primary" loading={syncing} onClick={handleSaveCloudConfig}>保存到云端</Button>
              </Space>
              <Text className={syncStatus === 'failed' ? styles.syncFailed : styles.syncStatus}>
                状态：{syncStatus === 'loaded' ? '已加载云端配置' : syncStatus === 'saved' ? '已保存云端配置' : syncStatus === 'failed' ? '云端同步失败' : '等待同步'}
              </Text>
            </Space>
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card className="glass-card" title="配置管理" size="small">
            <Space direction="vertical" size="middle" className={styles.fullWidth}>
              <Text type="secondary">导出当前平台配置为 JSON 文件，或从文件导入配置。</Text>
              <Space wrap>
                <Button icon={<DownloadOutlined />} onClick={handleExport}>导出配置</Button>
                <Button icon={<UploadOutlined />} onClick={handleImport}>导入配置</Button>
              </Space>
              <Divider className={styles.divider} />
              <div className={styles.versionList}>
                <Text type="secondary">系统版本：V2X-Ghost Platform v1.0.0</Text>
                <Text type="secondary">构建环境：Vite + React + TypeScript</Text>
                <Text type="secondary">数据模式：Cloud API + Mock fallback</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
