import React from 'react';
import { Card, Row, Col, Descriptions, Tag, Badge } from 'antd';
import {
  RadarChartOutlined,
  CarOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { RiskTag } from '@/shared/components/RiskTag';
import { useMonitorStore } from '@/store/monitorStore';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

export const PerceptionCards: React.FC = () => {
  const { roadsideData, vehicleData, cloudEvents } = useMonitorStore();
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];
  const latestEvent = cloudEvents[0];

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Card
          className="glass-card"
          title={
            <span>
              <RadarChartOutlined style={{ marginRight: 8, color: colors.accent }} />
              路侧感知
            </span>
          }
          size="small"
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="传感器">
              <Tag color="cyan">{roadsideData.sensorId}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="检测目标数">
              <Badge count={roadsideData.objects.length} style={{ backgroundColor: colors.accent }} />
            </Descriptions.Item>
            <Descriptions.Item label="遮挡区域">
              {roadsideData.occlusionZones.length} 个
            </Descriptions.Item>
            <Descriptions.Item label="交通灯">
              <Tag
                color={
                  roadsideData.trafficState.phase === 'green'
                    ? 'green'
                    : roadsideData.trafficState.phase === 'yellow'
                    ? 'gold'
                    : 'red'
                }
              >
                {roadsideData.trafficState.phase.toUpperCase()} ({roadsideData.trafficState.countdown}s)
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="遮挡目标">
              {roadsideData.objects.filter((o) => o.isOccluded).map((o) => (
                <RiskTag key={o.id} level={o.riskLevel} />
              ))}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card
          className="glass-card"
          title={
            <span>
              <CarOutlined style={{ marginRight: 8, color: colors.success }} />
              车端决策
            </span>
          }
          size="small"
        >
          <Descriptions column={1} size="small">
            <Descriptions.Item label="车辆ID">
              <Tag color="green">{vehicleData.vehicleId}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="速度">
              {vehicleData.speed.toFixed(1)} km/h
            </Descriptions.Item>
            <Descriptions.Item label="风险等级">
              <RiskTag level={vehicleData.decisionInfo.riskLevel} />
            </Descriptions.Item>
            <Descriptions.Item label="TTC">
              <span style={{ fontWeight: 700, color: vehicleData.decisionInfo.ttc < 3 ? '#ff4d4f' : colors.text }}>
                {vehicleData.decisionInfo.ttc.toFixed(1)}s
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="建议动作">
              <Tag color={vehicleData.decisionInfo.suggestedAction === 'emergency_stop' ? 'red' : 'blue'}>
                {vehicleData.decisionInfo.suggestedAction}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="制动状态">
              <Badge
                status={vehicleData.brakeStatus.isActive ? 'error' : 'default'}
                text={vehicleData.brakeStatus.isActive ? '制动中' : '未制动'}
              />
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>

      <Col xs={24} md={8}>
        <Card
          className="glass-card"
          title={
            <span>
              <CloudOutlined style={{ marginRight: 8, color: '#faad14' }} />
              云端事件
            </span>
          }
          size="small"
        >
          {latestEvent ? (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="事件ID">
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {latestEvent.eventId}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                <Tag>{latestEvent.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="风险">
                <RiskTag level={latestEvent.riskLevel} />
              </Descriptions.Item>
              <Descriptions.Item label="描述">
                {latestEvent.description}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Badge
                  status={latestEvent.resolved ? 'success' : 'processing'}
                  text={latestEvent.resolved ? '已解决' : '处理中'}
                />
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <div style={{ textAlign: 'center', color: colors.textSecondary, padding: 20 }}>
              暂无事件
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
};
