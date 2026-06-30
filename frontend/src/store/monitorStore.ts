import { create } from 'zustand';
import { MonitorMessage } from '@/mock/monitorMock';
import { RoadsidePerception } from '@/types/roadside';
import { VehicleState } from '@/types/vehicle';
import { CloudEvent } from '@/types/cloud';
import {
  generateInitialRoadsideData,
  generateInitialVehicleData,
  generateInitialCloudEvents,
} from '@/mock/monitorMock';
import { MESSAGE_MAX_ENTRIES, MQTT_TOPICS } from '@/constants/config';

interface ConnectionState {
  connected: boolean;
  broker: string;
  clientId: string;
  uptime: number;
}

interface TopicSubscription {
  topic: string;
  active: boolean;
  messageCount: number;
}

interface MonitorState {
  connection: ConnectionState;
  topics: TopicSubscription[];
  messages: MonitorMessage[];
  roadsideData: RoadsidePerception;
  vehicleData: VehicleState;
  cloudEvents: CloudEvent[];
  pageState: { loading: boolean; error: string | null };
  toggleConnection: () => void;
  toggleTopic: (topic: string) => void;
  addMessage: (msg: MonitorMessage) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useMonitorStore = create<MonitorState>((set) => ({
  connection: {
    connected: true,
    broker: 'ws://localhost:9001',
    clientId: 'v2x-platform-demo',
    uptime: 3600,
  },
  topics: Object.values(MQTT_TOPICS).map((topic) => ({
    topic,
    active: true,
    messageCount: 0,
  })),
  messages: [],
  roadsideData: generateInitialRoadsideData(),
  vehicleData: generateInitialVehicleData(),
  cloudEvents: generateInitialCloudEvents(),
  pageState: { loading: false, error: null },

  toggleConnection: () =>
    set((state) => ({
      connection: { ...state.connection, connected: !state.connection.connected },
    })),

  toggleTopic: (topic) =>
    set((state) => ({
      topics: state.topics.map((t) =>
        t.topic === topic ? { ...t, active: !t.active } : t,
      ),
    })),

  addMessage: (msg) =>
    set((state) => ({
      messages: [msg, ...state.messages].slice(0, MESSAGE_MAX_ENTRIES),
      topics: state.topics.map((t) =>
        t.topic === msg.topic ? { ...t, messageCount: t.messageCount + 1 } : t,
      ),
    })),

  setLoading: (loading) => set((state) => ({ pageState: { ...state.pageState, loading } })),
  setError: (error) => set((state) => ({ pageState: { ...state.pageState, error } })),
}));
