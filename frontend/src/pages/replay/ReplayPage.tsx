import React, { useEffect, useMemo } from 'react';
import { Card, Col, Result, Row, Button } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useReplayStore } from '@/store/replayStore';
import { EventTable } from '@/widgets/event-table/EventTable';
import { PlaybackControls } from '@/widgets/playback-controls/PlaybackControls';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { LineChart } from '@/entities/charts/LineChart';
import { GaugeChart } from '@/entities/charts/GaugeChart';
import { useInterval } from '@/shared/hooks/useInterval';
import { CHART_COLORS, RISK_COLORS } from '@/constants/colors';
import { REPLAY_FPS } from '@/constants/config';
import { PageLoading } from '@/shared/components/PageLoading';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { TimeSeriesPoint } from '@/types/common';
import styles from './ReplayPage.module.css';

const ReplayPage: React.FC = () => {
  const events = useReplayStore((state) => state.events);
  const selectedEvent = useReplayStore((state) => state.selectedEvent);
  const frames = useReplayStore((state) => state.frames);
  const playback = useReplayStore((state) => state.playback);
  const searchText = useReplayStore((state) => state.searchText);
  const filterType = useReplayStore((state) => state.filterType);
  const pageState = useReplayStore((state) => state.pageState);
  const loadEvents = useReplayStore((state) => state.loadEvents);
  const selectEvent = useReplayStore((state) => state.selectEvent);
  const setPlaying = useReplayStore((state) => state.setPlaying);
  const setSpeed = useReplayStore((state) => state.setSpeed);
  const setCurrentFrame = useReplayStore((state) => state.setCurrentFrame);
  const nextFrame = useReplayStore((state) => state.nextFrame);
  const setSearchText = useReplayStore((state) => state.setSearchText);
  const setFilterType = useReplayStore((state) => state.setFilterType);
  const setError = useReplayStore((state) => state.setError);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useInterval(
    () => nextFrame(),
    playback.isPlaying ? Math.floor(1000 / (REPLAY_FPS * playback.speed)) : null,
  );

  const currentFrame = frames[playback.currentFrame];
  const riskTrend: TimeSeriesPoint[] = useMemo(
    () => frames.slice(0, playback.currentFrame + 1).map((frame) => ({ time: frame.frameIndex.toString(), value: frame.riskScore })),
    [frames, playback.currentFrame],
  );
  const ttcTrend: TimeSeriesPoint[] = useMemo(
    () => frames.slice(0, playback.currentFrame + 1).map((frame) => ({ time: frame.frameIndex.toString(), value: frame.ttc })),
    [frames, playback.currentFrame],
  );

  if (pageState.loading) return <PageLoading />;

  if (pageState.error) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="EVENT RECONSTRUCTION" title="事件回放" subtitle="还原事件帧与风险演化轨迹" icon={<PlayCircleOutlined />} />
        <Result
          status="error"
          title="回放数据加载失败"
          subTitle={pageState.error}
          extra={<Button type="primary" onClick={() => setError(null)}>重试</Button>}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader eyebrow="EVENT RECONSTRUCTION" title="事件回放" subtitle="还原事件帧与风险演化轨迹" icon={<PlayCircleOutlined />} />

      <section className={styles.section} aria-label="事件筛选">
        <EventTable
          events={events}
          searchText={searchText}
          filterType={filterType}
          selectedEventId={selectedEvent?.eventId || null}
          onSearch={setSearchText}
          onFilterType={setFilterType}
          onSelect={selectEvent}
        />
      </section>

      {selectedEvent ? (
        <>
          <section className={styles.section} aria-label="回放控制">
            <PlaybackControls
              playback={playback}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onSeek={setCurrentFrame}
              onSpeedChange={setSpeed}
            />
          </section>

          <Row gutter={[12, 12]} className={styles.section}>
            <Col xs={24} lg={14}>
              <Card className={`glass-card ${styles.sceneCard}`} size="small" title="场景回放">
                {currentFrame ? (
                  <IntersectionScene replayFrame={currentFrame} height={380} />
                ) : (
                  <EmptyState title="帧数据加载中" description="正在准备当前事件的空间状态" />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <div className={styles.sideStack}>
                <Row gutter={8}>
                  <Col span={12}>
                    <Card className="glass-card" size="small">
                      <GaugeChart value={currentFrame?.riskScore || 0} title="风险分" height={180} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card className="glass-card" size="small">
                      <GaugeChart
                        value={currentFrame?.ttc || 0}
                        title="TTC(s)"
                        min={0}
                        max={10}
                        height={180}
                        thresholds={[
                          { value: 2, color: RISK_COLORS.critical },
                          { value: 4, color: RISK_COLORS.high },
                          { value: 6, color: RISK_COLORS.medium },
                          { value: 10, color: RISK_COLORS.low },
                        ]}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card className="glass-card" size="small">
                  <LineChart data={riskTrend} title="风险分变化" color={CHART_COLORS.quaternary} height={140} />
                </Card>
                <Card className="glass-card" size="small">
                  <LineChart data={ttcTrend} title="TTC 变化" color={CHART_COLORS.primary} height={140} threshold={3} />
                </Card>
              </div>
            </Col>
          </Row>
        </>
      ) : (
        <section className={`glass-card ${styles.emptyCard}`}>
          <EmptyState title="请选择一个事件" description="从上方事件列表中选择事件，查看场景、TTC 与风险变化" />
        </section>
      )}
    </div>
  );
};

export default ReplayPage;
