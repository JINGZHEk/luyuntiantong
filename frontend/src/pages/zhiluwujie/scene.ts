/**
 * ZhiluWujieScene — Three.js 数字孪生交通场景管理器
 *
 * 管理 3D 场景的完整生命周期：渲染器、后处理、路网、建筑、
 * 车辆、行人、RSU、交通灯、粒子系统和轨迹线。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  CloudEventPayload,
  DataMode,
  DecisionPayload,
  PerceptionPayload,
  PooledObjectState,
  VehicleStatusPayload,
} from '@/types/realtime';
import {
  DEFAULT_SCENE_COORDINATES,
  mapRoadHeading,
  mapRoadPoint,
} from './sceneCoordinates';
import { SceneObjectPool } from './sceneObjectPool';
import {
  createBuilding,
  createIntersectionLayout,
  createRealtimeActorModel,
  createTrafficSignal,
  createTree,
  DEFAULT_SCENE_STYLE,
} from './sceneVisuals';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type Mode = 'ego' | 'traffic' | 'v2i' | 'algo';
export type EgoPhase = 'CRUISE' | 'DETECT' | 'WARN' | 'BRAKE' | 'PASS';

export interface SceneSnapshot {
  egoPosition: THREE.Vector3;
  truckPosition: THREE.Vector3;
  pedestrianPosition: THREE.Vector3;
  pedestrianVisible: boolean;
  egoPhase: EgoPhase;
  egoSpeed: number;
  riskLevel: number;
  trafficCars: { position: THREE.Vector3; isVertical: boolean; speed: number; lane: number }[];
  rsuPositions: THREE.Vector3[];
}

export interface ScenarioMetrics {
  egoSpeed: number;
  ttc: string;
  riskLevel: number;
  phase: EgoPhase;
  isDanger: boolean;
  decisionMode: string;
  fusionWeight: string;
  brakeDecel: string;
  collisionProb: string;
}

export interface TrafficMetrics {
  vehicles: number;
  avgSpeed: number;
  density: string;
  congestion: number;
  flowHistory: number[];
  laneStats: { name: string; count: number; avg: number }[];
}

export interface RSUData {
  id: string;
  cpu: number;
  gpu: number;
  fps: number;
  temp: number;
  latency: number;
  status: string;
}

export interface RealtimeSceneMetrics {
  dataMode: DataMode;
  scenarioId: string | null;
  runId: string | null;
  objectCount: number;
  predictionStatus: string;
  lastMessageAt: number | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const T = {
  cyan: 0x4f9791, blue: 0x717b8d, red: 0xb46660,
  green: 0x66856b, orange: 0xa18358,
};
const SCENARIO_DUR = 12;
const EVT = { pedStart: 3, rsuDetect: 4.5, v2xWarn: 5, brakeStart: 5.5, stopTime: 7.5, safeCross: 9.5 };

export function trafficHeadingForLane(lane: number): number {
  return lane < 0 ? -Math.PI / 2 : Math.PI / 2;
}

export function shouldShowTrajectory(mode: Mode): boolean {
  return mode === 'traffic' || mode === 'algo';
}

/* ------------------------------------------------------------------ */
/*  Scene Manager                                                      */
/* ------------------------------------------------------------------ */
export class ZhiluWujieScene {
  /* core */
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private animId = 0;
  private booted = false;
  private frame = 0;
  private time = 0;

  /* mode & scenario */
  mode: Mode = 'ego';
  scenarioTime = 0;
  egoPhase: EgoPhase = 'CRUISE';
  egoSpeed = 45;
  egoZ = 80;
  pedX = 22;
  riskLevel = 0;

  /* config */
  bloomStrength: number = DEFAULT_SCENE_STYLE.bloomStrength;
  fusionWeight = 1.0;

  /* 3D objects */
  private egoCar!: THREE.Group;
  private truck!: THREE.Group;
  private pedestrian!: THREE.Group;
  private trafficCars: THREE.Group[] = [];
  private trafficLights: THREE.Group[] = [];
  private particles!: THREE.Points;
  private trajLines!: THREE.Group;
  private coverageGroup!: THREE.Group;
  private rsuObjects: { group: THREE.Group; ringMat: THREE.MeshBasicMaterial; coneMat: THREE.MeshBasicMaterial; color: number }[] = [];
  private realtimeObjectsGroup!: THREE.Group;
  private realtimePool!: SceneObjectPool;
  private pedWarn!: THREE.Mesh;
  private egoAuraMat!: THREE.MeshBasicMaterial;
  private egoV2xLine!: THREE.Line;

