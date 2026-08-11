import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZhiluWujieScene, type Mode, type EgoPhase, type ScenarioMetrics, type TrafficMetrics, type RSUData, type SceneVisualPreset } from './scene';
import { createSceneRealtimeAdapter, type SceneRealtimeAdapter } from './sceneRealtimeAdapter';
import { SCENARIO_CATALOG, findScenario } from './scenarioCatalog';
import { demoApi } from '@/services/demoApi';
import { DEFAULT_SCENE_STYLE } from './sceneVisuals';
import { wsService } from '@/services/websocketService';
import { buildWebSocketUrl } from '@/services/runtimeConfig';
import type {
  CloudEventPayload,
  DataMode,
  DecisionPayload,
  PerceptionPayload,
  VehicleStatusPayload,
} from '@/types/realtime';
import styles from './ZhiluWujiePage.module.css';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const BOOT_MSGS = [
  'Initializing V2X Edge Server...',
  'Loading Base Map Geometry [OK]',
  'Connecting to Cloud Neural Network...',
  'Establishing 5G/C-V2X Links [OK]',
  'Spawning AI Traffic Agents...',
  'Loading Scenario: Intersectional Occlusion (Ghost Probe)',
  'Calibrating RSU Sensor Array...',
  'System Ready. Awaiting User Action.',
];

