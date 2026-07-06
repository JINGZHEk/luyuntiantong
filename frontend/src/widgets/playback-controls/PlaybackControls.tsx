import React from 'react';
import { Card, Slider, Button, Select, Space, Typography, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
} from '@ant-design/icons';
import { PlaybackState } from '@/types/event';
import { SPEED_OPTIONS } from '@/constants/config';
import { useSettingsStore } from '@/store/settingsStore';
import { THEME_COLORS } from '@/constants/colors';

const { Text } = Typography;

interface PlaybackControlsProps {
  playback: PlaybackState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (frame: number) => void;
  onSpeedChange: (speed: number) => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  playback,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
}) => {
  const theme = useSettingsStore((s) => s.theme);
  const colors = THEME_COLORS[theme];

  const marks: Record<number, string> = {};
  playback.keyframes.forEach((kf) => {
    marks[kf] = '●';
  });

  return (
    <Card className="glass-card" size="small" title="播放控制器">
      <div style={{ padding: '0 8px' }}>
        <Slider
          min={0}
          max={Math.max(playback.totalFrames - 1, 1)}
          value={playback.currentFrame}
          onChange={onSeek}
          marks={marks}
          tooltip={{
            formatter: (val) => `帧 ${val}/${playback.totalFrames}`,
          }}
          styles={{
            track: { background: colors.accent },
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 8,
          }}
        >
          <Space>
            <Tooltip title="上一帧">
              <Button
                icon={<StepBackwardOutlined />}
                size="small"
                onClick={() => onSeek(Math.max(0, playback.currentFrame - 1))}
              />
            </Tooltip>
            <Button
              type="primary"
              shape="circle"
              size="large"
              icon={playback.isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={playback.isPlaying ? onPause : onPlay}
            />
            <Tooltip title="下一帧">
              <Button
                icon={<StepForwardOutlined />}
                size="small"
                onClick={() =>
                  onSeek(Math.min(playback.totalFrames - 1, playback.currentFrame + 1))
                }
              />
            </Tooltip>
          </Space>

          <Space>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              {playback.currentFrame} / {playback.totalFrames} 帧
            </Text>
            <Select
              size="small"
              value={playback.speed}
              onChange={onSpeedChange}
              style={{ width: 80 }}
              options={SPEED_OPTIONS}
            />
          </Space>
        </div>
      </div>
    </Card>
  );
};