  /* realtime state */
  private realtimeDataMode: DataMode = 'fallback';
  private realtimeScenarioId: string | null = null;
  private realtimeRunId: string | null = null;
  private realtimeLastMessageAt: number | null = null;
  private realtimePredictionStatus = 'unknown';
  private realtimeDecision: DecisionPayload | null = null;
  private realtimeTtc: number | null = null;
  private realtimeCollisionProb: number | null = null;
  private realtimeBrakeDecel = 0;

  /* data */
  rsuData: RSUData[] = [
    { id: 'RSU-01', cpu: 45, gpu: 62, fps: 28, temp: 58, latency: 12, status: 'online' },
    { id: 'RSU-02', cpu: 52, gpu: 58, fps: 26, temp: 61, latency: 15, status: 'online' },
  ];
  trafficMetrics: TrafficMetrics = { vehicles: 0, avgSpeed: 0, density: '0', congestion: 0, flowHistory: [], laneStats: [] };
  metrics = { cpu: 70, nodes: 142, fps: 28, latency: 12, inferMs: 28, gpuUtil: 62, decisionMs: 5, lossRate: 0.2 };

  /* log callback */
  onLog?: (msg: string, type: string) => void;

  /* -------------------------------------------------------------- */
  /*  Init                                                             */
  /* -------------------------------------------------------------- */
  init(container: HTMLElement) {
    const w = window.innerWidth, h = window.innerHeight;

    /* renderer */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    /* scene */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DEFAULT_SCENE_STYLE.background);
    this.scene.fog = new THREE.Fog(DEFAULT_SCENE_STYLE.background, 140, 360);

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.realtimeObjectsGroup = new THREE.Group();
    this.realtimeObjectsGroup.name = 'realtime-object-pool';
    this.realtimeObjectsGroup.visible = false;
    this.realtimePool = new SceneObjectPool({
      group: this.realtimeObjectsGroup,
      coordinateConfig: DEFAULT_SCENE_COORDINATES,
      ttlMs: 1000,
      createModel: state => createRealtimeActorModel(state),
    });
    this.scene.add(this.realtimeObjectsGroup);

