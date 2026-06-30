import { create } from 'zustand';
import { ReplayEvent, ReplayFrame, PlaybackState } from '@/types/event';
import { generateReplayEvents, generateReplayFrames } from '@/mock/replayMock';

interface ReplayState {
  events: ReplayEvent[];
  selectedEvent: ReplayEvent | null;
  frames: ReplayFrame[];
  playback: PlaybackState;
  searchText: string;
  filterType: string;
  pageState: { loading: boolean; error: string | null };
  selectEvent: (event: ReplayEvent) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentFrame: (frame: number) => void;
  nextFrame: () => void;
  setSearchText: (text: string) => void;
  setFilterType: (type: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  loadEvents: () => void;
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

  loadEvents: () => {
    const events = generateReplayEvents();
    set({ events });
  },

  selectEvent: (event) => {
    const frames = generateReplayFrames(event);
    const keyframes = [0, Math.floor(frames.length * 0.3), Math.floor(frames.length * 0.6), frames.length - 1];
    set({
      selectedEvent: event,
      frames,
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
