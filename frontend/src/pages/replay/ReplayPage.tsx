import React, { useEffect, useMemo } from 'react';
import { Row, Col, Card, Empty, Result, Button } from 'antd';
import { useReplayStore } from '@/store/replayStore';
import { EventTable } from '@/widgets/event-table/EventTable';
import { PlaybackControls } from '@/widgets/playback-controls/PlaybackControls';
import { IntersectionScene } from '@/features/three-scene/IntersectionScene';
import { LineChart } from '@/entities/charts/LineChart';
import { GaugeChart } from '@/entities/charts/GaugeChart';
import { useInterval } from '@/shared/hooks/useInterval';
import { CHART_COLORS } from '@/constants/colors';
import { REPLAY_FPS } from '@/constants/config';
import { PageLoading } from '@/shared/components/PageLoading';
import { TimeSeriesPoint } from '@/types/common';

const ReplayPage: React.FC = () => {
  const {
    events,
    selectedEvent,
    frames,
    playback,
    searchText,
    filterType,
    pageState,
    loadEvents,
    selectEvent,
    setPlaying,
    setSpeed,
    setCurrentFrame,
    nextFrame,
    setSearchText,
    setFilterType,
    setError,
  } = useReplayStore();

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useInterval(
    () => nextFrame(),
    playback.isPlaying ? Math.floor(1000 / (REPLAY_FPS * playback.speed)) : null,
  );

  const currentFrame = frames[playback.currentFrame];

  const riskTrend: TimeSeriesPoint[] = useMemo(
    () =>
      frames.slice(0, playback.currentFrame + 1).map((f) => ({
        time: f.frameIndex.toString(),
        value: f.riskScore,
      })),
    [frames, playback.currentFrame],
  );

  const ttcTrend: TimeSeriesPoint[] = useMemo(
    () =>
      frames.slice(0, playback.currentFrame + 1).map((f) => ({
        time: f.frameIndex.toString(),
        value: f.ttc,
      })),
    [frames, playback.currentFrame],
  );

  if (pageState.loading) return <PageLoading />;

  if (pageState.error) {
    return (
      <Result
        status="error"
        title="回放数据加载失败"
        subTitle={pageState.error}
        extra={<Button type="primary" onClick={() => setError(null)}>重试</Button>}
      />
    );
  }

  return (
    <div>
      <Row gutter={[12, 12]}>
        <Col span={24}>
          <EventTable
            events={events}
            searchText={searchText}
            filterType={filterType}
            selectedEventId={selectedEvent?.eventId || null}
            onSearch={setSearchText}
            onFilterType={setFilterType}
            onSelect={selectEvent}
          />
        </Col>
      </Row>

      {selectedEvent ? (
        <>
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col span={24}>
              <PlaybackControls
                playback={playback}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onSeek={setCurrentFrame}
                onSpeedChange={setSpeed}
              />
            </Col>
          </Row>

          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} lg={14}>
              <Card className="glass-card" size="small" title="场景回放">
                {currentFrame ? (
                  <IntersectionScene replayFrame={currentFrame} height={380} />
                ) : (
                  <Empty description="加载帧数据中..." />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Row gutter={8}>
                  <Col span={12}>
                    <Card className="glass-card" size="small">
                      <GaugeChart
                        value={currentFrame?.riskScore || 0}
                        title="风险分"
                        height={180}
                      />
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
                          { value: 2, color: '#ff4d4f' },
                          { value: 4, color: '#ff7a45' },
                          { value: 6, color: '#faad14' },
                          { value: 10, color: '#52c41a' },
                        ]}
                      />
                    </Card>
                  </Col>
                </Row>
                <Card className="glass-card" size="small">
                  <LineChart
                    data={riskTrend}
                    title="风险分变化"
                    color={CHART_COLORS.quaternary}
                    height={140}
                  />
                </Card>
                <Card className="glass-card" size="small">
                  <LineChart
                    data={ttcTrend}
                    title="TTC 变化"
                    color={CHART_COLORS.primary}
                    height={140}
                  />
                </Card>
              </div>
            </Col>
          </Row>
        </>
      ) : (
        <Card className="glass-card" style={{ marginTop: 12 }}>
          <Empty description="请从上方事件列表中选择一个事件进行回放" />
        </Card>
      )}
    </div>
  );
};

export default ReplayPage;