    /* camera */
    this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 500);
    this.camera.position.set(82, 72, 86);

    /* post‑processing */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), this.bloomStrength, 0.4, 0.9);
    this.composer.addPass(this.bloomPass);

    /* controls */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.15;
    this.controls.maxDistance = 250;

    /* lights */
    this.scene.add(new THREE.HemisphereLight(0xfff8e8, 0x667276, 1.5));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dir = new THREE.DirectionalLight(0xfff0d2, 2.2);
    dir.position.set(55, 105, 35);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 260;
    dir.shadow.camera.left = -100;
    dir.shadow.camera.right = 100;
    dir.shadow.camera.top = 100;
    dir.shadow.camera.bottom = -100;
    this.scene.add(dir);

    /* build */
    this.buildGround();
    this.buildBuildings();
    this.buildTrafficLights();
    this.buildRSUs();
    this.buildVehicles();
    this.buildPedestrian();
    this.buildParticles();
    this.buildTrajectories();
    this.buildCoverage();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const isTransparentEffect = materials.some((material) =>
          material.transparent || material.opacity < 0.95 || material.blending === THREE.AdditiveBlending,
        );
        if (!isTransparentEffect) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      }
    });

    /* resize */
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  /* -------------------------------------------------------------- */
  /*  Build scene objects                                              */
  /* -------------------------------------------------------------- */
  private buildGround() {
    const layout = createIntersectionLayout();
    layout.getObjectByName('traffic-signals')?.removeFromParent();
    layout.getObjectByName('streetscape')?.removeFromParent();

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 280),
      new THREE.MeshStandardMaterial({ color: 0xb9c1bd, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground, layout);
  }

  private buildBuildings() {
    const streetscape = new THREE.Group();
    streetscape.name = 'daylight-streetscape';

    const northwest = createBuilding(8, 10, 6);
    northwest.name = 'building-northwest';
    northwest.position.set(-19, 0, 18);
    streetscape.add(northwest);

    const southeast = createBuilding(9, 12, 7);
    southeast.name = 'building-southeast';
    southeast.position.set(19, 0, -18);
    streetscape.add(southeast);

    const northeastTree = createTree();
    northeastTree.name = 'tree-northeast';
    northeastTree.position.set(18, 0, 18);
    streetscape.add(northeastTree);

    const southwestTree = createTree();
    southwestTree.name = 'tree-southwest';
    southwestTree.position.set(-18, 0, -18);
    streetscape.add(southwestTree);

    this.scene.add(streetscape);
  }

  private buildTrafficLights() {
    const configs = [
      { x: 0, z: 10, rotation: 0, phase: 'green' as const, name: 'north' },
      { x: 10, z: 0, rotation: Math.PI / 2, phase: 'red' as const, name: 'east' },
      { x: 0, z: -10, rotation: Math.PI, phase: 'green' as const, name: 'south' },
      { x: -10, z: 0, rotation: (Math.PI * 3) / 2, phase: 'yellow' as const, name: 'west' },
    ];
    configs.forEach(({ x, z, rotation, phase, name }) => {
      const signal = createTrafficSignal(phase);
      signal.name = `traffic-signal-${name}`;
      signal.position.set(x, 0, z);
      signal.rotation.y = rotation;
      const lights = (['red', 'yellow', 'green'] as const).map((color) => ({
        mesh: signal.getObjectByName(`signal-${color}`) as THREE.Mesh,
        color: color === 'red' ? T.red : color === 'yellow' ? T.orange : T.green,
      }));
      signal.userData = { phase, lights, timer: 0 };
      this.scene.add(signal);
      this.trafficLights.push(signal);
    });
  }

  private buildRSUs() {
    const mkRSU = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.22, 7, 10).translate(0, 3.5, 0),
        new THREE.MeshStandardMaterial({ color: 0x687276, roughness: 0.8 }),
      );
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.55).translate(0, 7.15, 0),
        new THREE.MeshStandardMaterial({ color: 0x8b9799, roughness: 0.65 }),
      );
      const antenna = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.45, 0.08).translate(0, 7.65, 0),
        new THREE.MeshStandardMaterial({ color: 0x5f686b, roughness: 0.85 }),
      );
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x9aafb6, transparent: true, opacity: 0.08, depthWrite: false });
      const coneMat = new THREE.MeshBasicMaterial({ color: 0x81959b, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide });
      g.add(pole, head, antenna);
      this.scene.add(g);
      this.rsuObjects.push({ group: g, ringMat, coneMat, color: 0x9aafb6 });
    };
    mkRSU(-15, 15); mkRSU(15, -15);
  }

  private buildVehicles() {
    const mkVehicle = (vehicleClass: 'car' | 'truck' | 'bus', isEgo = false) => {
      const g = createRealtimeActorModel({ class: vehicleClass, modelType: 'vehicle' });
      if (isEgo) {
        const lidar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.3).translate(0, 1.3, -0.5),
          new THREE.MeshStandardMaterial({ color: 0x6f7776, roughness: 0.5 }),
        );
        const aura = new THREE.Mesh(
          new THREE.RingGeometry(1.25, 1.5, 32),
          new THREE.MeshBasicMaterial({ color: T.cyan, transparent: true, opacity: 0.2, depthWrite: false }),
        );
        aura.rotation.x = -Math.PI / 2;
        aura.position.y = 0.06;
        g.add(lidar, aura);
        this.egoAuraMat = aura.material as THREE.MeshBasicMaterial;
        /* V2X line */
        const v2x = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(-15, 12, 15)]),
          new THREE.LineBasicMaterial({ color: T.blue, transparent: true, opacity: 0, linewidth: 1 }),
        );
        g.add(v2x);
        this.egoV2xLine = v2x;
      }
      return g;
    };

    /* ego */
    this.egoCar = mkVehicle('car', true);
    this.scene.add(this.egoCar);

    /* truck */
    this.truck = createRealtimeActorModel({ class: 'truck', modelType: 'vehicle' });
    this.truck.position.set(6, 0, 15);
    const blind = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.1, 4).translate(3, 0.1, 0),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    this.truck.add(blind);
    this.scene.add(this.truck);

    /* traffic cars */
    const trafficClasses: ('car' | 'truck' | 'bus')[] = ['car', 'truck', 'bus'];
    const laneX = [-6, 6], laneZ = [-6, 6];
    for (let i = 0; i < 12; i++) {
      const tc = mkVehicle(trafficClasses[i % trafficClasses.length]);
      const isV = i % 2 === 0;
      const lane = isV ? laneX[i % 2] : laneZ[i % 2];
      const pos = Math.random() * 200 - 100;
      if (isV) { tc.position.set(lane, 0, pos); if (lane > 0) tc.rotation.y = Math.PI; }
      else { tc.position.set(pos, 0, lane); tc.rotation.y = trafficHeadingForLane(lane); }
      tc.userData = { isVertical: isV, speed: 20 + Math.random() * 20, lane };
      this.scene.add(tc);
      this.trafficCars.push(tc);
    }
  }

  private buildPedestrian() {
    this.pedestrian = createRealtimeActorModel({ class: 'person', modelType: 'person' });
    this.pedWarn = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 0.1).translate(0, 0.1, 0),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.pedestrian.add(this.pedWarn);
    this.scene.add(this.pedestrian);
  }

  private buildParticles() {
    const count = 24;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    const particlePalette = [
      new THREE.Color(0xd5dcda), new THREE.Color(0xc5d1d0),
      new THREE.Color(0xb7c9c8), new THREE.Color(0xcbd8d5),
    ];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 50;
      pos[i * 3 + 1] = Math.random() * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      vel[i] = 0.02 + Math.random() * 0.03;
      const c = particlePalette[Math.floor(Math.random() * particlePalette.length)];
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.particles = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, transparent: true, opacity: 0.18, vertexColors: true,
      blending: THREE.NormalBlending, depthWrite: false,
    }));
    this.particles.userData.velocities = vel;
    this.scene.add(this.particles);
  }

  private buildTrajectories() {
    this.trajLines = new THREE.Group();
    this.trajLines.visible = false;
    this.trafficCars.forEach(car => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 20; i++) {
        if (car.userData.isVertical) {
          pts.push(new THREE.Vector3(car.position.x, 0.3, car.position.z + (car.userData.lane > 0 ? -i : i)));
        } else {
          pts.push(new THREE.Vector3(car.position.x + (car.userData.lane < 0 ? -i : i), 0.3, car.position.z));
        }
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: T.green, transparent: true, opacity: 0.3 }),
      );
      this.trajLines.add(line);
    });
    this.scene.add(this.trajLines);
  }

  private buildCoverage() {
    this.coverageGroup = new THREE.Group();
    this.coverageGroup.name = 'v2i-coverage';
    this.coverageGroup.visible = false;
    this.rsuObjects.forEach(r => {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(18, 18, 0.05, 48),
        r.coneMat,
      );
      disc.position.copy(r.group.position);
      disc.position.y = 0.04;
      this.coverageGroup.add(disc);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(17.7, 18, 48),
        r.ringMat,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(r.group.position);
      ring.position.y = 0.07;
      this.coverageGroup.add(ring);
    });
    this.scene.add(this.coverageGroup);
  }

  /* -------------------------------------------------------------- */
  /*  Camera                                                           */
  /* -------------------------------------------------------------- */
  animateCameraTo(targetPos: THREE.Vector3, targetLookAt: THREE.Vector3) {
    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    let t = 0;
    const tick = () => {
      t += 0.025;
      if (t >= 1) return;
      const ease = 1 - Math.pow(1 - t, 3);
      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, targetLookAt, ease);
      this.controls.update();
      requestAnimationFrame(tick);
    };
    tick();
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.trajLines.visible = shouldShowTrajectory(mode);
    this.coverageGroup.visible = mode === 'v2i';
    switch (mode) {
      case 'ego':
        this.animateCameraTo(new THREE.Vector3(25, 20, 35), new THREE.Vector3(this.egoCar.position.x, 0, this.egoZ - 20));
        break;
      case 'traffic':
        this.animateCameraTo(new THREE.Vector3(0, 120, 0), new THREE.Vector3(0, 0, 0));
        break;
      case 'v2i':
        this.animateCameraTo(new THREE.Vector3(40, 35, 40), new THREE.Vector3(0, 5, 0));
        break;
      case 'algo':
        this.animateCameraTo(new THREE.Vector3(30, 25, 30), new THREE.Vector3(0, 0, 0));
        break;
    }
  }

  enterScene() {
    this.booted = true;
    this.animateCameraTo(new THREE.Vector3(25, 20, 35), new THREE.Vector3(0, 0, this.egoZ - 20));
  }

  setBloomStrength(v: number) {
    this.bloomStrength = v;
    this.bloomPass.strength = v;
  }

  /* -------------------------------------------------------------- */
  /*  Scenario (Ego mode)                                              */
  /* -------------------------------------------------------------- */
  private updateFallbackScenario(delta: number) {
    this.scenarioTime += delta;
    const st = this.scenarioTime;
    if (st > SCENARIO_DUR) {
      this.scenarioTime = 0; this.egoZ = 80; this.egoSpeed = 45; this.pedX = 22;
      this.egoPhase = 'CRUISE'; this.riskLevel = 0;
      return;
    }
    if (st < EVT.pedStart) {
      this.egoPhase = 'CRUISE';
      this.riskLevel = Math.max(0, this.riskLevel - 50 * delta);
    } else if (st < EVT.rsuDetect) {
      this.egoPhase = 'CRUISE';
      this.pedX -= 4.5 * delta;
    } else if (st < EVT.v2xWarn) {
      if (this.egoPhase !== 'DETECT') {
        this.egoPhase = 'DETECT';
        this.onLog?.('路侧边缘节点捕获盲区移动目标', 'warn');
      }
      this.pedX -= 4.5 * delta;
      this.riskLevel = Math.min(60, this.riskLevel + 100 * delta);
    } else if (st < EVT.brakeStart) {
      if (this.egoPhase !== 'WARN') {
        this.egoPhase = 'WARN';
        this.onLog?.('云端下发超视距协同预警 (C-V2X)', 'danger');
      }
      this.pedX -= 4.5 * delta;
      this.riskLevel = Math.min(85, this.riskLevel + 100 * delta);
    } else if (st < EVT.stopTime) {
      if (this.egoPhase !== 'BRAKE') {
        this.egoPhase = 'BRAKE';
        this.onLog?.('AEB 紧急制动系统接管', 'danger');
      }
      this.pedX -= 4.5 * delta;
      const decel = 45 / (EVT.stopTime - EVT.brakeStart);
      this.egoSpeed = Math.max(0, this.egoSpeed - decel * delta);
      this.riskLevel = 99;
    } else if (st < EVT.safeCross) {
      if (this.egoPhase !== 'PASS') {
        this.egoPhase = 'PASS';
        this.onLog?.('碰撞风险解除，目标安全通过', 'success');
      }
      this.egoSpeed = 0;
      this.pedX -= 4.5 * delta;
      this.riskLevel = Math.max(0, this.riskLevel - 30 * delta);
    } else {
      this.egoPhase = 'CRUISE';
      this.egoSpeed = Math.min(45, this.egoSpeed + 15 * delta);
    }

    this.egoZ -= (this.egoSpeed / 3.6) * delta;
    this.egoCar.position.set(-6, 0, this.egoZ);
    this.pedestrian.position.set(this.pedX, 0, 11);

    /* visual effects */
    const isDanger = this.egoPhase === 'WARN' || this.egoPhase === 'BRAKE';
    if (isDanger) {
      this.egoAuraMat.color.setHex(T.red);
      this.egoAuraMat.opacity = 0.6 + Math.sin(st * 20) * 0.2;
      this.rsuObjects[0].ringMat.color.setHex(T.red);
      (this.pedWarn.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(st * 15) * 0.5;
      (this.egoV2xLine.material as THREE.LineBasicMaterial).opacity = 0.35;
      this.egoV2xLine.geometry.setFromPoints([
        new THREE.Vector3(0, 2, 0),
        this.rsuObjects[0].group.position.clone().sub(this.egoCar.position).add(new THREE.Vector3(0, 12, 0)),
      ]);
    } else {
      this.egoAuraMat.color.setHex(T.cyan);
      this.egoAuraMat.opacity = 0.2;
      this.rsuObjects[0].ringMat.color.setHex(T.cyan);
      (this.pedWarn.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.egoV2xLine.material as THREE.LineBasicMaterial).opacity = 0;
    }
  }

  /* -------------------------------------------------------------- */
  /*  Traffic simulation                                               */
  /* -------------------------------------------------------------- */
  private updateTraffic(delta: number) {
    this.trafficCars.forEach(car => {
      const spd = (car.userData.speed / 3.6) * delta;
      if (car.userData.isVertical) {
        car.position.z += car.userData.lane > 0 ? spd : -spd;
        if (car.position.z > 100) car.position.z = -100;
        if (car.position.z < -100) car.position.z = 100;
      } else {
        car.position.x += car.userData.lane < 0 ? spd : -spd;
        if (car.position.x > 100) car.position.x = -100;
        if (car.position.x < -100) car.position.x = 100;
      }
    });

    /* compute metrics */
    this.trafficMetrics.vehicles = this.trafficCars.length + 1;
    this.trafficMetrics.avgSpeed = Math.round(
      this.trafficCars.reduce((s, c) => s + c.userData.speed, 0) / this.trafficCars.length,
    );
    this.trafficMetrics.density = (this.trafficMetrics.vehicles / 0.5).toFixed(1);
    this.trafficMetrics.congestion = Math.min(
      10,
      Number(((this.trafficMetrics.vehicles * (100 - this.trafficMetrics.avgSpeed)) / 100).toFixed(1)),
    );
    this.trafficMetrics.flowHistory.push(this.trafficMetrics.avgSpeed);
    if (this.trafficMetrics.flowHistory.length > 60) this.trafficMetrics.flowHistory.shift();

    const lanes = [
      { name: '北向车道', count: 0, total: 0, spdSum: 0 },
      { name: '南向车道', count: 0, total: 0, spdSum: 0 },
      { name: '东向车道', count: 0, total: 0, spdSum: 0 },
      { name: '西向车道', count: 0, total: 0, spdSum: 0 },
    ];
    this.trafficCars.forEach(c => {
      if (c.userData.isVertical && c.userData.lane < 0) { lanes[0].count++; lanes[0].spdSum += c.userData.speed; }
      if (c.userData.isVertical && c.userData.lane > 0) { lanes[1].count++; lanes[1].spdSum += c.userData.speed; }
      if (!c.userData.isVertical && c.userData.lane < 0) { lanes[2].count++; lanes[2].spdSum += c.userData.speed; }
      if (!c.userData.isVertical && c.userData.lane > 0) { lanes[3].count++; lanes[3].spdSum += c.userData.speed; }
    });
    this.trafficMetrics.laneStats = lanes.map(l => ({
      name: l.name,
      count: l.count,
      avg: l.count ? Math.round(l.spdSum / l.count) : 0,
    }));
  }

  /* -------------------------------------------------------------- */
  /*  Traffic lights                                                     */
  /* -------------------------------------------------------------- */
  private updateTrafficLights(delta: number) {
    const phases = ['green', 'yellow', 'red'] as const;
    const durations: Record<string, number> = { green: 15, yellow: 3, red: 18 };
    this.trafficLights.forEach(tl => {
      tl.userData.timer += delta;
      if (tl.userData.timer >= durations[tl.userData.phase]) {
        tl.userData.timer = 0;
        const idx = phases.indexOf(tl.userData.phase as 'green' | 'yellow' | 'red');
        tl.userData.phase = phases[(idx + 1) % 3];
      }
      tl.userData.lights.forEach((l: { mesh: THREE.Mesh; color: number }) => {
        const isActive =
          (tl.userData.phase === 'green' && l.color === T.green) ||
          (tl.userData.phase === 'yellow' && l.color === T.orange) ||
          (tl.userData.phase === 'red' && l.color === T.red);
        (l.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isActive ? 0.2 : 0.03;
      });
    });
  }

  /* -------------------------------------------------------------- */
  /*  RSU data                                                         */
  /* -------------------------------------------------------------- */
  private updateRSU() {
    this.rsuData.forEach(rsu => {
      rsu.cpu = Math.max(20, Math.min(95, rsu.cpu + (Math.random() - 0.5) * 5));
      rsu.gpu = Math.max(30, Math.min(90, rsu.gpu + (Math.random() - 0.5) * 4));
      rsu.fps = Math.max(20, Math.min(30, rsu.fps + (Math.random() - 0.5) * 2));
      rsu.temp = Math.max(45, Math.min(75, rsu.temp + (Math.random() - 0.5) * 2));
      rsu.latency = Math.max(5, Math.min(30, rsu.latency + (Math.random() - 0.5) * 3));
    });
  }

  /* -------------------------------------------------------------- */
  /*  Mock metrics                                                     */
  /* -------------------------------------------------------------- */
  private updateMockData() {
    const m = this.metrics;
    m.cpu = Math.max(40, Math.min(95, m.cpu + (Math.random() - 0.5) * 8));
    m.nodes = 130 + Math.floor(Math.random() * 20);
    m.fps = Math.max(20, Math.min(30, m.fps + (Math.random() - 0.5) * 3));
    m.latency = Math.max(5, Math.min(25, m.latency + (Math.random() - 0.5) * 4));
    m.inferMs = Math.max(15, Math.min(45, m.inferMs + (Math.random() - 0.5) * 5));
    m.gpuUtil = Math.max(40, Math.min(85, m.gpuUtil + (Math.random() - 0.5) * 5));
    m.decisionMs = Math.max(2, Math.min(10, m.decisionMs + (Math.random() - 0.5) * 2));
    m.lossRate = Math.max(0, Math.min(2, m.lossRate + (Math.random() - 0.5) * 0.3));
  }

  /* -------------------------------------------------------------- */
  /*  Particles                                                        */
  /* -------------------------------------------------------------- */
  private updateParticles() {
    const pos = this.particles.geometry.attributes.position.array as Float32Array;
    const vel = this.particles.userData.velocities as Float32Array;
    for (let i = 0; i < vel.length; i++) {
      pos[i * 3 + 1] += vel[i];
      if (pos[i * 3 + 1] > 20) {
        pos[i * 3 + 1] = 0;
        pos[i * 3] = (Math.random() - 0.5) * 50;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }

  /* -------------------------------------------------------------- */
  /*  Realtime data API                                               */
  /* -------------------------------------------------------------- */
  getRealtimeObjectPool(): SceneObjectPool {
    return this.realtimePool;
  }

  applyPerception(payload: PerceptionPayload, receivedAt = Date.now()): void {
    if (!this.realtimePool) return;
    const source = payload.source || {};
    if (source.clear === true) this.realtimePool.clear();
    for (const object of payload.objects || []) {
      this.realtimePool.upsert(payload.node_id || 'unknown', object, receivedAt);
    }
    this.realtimeScenarioId = payload.scenario_id || payload.scenario || this.realtimeScenarioId;
    this.realtimeRunId = payload.run_id || this.realtimeRunId;
    this.realtimeLastMessageAt = receivedAt;
    this.realtimePredictionStatus = payload.prediction?.status || 'unknown';
    if (Number.isFinite(payload.processing_time_ms)) {
      this.metrics.inferMs = Number(payload.processing_time_ms);
    }
  }

  applyVehicleStatus(payload: VehicleStatusPayload, receivedAt = Date.now()): void {
    const position = payload.position;
    if (position && position.length >= 2 && Number.isFinite(Number(position[0])) && Number.isFinite(Number(position[1]))) {
      const mapped = mapRoadPoint([Number(position[0]), Number(position[1])], DEFAULT_SCENE_COORDINATES);
      this.egoCar.position.set(mapped.x, mapped.y, mapped.z);
      this.egoZ = mapped.z;
    }
    const velocity = payload.velocity || [];
    const speedMps = Number.isFinite(Number(payload.speed))
      ? Number(payload.speed)
      : Math.hypot(Number(velocity[0]) || 0, Number(velocity[1]) || 0);
    if (Number.isFinite(speedMps)) this.egoSpeed = Math.max(0, speedMps * 3.6);
    if (Number.isFinite(Number(payload.heading))) {
      this.egoCar.rotation.y = mapRoadHeading(Number(payload.heading), DEFAULT_SCENE_COORDINATES.rotationDeg);
    }
    this.realtimeScenarioId = payload.scenario_id || payload.scenario || this.realtimeScenarioId;
    this.realtimeRunId = payload.run_id || this.realtimeRunId;
    this.realtimeLastMessageAt = receivedAt;
  }

  applyDecision(payload: DecisionPayload, receivedAt = Date.now()): void {
    this.realtimeDecision = { ...payload };
    this.realtimeTtc = Number.isFinite(Number(payload.ttc)) ? Number(payload.ttc) : null;
    this.realtimeCollisionProb = Number.isFinite(Number(payload.collision_prob))
      ? Math.max(0, Math.min(1, Number(payload.collision_prob)))
      : null;
    this.realtimeBrakeDecel = Number.isFinite(Number(payload.brake_decel)) ? Number(payload.brake_decel) : 0;
    this.fusionWeight = Number.isFinite(Number(payload.fusion_weight)) ? Number(payload.fusion_weight) : this.fusionWeight;
    const riskMap: Record<string, number> = { SAFE: 0, WARNING: 45, DANGER: 80, EMERGENCY: 100 };
    this.riskLevel = this.realtimeCollisionProb !== null
      ? this.realtimeCollisionProb * 100
      : riskMap[payload.risk_level || 'SAFE'] || 0;
    switch (payload.risk_level) {
      case 'EMERGENCY': this.egoPhase = 'BRAKE'; break;
      case 'DANGER': this.egoPhase = 'WARN'; break;
      case 'WARNING': this.egoPhase = 'DETECT'; break;
      default: this.egoPhase = 'CRUISE';
    }
    this.realtimeScenarioId = payload.scenario_id || payload.scenario || this.realtimeScenarioId;
    this.realtimeRunId = payload.run_id || this.realtimeRunId;
    this.realtimeLastMessageAt = receivedAt;
  }

  applyEvent(payload: CloudEventPayload, receivedAt = Date.now()): void {
    this.realtimeScenarioId = payload.scenario_id || this.realtimeScenarioId;
    this.realtimeRunId = payload.run_id || this.realtimeRunId;
    this.realtimeLastMessageAt = receivedAt;
    if (payload.description) {
      const type = payload.severity === 'critical' ? 'danger' : payload.severity === 'high' ? 'warn' : 'info';
      this.onLog?.(payload.description, type);
    }
  }

  setDataMode(mode: DataMode): void {
    if (mode === 'fallback' && this.realtimeDataMode !== 'fallback') {
      this.realtimeDecision = null;
      this.realtimeTtc = null;
      this.realtimeCollisionProb = null;
      this.realtimeBrakeDecel = 0;
      this.realtimeScenarioId = null;
      this.realtimeRunId = null;
      this.realtimePredictionStatus = 'unknown';
    }
    this.realtimeDataMode = mode;
    if (!this.realtimeObjectsGroup || !this.truck || !this.pedestrian) return;
    if (mode === 'fallback') {
      this.clearDynamicObjects();
      this.realtimeObjectsGroup.visible = false;
      this.truck.visible = true;
      this.pedestrian.visible = true;
    } else {
      this.realtimeObjectsGroup.visible = true;
      this.truck.visible = false;
      this.pedestrian.visible = false;
    }
  }

  clearDynamicObjects(): void {
    this.realtimePool?.clear();
  }

  getRealtimeObjects(): PooledObjectState[] {
    return this.realtimePool ? this.realtimePool.snapshot() : [];
  }

  getRealtimeMetrics(): RealtimeSceneMetrics {
    return {
      dataMode: this.realtimeDataMode,
      scenarioId: this.realtimeScenarioId,
      runId: this.realtimeRunId,
      objectCount: this.realtimePool ? this.realtimePool.size : 0,
      predictionStatus: this.realtimePredictionStatus,
      lastMessageAt: this.realtimeLastMessageAt,
    };
  }

  /* -------------------------------------------------------------- */
  /*  Getters for React UI                                             */
  /* -------------------------------------------------------------- */
  getSnapshot(): SceneSnapshot {
    return {
      egoPosition: this.egoCar.position.clone(),
      truckPosition: this.truck.position.clone(),
      pedestrianPosition: this.pedestrian.position.clone(),
      pedestrianVisible: this.egoPhase !== 'CRUISE' || this.scenarioTime > EVT.pedStart,
      egoPhase: this.egoPhase,
      egoSpeed: this.egoSpeed,
      riskLevel: this.riskLevel,
      trafficCars: this.trafficCars.map(c => ({
        position: c.position.clone(),
        isVertical: c.userData.isVertical,
        speed: c.userData.speed,
        lane: c.userData.lane,
      })),
      rsuPositions: this.rsuObjects.map(r => r.group.position.clone()),
    };
  }

  getScenarioMetrics(): ScenarioMetrics {
    if (this.realtimeDataMode !== 'fallback' && this.realtimeDecision) {
      const riskLevel = Math.floor(Math.max(0, Math.min(100, this.riskLevel)));
      const riskName = this.realtimeDecision.risk_level || 'SAFE';
      const isDanger = riskName === 'DANGER' || riskName === 'EMERGENCY';
      return {
        egoSpeed: this.egoSpeed,
        ttc: this.realtimeTtc === null ? '--' : `${this.realtimeTtc.toFixed(1)}s`,
        riskLevel,
        phase: this.egoPhase,
        isDanger,
        decisionMode: this.realtimeDecision.mode || 'cooperative',
        fusionWeight: this.fusionWeight.toFixed(2),
        brakeDecel: `${this.realtimeBrakeDecel.toFixed(1)} m/s²`,
        collisionProb: this.realtimeCollisionProb === null ? '--' : this.realtimeCollisionProb.toFixed(2),
      };
    }
    const isDanger = this.egoPhase === 'WARN' || this.egoPhase === 'BRAKE';
    const ttcVal = ((this.egoZ - this.pedestrian.position.z) / (this.egoSpeed / 3.6 + 0.1)).toFixed(1);
    return {
      egoSpeed: this.egoSpeed,
      ttc: isDanger ? `${ttcVal}s` : '> 5.0s',
      riskLevel: Math.floor(this.riskLevel),
      phase: this.egoPhase,
      isDanger,
      decisionMode: isDanger ? 'emergency' : 'cooperative',
      fusionWeight: this.fusionWeight.toFixed(2),
      brakeDecel: isDanger ? `${(this.egoSpeed / 0.5).toFixed(1)} m/s²` : '0.0 m/s²',
      collisionProb: isDanger ? (this.riskLevel / 100).toFixed(2) : '0.02',
    };
  }

  getTrafficSignalData() {
    const names = ['北向', '南向', '东向', '西向'];
    return this.trafficLights.map((tl, i) => ({
      name: names[i],
      phase: tl.userData.phase as string,
    }));
  }

  /* -------------------------------------------------------------- */
  /*  Main loop                                                        */
  /* -------------------------------------------------------------- */
  start() {
    const animate = () => {
      this.animId = requestAnimationFrame(animate);
      const delta = Math.min(this.clock.getDelta(), 0.1);
      this.time += delta;
      this.frame++;

      if (this.booted) {
        this.updateTraffic(delta);
        this.updateTrafficLights(delta);
        this.updateParticles();
        if (this.mode === 'ego' && this.realtimeDataMode === 'fallback') this.updateFallbackScenario(delta);
        this.updateMockData();
        this.updateRSU();

        /* camera follow in ego mode */
        if (this.mode === 'ego') {
          const targetZ = this.egoZ - 20;
          this.controls.target.z += (targetZ - this.controls.target.z) * 0.1;
        }
      }

      this.controls.update();
      this.composer.render();
    };
    animate();
  }

  /* -------------------------------------------------------------- */
  /*  Lifecycle                                                        */
  /* -------------------------------------------------------------- */
  private _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  dispose() {
    cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this._onResize);
    this.realtimePool?.clear();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
