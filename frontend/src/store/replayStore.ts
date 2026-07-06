import { create } from 'zustand';
import { ReplayEvent, ReplayFrame, PlaybackState } from '@/types/event';
import { generateReplayEvents, generateReplayFrames } from '@/mock/replayMock';
import { replayApi } from '@/services/replayApi';

interface ReplayState {
  events: ReplayEvent[];
  selectedEvent: ReplayEvent | null;
  frames: ReplayFrame[];
  playback: PlaybackState;
  searchText: string;
  filterType: string;
  pageState: { loading: boolean; error: string | null };
  selectEvent: (event: ReplayEvent) => Promise<void>;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentFrame: (frame: number) => void;
  nextFrame: () => void;
  setSearchText: (text: string) => void;
  setFilterType: (type: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadEvents: () => Promise<void>;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  events: [],
  selectedEvent: null,
  frames: [],
  playback: {
    isPlaying: false,
    speed: 1,
    currentFrame: 0,
    totalFrames: 0,
    keyframes: [],
  },
  searchText: '',
  filterType: 'all',
  pageState: { loading: false, error: null },

  loadEvents: async () => {
    set((state) => ({ pageState: { ...state.pageState, loading: true, error: null } }));
    try {
      const events = await replayApi.listEvents();
      set({ events: events.length > 0 ? events : generateReplayEvents(), pageState: { loading: false, error: null } });
    } catch (err) {
      const events = generateReplayEvents();
      set({
        events,
        pageState: {
          loading: false,
          error: err instanceof Error ? `${err.message}，已使用本地回放数据` : '回放接口异常，已使用本地回放数据',
        },
      });
      setTimeout(() => set((state) => ({ pageState: { ...state.pageState, error: null } })), 1800);
    }
  },

  selectEvent: async (event) => {
    set((state) => ({ selectedEvent: event, pageState: { ...state.pageState, loading: true, error: null } }));
    let frames: ReplayFrame[];
    try {
      frames = await replayApi.getEventFrames(event.eventId);
      if (frames.length === 0) frames = generateReplayFrames(event);
    } catch {
      frames = generateReplayFrames(event);
    }
    const keyframes = [0, Math.floor(frames.length * 0.3), Math.floor(frames.length * 0.6), frames.length - 1];
    set({
      selectedEvent: event,
      frames,
      pageState: { loading: false, error: null },
      playback: {
        isPlaying: false,
        speed: 1,
        currentFrame: 0,
        totalFrames: frames.length,
        keyframes,
      },
    });
  },

  setPlaying: (isPlaying) =>
    set((state) => ({ playback: { ...state.playback, isPlaying } })),

  setSpeed: (speed) =>
    set((state) => ({ playback: { ...state.playback, speed } })),

  setCurrentFrame: (currentFrame) =>
    set((state) => ({ playback: { ...state.playback, currentFrame } })),

  nextFrame: () => {
    const { playback, frames } = get();
    if (playback.currentFrame >= frames.length - 1) {
      set((state) => ({ playback: { ...state.playback, isPlaying: false, currentFrame: 0 } }));
    } else {
      set((state) => ({
        playback: { ...state.playback, currentFrame: state.playback.currentFrame + 1 },
      }));
    }
  },

  setSearchText: (searchText) => set({ searchText }),
  setFilterType: (filterType) => set({ filterType }),
  setLoading: (loading) => set((state) => ({ pageState: { ...state.pageState, loading } })),
  setError: (error) => set((state) => ({ pageState: { ...state.pageState, error } })),
}));
