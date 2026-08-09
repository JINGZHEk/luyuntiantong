import React from 'react';
import { Card, Row, Col, Descriptions, Tag, Badge, Space } from 'antd';
import {
  RadarChartOutlined,
  CarOutlined,
  CloudOutlined,
} from '@ant-design/icons';
import { RiskTag } from '@/shared/components/RiskTag';
import { useMonitorStore } from '@/store/monitorStore';
import styles from './PerceptionCards.module.css';

export const PerceptionCards: React.FC = () => {
  const roadsideData = useMonitorStore((state) => state.roadsideData);
  const vehicleData = useMonitorStore((state) => state.vehicleData);
  const cloudEvents = useMonitorStore((state) => state.cloudEvents);
  const latestEvent = cloudEvents[0];
  const prediction = roadsideData.prediction;
  const source = roadsideData.source;
  const predictionStatus = prediction?.status || 'unknown';
  const isCloudStgnn = prediction?.location === 'cloud' && prediction?.backend === 'stgnn';
  const hasInvalidCoordinate = roadsideData.objects.some((object) => object.coordinateStatus === 'invalid');
  const hasYoloDeepSort = source?.detector?.toLowerCase() === 'yolo'
    && source?.tracker?.toLowerCase() === 'deepsort';

  const predictionStatusTag = predictionStatus === 'ready'
    ? <Tag color="green">ready</Tag>
    : predictionStatus === 'fallback'
      ? <Tag color="gold">Fallback</Tag>
      : predictionStatus === 'invalid_coordinate'
        ? <Tag color="red">坐标无效</Tag>
        : predictionStatus === 'deferred'
          ? <Tag color="blue">等待历史</Tag>
          : <Tag>未声明</Tag>;

  const predictionReason = prediction?.reason
    || roadsideData.objects.find((object) => object.predictionReason)?.predictionReason;

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}>
        <Card
          className="glass-card"
            title={
            <span>
              <RadarChartOutlined className={styles.iconAccent} />
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
              <Badge count={roadsideData.objects.length} className={styles.badgeAccent} />
            </Descriptions.Item>
            <Descriptions.Item label="检测链路">
              {hasYoloDeepSort ? <Tag color="cyan">YOLO + DeepSORT</Tag> : <Tag>来源未声明</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="坐标状态">
              {hasInvalidCoordinate ? <Tag color="red">坐标无效</Tag> : <Tag color="green">按消息标记</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label="STGNN预测">
              <Space size={4} wrap>
                {isCloudStgnn && <Tag color="purple">STGNN Cloud</Tag>}
                {predictionStatusTag}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="预测耗时">
              {typeof prediction?.latency_ms === 'number' ? `${prediction.latency_ms.toFixed(1)} ms` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="模型路径">
              {prediction?.model_path ? (
                <span className={styles.modelPath} title={prediction.model_path}>
                  {prediction.model_path}
                </span>
              ) : '未配置'}
            </Descriptions.Item>
            {predictionReason && (
              <Descriptions.Item label="状态原因">
                <span className={styles.statusReason}>{predictionReason}</span>
              </Descriptions.Item>
            )}
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
              <CarOutlined className={styles.iconSuccess} />
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
              <span className={`${styles.ttc} ${vehicleData.decisionInfo.ttc < 3 ? styles.ttcCritical : ''}`}>
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
              <CloudOutlined className={styles.iconWarning} />
              云端事件
            </span>
          }
          size="small"
        >
          {latestEvent ? (
            <Descriptions column={1} size="small">
              <Descriptions.Item label="事件ID">
                <span className={styles.eventId}>
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
            <div className={styles.empty}>
              暂无事件
            </div>
          )}
        </Card>
      </Col>
    </Row>
  );
};