const MODE_ITEMS: { mode: Mode; label: string; icon: JSX.Element }[] = [
  { mode: 'ego', label: '单车聚焦', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" /></svg> },
  { mode: 'traffic', label: '全路网流量', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l2-9 5 18 3-9h6" /></svg> },
  { mode: 'v2i', label: 'V2I 基础设施', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg> },
  { mode: 'algo', label: '算法参数', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></svg> },
];

const PHASE_LABELS: Record<EgoPhase, string> = {
  CRUISE: 'L4 自动巡航',
  DETECT: '路侧感知检测',
  WARN: 'V2X 预警干预',
  BRAKE: 'AEB 紧急制动',
  PASS: '安全解除',
};

const MODE_COLORS: Record<Mode, { accent: string; rgb: string }> = {
  ego:     { accent: '#72cbd0', rgb: '114, 203, 208' },
  traffic: { accent: '#76a889', rgb: '118, 168, 137' },
  v2i:     { accent: '#6e86ad', rgb: '110, 134, 173' },
  algo:    { accent: '#b4975f', rgb: '180, 151, 95' },
};

const INITIAL_THROUGHPUT_BARS = [
  42, 48, 55, 51, 63, 58, 67, 61, 72, 68,
  76, 70, 81, 74, 79, 86, 77, 84, 90, 82,
  88, 94, 86, 92, 96,
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export interface ZhiluWujiePageProps {
  scenePreset?: SceneVisualPreset;
  autoEnter?: boolean;
}

export default function ZhiluWujiePage({ scenePreset, autoEnter = false }: ZhiluWujiePageProps) {
  /* refs */
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ZhiluWujieScene | null>(null);
  const realtimeAdapterRef = useRef<SceneRealtimeAdapter | null>(null);
  const flowCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryScenarioId = searchParams.get('scenario');
  const queryLoop = searchParams.get('loop') === 'true';
  const [selectedScenarioId, setSelectedScenarioId] = useState(() => findScenario(queryScenarioId).scenario_id);
  const selectedScenario = findScenario(selectedScenarioId);
  const effectiveAutoEnter = autoEnter || Boolean(queryScenarioId);
  const effectiveScenePreset: SceneVisualPreset = scenePreset || selectedScenario.visualContext.preset;

  /* state */
  const [booted, setBooted] = useState(false);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [showBtn, setShowBtn] = useState(false);
  const [mode, setMode] = useState<Mode>('ego');
  const [clock, setClock] = useState('--:--:--');
  const [frame, setFrame] = useState(0);
  const [metrics, setMetrics] = useState({ cpu: 70, nodes: 142, fps: 28, latency: 12 });
  const [scenario, setScenario] = useState<ScenarioMetrics>({ egoSpeed: 45, ttc: '> 5.0s', riskLevel: 0, phase: 'CRUISE', isDanger: false, decisionMode: 'cooperative', fusionWeight: '1.00', brakeDecel: '0.0 m/s\u00B2', collisionProb: '0.02' });
  const [traffic, setTraffic] = useState<TrafficMetrics>({ vehicles: 0, avgSpeed: 0, density: '0', congestion: 0, flowHistory: [], laneStats: [] });
  const [rsuData, setRsuData] = useState<RSUData[]>([]);
  const [signals, setSignals] = useState<{ name: string; phase: string }[]>([]);
  const [logs, setLogs] = useState<{ time: string; msg: string; type: string }[]>([]);
  const [scenarioTime, setScenarioTime] = useState(0);
  const [perf, setPerf] = useState({ inferMs: 28, gpuUtil: 62, decisionMs: 5, lossRate: 0.2 });
  const [bloom, setBloom] = useState<number>(DEFAULT_SCENE_STYLE.bloomStrength);
  const [fusionW, setFusionW] = useState(1.0);
  const [throughputBars, setThroughputBars] = useState<number[]>(INITIAL_THROUGHPUT_BARS);
  const [dataMode, setDataMode] = useState<DataMode>('fallback');
  const [realtimeContext, setRealtimeContext] = useState({
    scenarioId: null as string | null,
    runId: null as string | null,
    objectCount: 0,
    predictionStatus: 'unknown',
  });
  const [scenarioSwitchStatus, setScenarioSwitchStatus] = useState('');

  useEffect(() => {
    const nextScenarioId = findScenario(queryScenarioId).scenario_id;
    setSelectedScenarioId((current) => current === nextScenarioId ? current : nextScenarioId);
  }, [queryScenarioId]);

  /* ---- Boot sequence ---- */
  useEffect(() => {
    if (effectiveAutoEnter) {
      setBooted(true);
      setShowBtn(false);
      return;
    }
    let idx = 0;
    const iv = setInterval(() => {
      if (idx < BOOT_MSGS.length) {
        const message = BOOT_MSGS[idx];
        if (message) setBootLines(prev => [...prev, `> ${message}`]);
        idx++;
      } else {
        clearInterval(iv);
        setShowBtn(true);
      }
    }, 350);
    return () => clearInterval(iv);
  }, [effectiveAutoEnter]);

  /* ---- Init scene ---- */
  useEffect(() => {
    if (!canvasRef.current) return;
    const sc = new ZhiluWujieScene(effectiveScenePreset);
    sc.init(canvasRef.current);
    sc.start();
    if (effectiveAutoEnter) sc.enterScene();
    sceneRef.current = sc;

    sc.onLog = (msg, type) => {
      setLogs(prev => {
        const entry = { time: sc.scenarioTime.toFixed(2), msg, type };
        const next = [...prev, entry];
        return next.length > 5 ? next.slice(-5) : next;
      });
    };

    const adapter = createSceneRealtimeAdapter();
    realtimeAdapterRef.current = adapter;
    const unsubscribeConnection = wsService.onConnectionChange((connected) => {
      adapter.onConnectionChange(connected);
    });
    const unsubscribeMessages = wsService.onMessage((type, data) => {
      const receivedAt = Date.now();
      adapter.onMessage(type, data);
      if (type === 'perception') sc.applyPerception(data as PerceptionPayload, receivedAt);
      if (type === 'vehicle_status') sc.applyVehicleStatus(data as VehicleStatusPayload, receivedAt);
      if (type === 'decision') sc.applyDecision(data as DecisionPayload, receivedAt);
      if (type === 'event') sc.applyEvent(data as CloudEventPayload, receivedAt);
    });
    wsService.connect(buildWebSocketUrl());

    return () => {
      unsubscribeMessages();
      unsubscribeConnection();
      realtimeAdapterRef.current = null;
      sc.dispose();
      sceneRef.current = null;
    };
  }, [effectiveAutoEnter, effectiveScenePreset]);

  useEffect(() => {
    sceneRef.current?.setScenarioVisual?.(selectedScenario);
  }, [selectedScenario]);

  /* ---- UI update loop (10Hz) ---- */
  useEffect(() => {
    if (!booted) return;
    let lastTick = 0;
    const tick = () => {
        const now = Date.now();
        if (now - lastTick >= 100) {
          lastTick = now;
          const sc = sceneRef.current;
          if (!sc) return;
          const adapter = realtimeAdapterRef.current;
          if (adapter) {
            adapter.tick();
            const realtime = adapter.snapshot();
            sc.setDataMode(realtime.dataMode);
            setDataMode(realtime.dataMode);
            setRealtimeContext({
              scenarioId: realtime.scenarioId,
              runId: realtime.runId,
              objectCount: realtime.objects.length,
              predictionStatus: realtime.prediction?.status || 'unknown',
            });
            setScenarioTime(
              realtime.dataMode === 'fallback' || realtime.lastFrameId === null
                ? sc.scenarioTime
                : realtime.lastFrameId / 10,
            );
          }
          setClock(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
        setFrame(sc['frame']);
        setMetrics({ cpu: sc.metrics.cpu, nodes: sc.metrics.nodes, fps: sc.metrics.fps, latency: sc.metrics.latency });
        setScenario(sc.getScenarioMetrics());
        setTraffic({ ...sc.trafficMetrics, flowHistory: [...sc.trafficMetrics.flowHistory], laneStats: [...sc.trafficMetrics.laneStats] });
        setRsuData(sc.rsuData.map(r => ({ ...r })));
        setSignals(sc.getTrafficSignalData());
        if (!realtimeAdapterRef.current) setScenarioTime(sc.scenarioTime);
        setPerf({ inferMs: sc.metrics.inferMs, gpuUtil: sc.metrics.gpuUtil, decisionMs: sc.metrics.decisionMs, lossRate: sc.metrics.lossRate });
        const history = sc.trafficMetrics.flowHistory;
        const flowSample = history.length > 0 ? history[history.length - 1] : sc.metrics.fps;
        setThroughputBars(prev => [
          ...prev.slice(1),
          Math.max(20, Math.min(100, 20 + flowSample * 2)),
        ]);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [booted]);

  /* ---- Flow chart ---- */
  useEffect(() => {
    if (mode !== 'traffic' || !flowCanvasRef.current) return;
    const canvas = flowCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const data = traffic.flowHistory;
    if (data.length < 2) return;
    const max = Math.max(...data, 60);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const acRgb = MODE_COLORS[mode].rgb;
    ctx.strokeStyle = `rgba(${acRgb},0.1)`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) { const y = h * i / 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.beginPath();
    ctx.strokeStyle = MODE_COLORS[mode].accent;
    ctx.lineWidth = 1.5;
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `rgba(${acRgb},0.2)`);
    grad.addColorStop(1, `rgba(${acRgb},0)`);
    ctx.fillStyle = grad;
    ctx.fill();
  }, [mode, traffic.flowHistory]);

  /* ---- Handlers ---- */
  const handleEnter = useCallback(() => {
    setBooted(true);
    sceneRef.current?.enterScene();
  }, []);

  const handleScenarioChange = useCallback(async (nextScenarioId: string) => {
    const nextScenario = findScenario(nextScenarioId);
    setSelectedScenarioId(nextScenario.scenario_id);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('scenario', nextScenario.scenario_id);
    nextParams.set('loop', String(queryLoop));
    setSearchParams(nextParams, { replace: true });
    sceneRef.current?.setScenarioVisual?.(nextScenario);
    setScenarioSwitchStatus('切换中 · 正在同步演示数据');
    try {
      await demoApi.start(nextScenario.scenario_id, 10, queryLoop);
      setScenarioSwitchStatus('已同步 · 3D 场景与后端演示一致');
    } catch {
      setScenarioSwitchStatus('演示接口暂不可用 · 当前保留场景上下文');
    }
  }, [queryLoop, searchParams, setSearchParams]);

  const handleModeChange = useCallback((m: Mode) => {
    setMode(m);
    sceneRef.current?.setMode(m);
  }, []);

  const handleBloomChange = useCallback((v: number) => {
    const val = v / 100;
    setBloom(val);
    sceneRef.current?.setBloomStrength(val);
  }, []);

  const handleFusionChange = useCallback((v: number) => {
    const val = v / 100;
    setFusionW(val);
    if (sceneRef.current) sceneRef.current.fusionWeight = val;
  }, []);

  /* ---- Derived ---- */
  const isDanger = scenario.isDanger;
  const timelineProgress = scenarioTime / 12;
  const activeBlocks = Math.floor(timelineProgress * 40);
  const congColor = traffic.congestion > 6 ? 'var(--neon-red)' : traffic.congestion > 3 ? 'var(--neon-orange)' : 'var(--neon-green)';

  const signalPhaseColor = (phase: string) =>
    phase === 'green' ? '#00ff88' : phase === 'yellow' ? '#ffaa00' : '#ff4444';

  return (
    <div className={styles.root} style={{
      '--hud-accent': MODE_COLORS[mode].accent,
      '--hud-accent-rgb': MODE_COLORS[mode].rgb,
      '--scanline-opacity': DEFAULT_SCENE_STYLE.scanlineOpacity,
    } as React.CSSProperties}>
      {/* Three.js canvas */}
      <div ref={canvasRef} className={styles.canvasContainer} />

      {/* Scanline overlay */}
      <div className={styles.scanlines} />

      {/* Boot screen */}
      {!booted && (
        <div className={styles.bootScreen}>
          <div className={styles.bootCenter}>
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="var(--hud-accent)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className={styles.bootIcon}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <h1 className={styles.bootTitle}>路云天瞳</h1>
            <p className={styles.bootSub}>V2X Digital Twin Traffic Network</p>
          </div>
          <div className={styles.bootLogs}>
            {bootLines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
          {showBtn && (
            <button className={styles.cyberBtn} onClick={handleEnter}>接入孪生系统</button>
          )}
        </div>
      )}

      {/* HUD Layer */}
      {booted && (
        <div className={styles.hud}>
          <div className={styles.scenarioBar}>
            <div className={styles.scenarioBarTop}>
              <div className={styles.scenarioBarKicker}>SCENARIO LINK · 16 CASES</div>
              <label className={styles.scenarioBarLabel} htmlFor="zhiluwujie-scenario-select">场景选择</label>
              <select
                id="zhiluwujie-scenario-select"
                aria-label="3D场景选择"
                className={styles.scenarioSelect}
                value={selectedScenario.scenario_id}
                onChange={(event) => void handleScenarioChange(event.target.value)}
              >
                {SCENARIO_CATALOG.map((item) => (
                  <option key={item.scenario_id} value={item.scenario_id}>
                    {item.scenario_id} · {item.name}
                  </option>
                ))}
              </select>
              <span className={styles.scenarioBarState}>{scenarioSwitchStatus || '3D / DATA LINKED'}</span>
            </div>
            <div className={styles.scenarioBarBody}>
              <span className={styles.scenarioId}>{selectedScenario.scenario_id}</span>
              <strong>{selectedScenario.name}</strong>
              <span className={styles.scenarioPreset}>{selectedScenario.visualContext.preset.toUpperCase()}</span>
            </div>
            <p className={styles.scenarioDescription}>{selectedScenario.description}</p>
            <p className={styles.scenarioCue}>视觉提示 · {selectedScenario.visualCue}</p>
          </div>
          {/* ===== TOP BAR ===== */}
          <div className={styles.topBar}>
            {/* Left: System Monitor */}
            <div className={`${styles.panel} ${styles.sysMonitor}`}>
              <div className={styles.panelHeader}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                <h2>全局路网监控中心</h2>
                <span className={styles.connBadge}>{dataMode.toUpperCase()}</span>
              </div>
              <div className={styles.realtimeMeta}>
                <span>{realtimeContext.scenarioId || 'FALLBACK LOOP'}</span>
                <span>RUN {realtimeContext.runId || '--'}</span>
                <span>TARGETS {realtimeContext.objectCount}</span>
              </div>
              <div className={styles.metricsGrid}>
                <div><p className={styles.metricLabel}>云端算力负载</p><p className={styles.metricValue}>{metrics.cpu.toFixed(0)}<span className={styles.metricUnit}> %</span></p></div>
                <div><p className={styles.metricLabel}>接入终端</p><p className={styles.metricValue}>{metrics.nodes}<span className={styles.metricUnit}> nodes</span></p></div>
                <div><p className={styles.metricLabel}>感知帧率</p><p className={styles.metricValue}>{metrics.fps.toFixed(0)}<span className={styles.metricUnit}> fps</span></p></div>
                <div><p className={styles.metricLabel}>通信延迟</p><p className={styles.metricValue}>{metrics.latency.toFixed(0)}<span className={styles.metricUnit}> ms</span></p></div>
              </div>
              <div className={styles.throughputArea}>
                <p className={styles.throughputLabel}>全网数据吞吐量</p>
                <div className={styles.bars}>
                  {throughputBars.map((h, i) => (
                    <div key={i} className={styles.bar} style={{ height: `${h}%`, background: 'rgba(var(--hud-accent-rgb), 0.55)' }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Radar + Clock */}
            <div className={`${styles.panel} ${styles.radarPanel}`}>
              <div className={styles.radarHeader}>
                <span className={styles.radarTitle}>Global Radar</span>
                <span className={styles.radarPing} />
              </div>
              <div className={styles.radar}>
                <div className={styles.radarInner} />
                <div className={styles.radarCross}>
                  <div className={styles.radarCrossH} />
                  <div className={styles.radarCrossV} />
                </div>
                <div className={styles.radarScan} />
              </div>
              <div className={styles.clockArea}>
                <p className={styles.clockText}>{clock}</p>
                <p className={styles.frameText}>帧 #{frame}</p>
              </div>
            </div>
          </div>

          {/* ===== MIDDLE ===== */}
          <div className={styles.middle}>
            {/* Left: Mode Menu */}
            <div className={`${styles.panel} ${styles.modeMenu}`}>
              {MODE_ITEMS.map(item => (
                <div
                  key={item.mode}
                  className={`${styles.menuItem} ${mode === item.mode ? styles.menuActive : ''}`}
                  onClick={() => handleModeChange(item.mode)}
                >
                  {item.icon}
                  {item.label}
                </div>
              ))}
              <div className={styles.menuFooter}>
                <p className={styles.menuFooterLabel}>数据源</p>
                <button className={styles.wsBtn}>{dataMode === 'fallback' ? '等待实时数据' : '实时链路已接入'}</button>
              </div>
            </div>

            {/* Right: Mode Panels */}
            <div className={styles.panelsCol}>
              {/* EGO */}
              <div className={`${styles.modePanel} ${mode !== 'ego' ? styles.modeHidden : ''}`}>
                <div className={`${styles.panel} ${isDanger ? styles.panelRed : ''} ${styles.egoPanel}`}>
                  <div className={styles.egoHeader}>
                    <div className={styles.egoHeaderLeft}>
                      <span className={`${styles.alertDot} ${isDanger ? styles.alertDotDanger : ''}`} />
                      <h3 className={isDanger ? styles.egoTitleDanger : styles.egoTitle}>协同驾驶意图 ({realtimeContext.scenarioId || 'EGO-01'})</h3>
                    </div>
                    <span className={`${styles.phaseTag} ${isDanger ? styles.phaseTagDanger : ''}`}>
                      {PHASE_LABELS[scenario.phase]}
                    </span>
                  </div>
                  <div className={styles.egoMetrics}>
                    <div className={styles.egoMetric}>
                      <p className={styles.egoMetricLabel}>当前车速</p>
                      <p className={styles.egoMetricValue}>{scenario.egoSpeed.toFixed(0)}<span className={styles.metricUnit}>km/h</span></p>
                    </div>
                    <div className={styles.egoMetric}>
                      <p className={styles.egoMetricLabel}>碰撞时间</p>
                      <p className={`${styles.egoMetricValue} ${isDanger ? styles.dangerText : ''}`}>{scenario.ttc}</p>
                    </div>
                    <div className={styles.egoMetric}>
                      <p className={styles.egoMetricLabel}>干预风险</p>
                      <p className={`${styles.egoMetricValue} ${isDanger ? styles.dangerText : ''}`}>{scenario.riskLevel}%</p>
                    </div>
                  </div>
                  <div className={styles.riskBarBg}>
                    <div className={`${styles.riskBarFill} ${isDanger ? styles.riskBarDanger : ''}`} style={{ width: `${scenario.riskLevel}%` }} />
                  </div>
                  <div className={styles.decisionGrid}>
                    <div className={styles.decisionCell}><span className={styles.decisionLabel}>决策模式:</span> <span className={styles.decisionVal}>{scenario.decisionMode}</span></div>
                    <div className={styles.decisionCell}><span className={styles.decisionLabel}>融合权重:</span> <span className={styles.decisionVal}>{scenario.fusionWeight}</span></div>
                    <div className={styles.decisionCell}><span className={styles.decisionLabel}>制动减速度:</span> <span className={styles.decisionVal}>{scenario.brakeDecel}</span></div>
                    <div className={styles.decisionCell}><span className={styles.decisionLabel}>碰撞概率:</span> <span className={styles.decisionVal}>{scenario.collisionProb}</span></div>
                  </div>
                  <div className={styles.logBox}>
                    <div className={styles.logScan} />
                    <div className={styles.logContent}>
                      {logs.map((l, i) => (
                        <p key={i} className={
                          l.type === 'danger' ? styles.logDanger :
                          l.type === 'warn' ? styles.logWarn :
                          l.type === 'success' ? styles.logSuccess : styles.logInfo
                        }>
                          <span className={styles.logTime}>[{l.time}s]</span> {l.msg}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* TRAFFIC */}
              <div className={`${styles.modePanel} ${mode !== 'traffic' ? styles.modeHidden : ''}`}>
                <div className={`${styles.panel} ${styles.trafficPanel}`}>
                  <div className={styles.panelSectionHeader}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l2-9 5 18 3-9h6" /></svg>
                    <h3>全路网流量态势</h3>
                  </div>
                  <div className={styles.trafficGrid}>
                    <div className={styles.trafficCell}><p className={styles.trafficLabel}>在途车辆</p><p className={styles.trafficValue}>{traffic.vehicles}</p></div>
                    <div className={styles.trafficCell}><p className={styles.trafficLabel}>平均车速</p><p className={styles.trafficValue}>{traffic.avgSpeed}<span className={styles.metricUnit}> km/h</span></p></div>
                    <div className={styles.trafficCell}><p className={styles.trafficLabel}>路网密度</p><p className={styles.trafficValue}>{traffic.density}<span className={styles.metricUnit}> veh/km</span></p></div>
                    <div className={styles.trafficCell}><p className={styles.trafficLabel}>拥堵指数</p><p className={styles.trafficValue} style={{ color: congColor }}>{traffic.congestion}</p></div>
                  </div>
                  <div className={styles.flowChartArea}>
                    <p className={styles.flowChartLabel}>流量趋势 (60s)</p>
                    <canvas ref={flowCanvasRef} width={340} height={80} className={styles.flowCanvas} />
                  </div>
                  <div className={styles.laneStats}>
                    <p className={styles.trafficLabel}>车道实时状态</p>
                    {traffic.laneStats.map((l, i) => {
                      const barW = Math.min(100, l.count * 20);
                      const color = l.avg > 30 ? 'var(--neon-green)' : l.avg > 15 ? 'var(--neon-orange)' : 'var(--neon-red)';
                      return (
                        <div key={i} className={styles.laneRow}>
                          <span className={styles.laneName}>{l.name}</span>
                          <div className={styles.laneBarBg}><div className={styles.laneBarFill} style={{ width: `${barW}%`, background: color }} /></div>
                          <span className={styles.laneCount}>{l.count}辆</span>
                          <span className={styles.laneAvg} style={{ color }}>{l.avg}km/h</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* V2I */}
              <div className={`${styles.modePanel} ${mode !== 'v2i' ? styles.modeHidden : ''}`}>
                <div className={`${styles.panel} ${styles.v2iPanel}`}>
                  <div className={styles.panelSectionHeader}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" /></svg>
                    <h3>V2I 基础设施状态</h3>
                  </div>
                  <div className={styles.rsuCards}>
                    {rsuData.map(r => (
                      <div key={r.id} className={styles.rsuCard}>
                        <div className={styles.rsuHeader}>
                          <span className={styles.rsuId}>{r.id}</span>
                          <span className={styles.rsuOnline} />
                        </div>
                        <div className={styles.rsuGrid}>
                          <div><span className={styles.rsuLabel}>CPU</span> <span className={styles.rsuVal}>{r.cpu.toFixed(0)}%</span></div>
                          <div><span className={styles.rsuLabel}>GPU</span> <span className={styles.rsuVal}>{r.gpu.toFixed(0)}%</span></div>
                          <div><span className={styles.rsuLabel}>FPS</span> <span className={styles.rsuVal}>{r.fps.toFixed(0)}</span></div>
                          <div><span className={styles.rsuLabel}>温度</span> <span className={styles.rsuVal}>{r.temp.toFixed(0)}°C</span></div>
                          <div><span className={styles.rsuLabel}>延迟</span> <span className={styles.rsuVal}>{r.latency.toFixed(0)}ms</span></div>
                          <div><span className={styles.rsuLabel}>状态</span> <span className={styles.rsuStatusOnline}>在线</span></div>
                        </div>
                        <div className={styles.rsuBarBg}>
                          <div className={styles.rsuBarFill} style={{
                            width: `${r.cpu}%`,
                            background: r.cpu > 80 ? 'var(--neon-red)' : r.cpu > 60 ? 'var(--neon-orange)' : 'var(--neon-cyan)',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.sectionDivider}>
                    <p className={styles.trafficLabel}>信号灯状态</p>
                    <div className={styles.signalGrid}>
                      {signals.map((s, i) => (
                        <div key={i} className={styles.signalCell}>
                          <span className={styles.signalDot} style={{ background: signalPhaseColor(s.phase), boxShadow: `0 0 6px ${signalPhaseColor(s.phase)}` }} />
                          <span className={styles.signalName}>{s.name}</span>
                          <span className={styles.signalPhase} style={{ color: signalPhaseColor(s.phase) }}>{s.phase.toUpperCase()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.sectionDivider}>
                    <p className={styles.trafficLabel}>设备心跳</p>
                    <div className={styles.heartbeat}>
                      <span className={styles.hbDot} />
                      <span className={styles.hbOnline}>在线</span>
                      <span className={styles.hbTime}>上次: {new Date().toLocaleTimeString('zh-CN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ALGO */}
              <div className={`${styles.modePanel} ${mode !== 'algo' ? styles.modeHidden : ''}`}>
                <div className={`${styles.panel} ${styles.algoPanel}`}>
                  <div className={styles.panelSectionHeader}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82" /></svg>
                    <h3>算法参数配置</h3>
                  </div>
                  <div className={styles.sliderGroup}>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHeader}><span>风险阈值 (Risk Threshold)</span><span>{(0.7).toFixed(2)}</span></div>
                      <input type="range" min="0" max="100" defaultValue="70" className={styles.slider} />
                    </div>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHeader}><span>TTC 阈值 (秒)</span><span>{(3.0).toFixed(1)}</span></div>
                      <input type="range" min="10" max="80" defaultValue="30" className={styles.slider} />
                    </div>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHeader}><span>融合权重 (Fusion Weight)</span><span>{fusionW.toFixed(2)}</span></div>
                      <input type="range" min="0" max="100" defaultValue="100" className={styles.slider} onChange={e => handleFusionChange(Number(e.target.value))} />
                    </div>
                    <div className={styles.sliderRow}>
                      <div className={styles.sliderHeader}><span>Bloom 强度</span><span>{bloom.toFixed(2)}</span></div>
                      <input type="range" min="0" max="10" defaultValue={DEFAULT_SCENE_STYLE.bloomStrength * 100} className={styles.slider} onChange={e => handleBloomChange(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className={styles.sectionDivider}>
                    <p className={styles.trafficLabel}>实时性能指标</p>
                    <div className={styles.perfGrid}>
                      <div className={styles.perfCell}><span className={styles.perfLabel}>推理耗时:</span> <span className={styles.perfVal}>{perf.inferMs.toFixed(0)} ms</span></div>
                      <div className={styles.perfCell}><span className={styles.perfLabel}>GPU利用率:</span> <span className={styles.perfVal}>{perf.gpuUtil.toFixed(0)}%</span></div>
                      <div className={styles.perfCell}><span className={styles.perfLabel}>决策耗时:</span> <span className={styles.perfVal}>{perf.decisionMs.toFixed(0)} ms</span></div>
                      <div className={styles.perfCell}><span className={styles.perfLabel}>消息丢失率:</span> <span className={styles.perfVal}>{perf.lossRate.toFixed(1)}%</span></div>
                    </div>
                  </div>
                  <button className={styles.applyBtn}>应用到仿真引擎</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== BOTTOM TIMELINE ===== */}
          <div className={styles.bottomBar}>
            <div className={styles.timelineWrap}>
              <span className={styles.timelineLabel}>{dataMode === 'fallback' ? 'DIGITAL TWIN FALLBACK TIMELINE' : `REALTIME ${dataMode.toUpperCase()} · ${realtimeContext.scenarioId || 'SCENE'}`}</span>
              <div className={styles.timeline}>
                {Array.from({ length: 40 }, (_, i) => (
                  <div key={i} className={i < activeBlocks ? styles.timelineActive : styles.timelineInactive} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
