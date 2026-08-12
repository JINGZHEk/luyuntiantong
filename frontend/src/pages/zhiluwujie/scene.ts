/**
 * ZhiluWujieScene — Three.js 数字孪生交通场景管理器
 *
 * 管理 3D 场景的完整生命周期：渲染器、后处理、路网、建筑、
 * 车辆、行人、RSU、交通灯、粒子系统和轨迹线。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
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
  createScenarioVisualContext,
  createTrafficSignal,
  createTree,
  DEFAULT_SCENE_STYLE,
} from './sceneVisuals';
import type { ScenarioVisualSpec } from './scenarioCatalog';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export type Mode = 'ego' | 'traffic' | 'v2i' | 'algo';
export type EgoPhase = 'CRUISE' | 'DETECT' | 'WARN' | 'BRAKE' | 'PASS';
export type SceneVisualPreset = 'cyber' | 'day' | 'dusk' | 'night';

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
  cyan: DEFAULT_SCENE_STYLE.palette.cyan,
  blue: DEFAULT_SCENE_STYLE.palette.blue,
  red: DEFAULT_SCENE_STYLE.palette.red,
  green: DEFAULT_SCENE_STYLE.palette.green,
  orange: DEFAULT_SCENE_STYLE.palette.orange,
} as const;
const SIGNAL_EMISSIVE = { active: 0.45, inactive: 0.03 } as const;
const ROAD_W = 24;
const SCENARIO_DUR = 12;
const EVT = { pedStart: 3, rsuDetect: 4.5, v2xWarn: 5, brakeStart: 5.5, stopTime: 7.5, safeCross: 9.5 };

export interface RealisticProfile {
  background: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  road: number;
  sidewalk: number;
  curb: number;
  building: number;
  buildingAlt: number;
  sky: number;
  ground: number;
  keyColor: number;
  keyIntensity: number;
  fillColor: number;
  fillIntensity: number;
  exposure: number;
  bloom: number;
  accent: number;
  window: number;
  streetLight: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  skyTop: string;
  skyBottom: string;
}

const REALISTIC_PROFILES: Record<Exclude<SceneVisualPreset, 'cyber'>, RealisticProfile> = {
  day: {
    background: 0xb5c4c6, fog: 0xb5c4c6, fogNear: 110, fogFar: 320,
    road: 0x454d4d, sidewalk: 0x838d89, curb: 0xb9bcb3,
    building: 0x737f80, buildingAlt: 0x626f73, sky: 0xdce8e7, ground: 0x5e7167,
    keyColor: 0xfff4df, keyIntensity: 3.4, fillColor: 0xbfd1d7, fillIntensity: 1.35,
    exposure: 1.12, bloom: 0.045, accent: 0x3d8790, window: 0x8faeb2, streetLight: 0xffd59a,
    cameraPosition: [17, 13, 60], cameraTarget: [-6, 1, 35],
    skyTop: '#8aaab7', skyBottom: '#e3e2d7',
  },
  dusk: {
    background: 0x303d43, fog: 0x303d43, fogNear: 96, fogFar: 290,
    road: 0x3c4546, sidewalk: 0x707b79, curb: 0xa3a8a0,
    building: 0x59666b, buildingAlt: 0x4b585e, sky: 0x9e8277, ground: 0x3e504d,
    keyColor: 0xffc38e, keyIntensity: 2.8, fillColor: 0x9ab7c8, fillIntensity: 1.55,
    exposure: 1.1, bloom: 0.075, accent: 0xb28b61, window: 0xb79a78, streetLight: 0xffb76d,
    cameraPosition: [16, 11, 56], cameraTarget: [-6, 1, 35],
    skyTop: '#101824', skyBottom: '#b07b5c',
  },
  night: {
    background: 0x0c151b, fog: 0x0c151b, fogNear: 78, fogFar: 250,
    road: 0x2a3234, sidewalk: 0x505a5b, curb: 0x858b84,
    building: 0x303a40, buildingAlt: 0x263137, sky: 0x263b4a, ground: 0x182321,
    keyColor: 0x9bb5cc, keyIntensity: 1.45, fillColor: 0x536b79, fillIntensity: 1.05,
    exposure: 0.92, bloom: 0.12, accent: 0x6b98a2, window: 0xb0a187, streetLight: 0xffa95e,
    cameraPosition: [16, 10, 52], cameraTarget: [-6, 1, 35],
    skyTop: '#05080d', skyBottom: '#202d34',
  },
};

export function getSceneVisualProfile(preset: Exclude<SceneVisualPreset, 'cyber'>): RealisticProfile {
  return REALISTIC_PROFILES[preset];
}

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
  private visualPreset: SceneVisualPreset;
  private profile: RealisticProfile;
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
  private realtimeTrajectoryGroup!: THREE.Group;
  private realtimePool!: SceneObjectPool;
  private scenarioContextGroup?: THREE.Group;
  private scenarioVisualSpec: ScenarioVisualSpec | null = null;
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

  constructor(visualPreset: SceneVisualPreset = 'cyber') {
    this.visualPreset = visualPreset;
    this.profile = REALISTIC_PROFILES[visualPreset === 'cyber' ? 'dusk' : visualPreset];
    if (visualPreset !== 'cyber') this.egoZ = 45;
  }

  /* -------------------------------------------------------------- */
  /*  Init                                                             */
  /* -------------------------------------------------------------- */
  init(container: HTMLElement) {
    const w = window.innerWidth, h = window.innerHeight;
    const realistic = this.visualPreset !== 'cyber';

    /* renderer */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, realistic ? 2 : DEFAULT_SCENE_STYLE.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = realistic ? this.profile.exposure : DEFAULT_SCENE_STYLE.toneMappingExposure;
    if (realistic) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    container.appendChild(this.renderer.domElement);

    /* scene */
    this.scene = new THREE.Scene();
    this.scene.fog = realistic
      ? new THREE.Fog(this.profile.fog, this.profile.fogNear, this.profile.fogFar)
      : new THREE.Fog(DEFAULT_SCENE_STYLE.background, DEFAULT_SCENE_STYLE.fogNear, DEFAULT_SCENE_STYLE.fogFar);
    this.scene.background = new THREE.Color(realistic ? this.profile.background : DEFAULT_SCENE_STYLE.background);

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
    this.realtimeTrajectoryGroup = new THREE.Group();
    this.realtimeTrajectoryGroup.name = 'realtime-trajectories';
    this.realtimeTrajectoryGroup.visible = false;
    this.scene.add(this.realtimeTrajectoryGroup);

    /* camera */
    this.camera = new THREE.PerspectiveCamera(realistic ? 50 : 45, w / h, 1, 500);
    if (realistic) this.camera.position.set(...this.profile.cameraPosition);
    else this.camera.position.set(100, 100, 100);

    /* post‑processing */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      realistic ? this.profile.bloom : this.bloomStrength,
      realistic ? 0.18 : 0.4,
      realistic ? 0.82 : 0.1,
    );
    this.composer.addPass(this.bloomPass);

    /* controls */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    if (realistic) this.controls.target.set(...this.profile.cameraTarget);
    else this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.maxDistance = 250;

    /* lights */
    if (realistic) {
      this.buildRealisticLighting();
      this.buildRealisticBackdrop();
    } else {
      this.scene.add(new THREE.HemisphereLight(0x49617a, 0x02050a, 0.62));
      this.scene.add(new THREE.AmbientLight(0x26384d, 0.28));
      const dir = new THREE.DirectionalLight(0xa5b0bd, 1.15);
      dir.position.set(55, 105, 35);
      dir.castShadow = true;
      dir.shadow.mapSize.set(DEFAULT_SCENE_STYLE.shadowMapSize, DEFAULT_SCENE_STYLE.shadowMapSize);
      dir.shadow.camera.near = 1;
      dir.shadow.camera.far = 260;
      dir.shadow.camera.left = -100;
      dir.shadow.camera.right = 100;
      dir.shadow.camera.top = 100;
      dir.shadow.camera.bottom = -100;
      this.scene.add(dir);
    }

    /* build */
    if (realistic) {
      this.buildRealisticGround();
      this.buildRealisticBuildings();
      this.buildRealisticTrafficLights();
      this.buildRealisticRSUs();
      this.buildRealisticVehicles();
      this.buildRealisticPedestrian();
      this.buildRealisticParticles();
    } else {
      this.buildGround();
      this.buildBuildings();
      this.buildTrafficLights();
      this.buildRSUs();
      this.buildVehicles();
      this.buildPedestrian();
      this.buildParticles();
    }
    this.buildTrajectories();
    this.buildCoverage();
    this.attachScenarioVisualContext();
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
  private disposeObject3D(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();

    root.traverse((object) => {
      const drawable = object as THREE.Mesh;
      if (drawable.geometry instanceof THREE.BufferGeometry) geometries.add(drawable.geometry);

      const material = drawable.material;
      if (Array.isArray(material)) {
        material.forEach((item) => {
          if (item instanceof THREE.Material) materials.add(item);
        });
      } else if (material instanceof THREE.Material) {
        materials.add(material);
      }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  private buildRealisticLighting() {
    const p = this.profile;
    const ambient = new THREE.AmbientLight(
      0xf0e9dd,
      this.visualPreset === 'day' ? 0.85 : this.visualPreset === 'dusk' ? 0.72 : 0.5,
    );
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(
      p.sky,
      p.ground,
      this.visualPreset === 'day' ? 1.75 : this.visualPreset === 'dusk' ? 1.35 : 0.9,
    );
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(p.keyColor, p.keyIntensity);
    key.position.set(42, 78, 34);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 260;
    key.shadow.camera.left = -100;
    key.shadow.camera.right = 100;
    key.shadow.camera.top = 100;
    key.shadow.camera.bottom = -100;
    key.shadow.bias = -0.00015;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(p.fillColor, p.fillIntensity);
    fill.position.set(-52, 28, -38);
    this.scene.add(fill);

    const ambientIntersection = new THREE.PointLight(
      p.streetLight,
      this.visualPreset === 'night' ? 1.2 : 0.28,
      38,
      2,
    );
    ambientIntersection.position.set(0, 7, 0);
    this.scene.add(ambientIntersection);

    if (this.visualPreset !== 'day') {
      [[-18, 6, -18], [18, 6, -18], [-18, 6, 18], [18, 6, 18]].forEach(([x, y, z]) => {
        const lamp = new THREE.PointLight(
          p.streetLight,
          this.visualPreset === 'night' ? 1.3 : 0.5,
          22,
          2,
        );
        lamp.position.set(x, y, z);
        this.scene.add(lamp);
      });
    }
  }

  private buildRealisticBackdrop() {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, this.profile.skyTop);
    gradient.addColorStop(1, this.profile.skyBottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 16),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false }),
    );
    sky.renderOrder = -10;
    this.scene.add(sky);
  }

  private createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#3a4141';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 4200; i++) {
      const value = 32 + Math.floor((Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) * 8);
      const alpha = 0.04 + (i % 5) * 0.008;
      ctx.fillStyle = `rgba(${value},${value + 3},${value + 4},${alpha})`;
      const size = i % 9 === 0 ? 2 : 1;
      ctx.fillRect((i * 37) % 256, (i * 61) % 256, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(12, 90);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  private addRealisticRoadStripe(
    group: THREE.Group,
    x: number,
    z: number,
    width: number,
    depth: number,
    material: THREE.Material,
  ) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, depth), material);
    stripe.position.set(x, 0.035, z);
    stripe.receiveShadow = true;
    group.add(stripe);
  }

  private buildRealisticGround() {
    const p = this.profile;
    const ground = new THREE.Group();
    const asphaltTexture = this.createAsphaltTexture();
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: p.road,
      map: asphaltTexture ?? undefined,
      roughness: 0.9,
      metalness: 0.02,
    });
    const groundMat = new THREE.MeshStandardMaterial({ color: p.ground, roughness: 1 });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: p.sidewalk, roughness: 0.92 });
    const curbMat = new THREE.MeshStandardMaterial({ color: p.curb, roughness: 0.76 });
    const markingMat = new THREE.MeshStandardMaterial({ color: 0xe4e0d3, roughness: 0.7 });
    const centerMat = new THREE.MeshStandardMaterial({ color: 0xcaa75b, roughness: 0.75 });

    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), groundMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -0.22;
    terrain.receiveShadow = true;
    ground.add(terrain);

    const roadZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 400), asphaltMat);
    roadZ.rotation.x = -Math.PI / 2;
    roadZ.receiveShadow = true;
    ground.add(roadZ);
    const roadX = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_W), asphaltMat);
    roadX.rotation.x = -Math.PI / 2;
    roadX.position.y = 0.008;
    roadX.receiveShadow = true;
    ground.add(roadX);

    [[-40, -40], [40, -40], [-40, 40], [40, 40]].forEach(([x, z]) => {
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(56, 0.28, 56), sidewalkMat);
      sidewalk.position.set(x, -0.02, z);
      sidewalk.receiveShadow = true;
      ground.add(sidewalk);
    });

    [-ROAD_W / 2 - 0.22, ROAD_W / 2 + 0.22].forEach(x => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 400), curbMat);
      curb.position.set(x, 0.12, 0);
      curb.castShadow = true;
      curb.receiveShadow = true;
      ground.add(curb);
    });
    [-ROAD_W / 2 - 0.22, ROAD_W / 2 + 0.22].forEach(z => {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(400, 0.32, 0.42), curbMat);
      curb.position.set(0, 0.12, z);
      curb.castShadow = true;
      curb.receiveShadow = true;
      ground.add(curb);
    });

    this.addRealisticRoadStripe(ground, -0.16, 0, 0.11, 400, centerMat);
    this.addRealisticRoadStripe(ground, 0.16, 0, 0.11, 400, centerMat);
    this.addRealisticRoadStripe(ground, 0, -0.16, 400, 0.11, centerMat);
    this.addRealisticRoadStripe(ground, 0, 0.16, 400, 0.11, centerMat);

    for (let i = -36; i <= 36; i += 7) {
      if (Math.abs(i) < 16) continue;
      this.addRealisticRoadStripe(ground, -6, i, 0.1, 3.1, markingMat);
      this.addRealisticRoadStripe(ground, 6, i, 0.1, 3.1, markingMat);
      this.addRealisticRoadStripe(ground, i, -6, 3.1, 0.1, markingMat);
      this.addRealisticRoadStripe(ground, i, 6, 3.1, 0.1, markingMat);
    }

    const crosswalks = [
      { axis: 'z', value: ROAD_W / 2 + 2.0 }, { axis: 'z', value: -ROAD_W / 2 - 2.0 },
      { axis: 'x', value: ROAD_W / 2 + 2.0 }, { axis: 'x', value: -ROAD_W / 2 - 2.0 },
    ];
    crosswalks.forEach(({ axis, value }) => {
      for (let i = -9; i <= 9; i += 2.2) {
        if (axis === 'z') this.addRealisticRoadStripe(ground, i, value, 1.05, 6.2, markingMat);
        else this.addRealisticRoadStripe(ground, value, i, 6.2, 1.05, markingMat);
      }
    });

    [-ROAD_W / 2 - 1.1, ROAD_W / 2 + 1.1].forEach(z => {
      this.addRealisticRoadStripe(ground, -8.5, z, 0.18, 8, markingMat);
      this.addRealisticRoadStripe(ground, 8.5, z, 0.18, 8, markingMat);
    });

    const lampMat = new THREE.MeshStandardMaterial({ color: 0x303535, metalness: 0.62, roughness: 0.42 });
    const lampLightMat = new THREE.MeshStandardMaterial({
      color: p.streetLight,
      emissive: p.streetLight,
      emissiveIntensity: this.visualPreset === 'night' ? 1.1 : 0.25,
      roughness: 0.32,
    });
    [[-17, -17], [17, -17], [-17, 17], [17, 17]].forEach(([x, z], index) => {
      const lamp = new THREE.Group();
      lamp.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 6.5, 12), lampMat);
      pole.position.y = 3.25;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 10), lampMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(index % 2 === 0 ? 0.85 : -0.85, 6.25, 0);
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.18, 0.82, 0.08, 3), lampLightMat);
      head.position.set(index % 2 === 0 ? 1.65 : -1.65, 6.18, 0);
      head.castShadow = true;
      lamp.add(pole, arm, head);
      ground.add(lamp);
      if (this.visualPreset !== 'day') {
        const light = new THREE.PointLight(p.streetLight, this.visualPreset === 'night' ? 1.7 : 0.65, 19, 2);
        light.position.set(x + (index % 2 === 0 ? 1.65 : -1.65), 6, z);
        ground.add(light);
      }
    });

    this.scene.add(ground);
  }

  private addBuildingWindows(
    group: THREE.Group,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    material: THREE.Material,
  ) {
    const rows = Math.max(2, Math.floor(height / 5));
    const colsFront = Math.max(2, Math.floor(width / 4));
    const colsSide = Math.max(2, Math.floor(depth / 4));
    for (let row = 0; row < rows; row++) {
      const y = 3.4 + row * 4.4;
      if (y > height - 1.5) continue;
      for (let col = 0; col < colsFront; col++) {
        const wx = x - width / 2 + 2.1 + col * ((width - 4.2) / Math.max(1, colsFront - 1));
        const front = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.25, 0.06), material);
        front.position.set(wx, y, z + depth / 2 + 0.035);
        group.add(front);
        const back = front.clone();
        back.position.z = z - depth / 2 - 0.035;
        group.add(back);
      }
      for (let col = 0; col < colsSide; col++) {
        const wz = z - depth / 2 + 2.1 + col * ((depth - 4.2) / Math.max(1, colsSide - 1));
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.25, 1.45), material);
        side.position.set(x + width / 2 + 0.035, y, wz);
        group.add(side);
      }
    }
  }

  private buildRealisticBuildings() {
    const p = this.profile;
    const buildings = new THREE.Group();
    const windowMat = new THREE.MeshStandardMaterial({
      color: p.window,
      emissive: p.window,
      emissiveIntensity: this.visualPreset === 'night' ? 0.22 : this.visualPreset === 'dusk' ? 0.11 : 0.025,
      roughness: 0.38,
      metalness: 0.08,
      transparent: true,
      opacity: this.visualPreset === 'day' ? 0.62 : 0.72,
      depthWrite: false,
    });
    const layouts: Array<[number, number, number, number, number, number]> = [
      [-55, -55, 25, 18, 28, p.building], [-86, -74, 22, 24, 44, p.buildingAlt],
      [55, -55, 30, 20, 36, p.buildingAlt], [84, -76, 25, 24, 52, p.building],
      [-60, 64, 25, 19, 31, p.buildingAlt], [-90, 84, 22, 26, 36, p.building],
      [60, 64, 25, 20, 34, p.building], [91, 84, 28, 22, 48, p.buildingAlt],
    ];
    layouts.forEach(([x, z, width, depth, height, color], index) => {
      const facadeMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: this.visualPreset === 'night' ? 0.05 : 0.035,
        roughness: 0.83,
        metalness: 0.04,
      });
      const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 0.35, 3), facadeMat);
      building.position.set(x, height / 2 - 0.05, z);
      building.castShadow = true;
      building.receiveShadow = true;
      buildings.add(building);
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.92, 0.18, depth * 0.92),
        new THREE.MeshStandardMaterial({ color: 0x40494a, roughness: 0.9 }),
      );
      roof.position.set(x, height + 0.08, z);
      roof.castShadow = true;
      buildings.add(roof);
      this.addBuildingWindows(buildings, x, z, width, depth, height, windowMat);
      if (index % 2 === 0) {
        const entrance = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 3.2, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 0.3, metalness: 0.18 }),
        );
        entrance.position.set(x, 1.55, z + depth / 2 + 0.045);
        buildings.add(entrance);
      }
    });

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3d31, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.visualPreset === 'night' ? 0x273c35 : 0x496957,
      roughness: 1,
    });
    const leafMatDark = new THREE.MeshStandardMaterial({
      color: this.visualPreset === 'night' ? 0x1e302b : 0x3e594c,
      roughness: 1,
    });
    [[-20, -28], [20, -28], [-23, 28], [23, 28], [-29, -20], [29, 20]].forEach(([x, z]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 2.2, 8), trunkMat);
      trunk.position.y = 1.1;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 14), leafMat);
      canopy.position.y = 2.5;
      canopy.scale.set(1.18, 1.0, 1.18);
      const canopySide = new THREE.Mesh(new THREE.SphereGeometry(1.02, 18, 12), leafMatDark);
      canopySide.position.set(0.72, 2.35, 0.2);
      const canopyTop = new THREE.Mesh(new THREE.SphereGeometry(0.86, 18, 12), leafMat);
      canopyTop.position.set(-0.48, 3.12, -0.18);
      tree.add(trunk, canopy, canopySide, canopyTop);
      tree.position.set(x, 0, z);
      tree.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      buildings.add(tree);
    });
    this.scene.add(buildings);
  }

  private buildRealisticTrafficLights() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x33393a, metalness: 0.65, roughness: 0.43 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x171b1c, metalness: 0.25, roughness: 0.46 });
    const mkTL = (x: number, z: number, phase: string, armDirection: 1 | -1) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 5.7, 12), poleMat);
      pole.position.y = 2.85;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.7, 10), poleMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(armDirection * 1.15, 5.45, 0);
      const housing = new THREE.Mesh(new RoundedBoxGeometry(0.68, 1.85, 0.46, 0.08, 3), housingMat);
      housing.position.set(armDirection * 2.3, 5.1, 0);
      const lights: { mesh: THREE.Mesh; color: number }[] = [];
      [T.red, T.orange, T.green].forEach((color, index) => {
        const mat = new THREE.MeshStandardMaterial({
          color: 0x222526,
          emissive: color,
          emissiveIntensity: 0.08,
          roughness: 0.3,
        });
        const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat);
        light.position.set(armDirection * 2.3, 5.68 - index * 0.55, 0.25);
        g.add(light);
        lights.push({ mesh: light, color });
      });
      g.add(pole, arm, housing);
      g.userData = { phase, lights, timer: 0 };
      g.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.scene.add(g);
      this.trafficLights.push(g);
    };
    mkTL(-10, 10, 'green', 1);
    mkTL(10, -10, 'green', -1);
    mkTL(10, 10, 'red', -1);
    mkTL(-10, -10, 'yellow', 1);
  }

  private buildRealisticRSUs() {
    const p = this.profile;
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x303838, metalness: 0.74, roughness: 0.38 });
    const deviceMat = new THREE.MeshStandardMaterial({ color: 0x1b2426, metalness: 0.28, roughness: 0.34 });
    const lensMat = new THREE.MeshStandardMaterial({ color: p.accent, emissive: p.accent, emissiveIntensity: 0.35, roughness: 0.23 });
    const mkRSU = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 8.5, 12), metalMat);
      pole.position.y = 4.25;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10), metalMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(0.4, 8.1, 0);
      const head = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.68, 0.72, 0.12, 4), deviceMat);
      head.position.set(0.9, 8.0, 0);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 16), lensMat);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(1.48, 8.0, 0);
      const ringMat = new THREE.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(18, 18.15, 64), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      const coneMat = new THREE.MeshBasicMaterial({ color: p.accent, transparent: true, opacity: 0.012, side: THREE.DoubleSide, depthWrite: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(8, 8, 32, 1, true), coneMat);
      cone.rotation.x = Math.PI;
      cone.position.y = 4;
      g.add(pole, arm, head, lens, ring, cone);
      g.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.scene.add(g);
      this.rsuObjects.push({ group: g, ringMat, coneMat, color: p.accent });
    };
    mkRSU(-15, 15);
    mkRSU(15, -15);
  }

  private createRealisticVehicle(color: number, isEgo = false) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.52, roughness: 0.25, clearcoat: 0.48, clearcoatRoughness: 0.18 });
    const lowerMat = new THREE.MeshStandardMaterial({ color: 0x202628, metalness: 0.5, roughness: 0.45 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x172329, metalness: 0.12, roughness: 0.12, clearcoat: 0.6, transparent: true, opacity: 0.96 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x171a1b, roughness: 0.92, metalness: 0.02 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9ba3a0, roughness: 0.35, metalness: 0.7 });
    const lampFrontMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cf,
      emissive: 0xffe0a0,
      emissiveIntensity: this.visualPreset === 'night' ? 0.9 : 0.18,
      roughness: 0.28,
    });
    const lampRearMat = new THREE.MeshStandardMaterial({
      color: 0x7e2525,
      emissive: 0xaa1717,
      emissiveIntensity: this.visualPreset === 'night' ? 0.62 : 0.1,
      roughness: 0.35,
    });

    const body = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.72, 4.65, 0.18, 4), bodyMat);
    body.position.y = 0.72;
    const lower = new THREE.Mesh(new RoundedBoxGeometry(2.16, 0.25, 4.45, 0.08, 3), lowerMat);
    lower.position.y = 0.38;
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.72, 2.35, 0.22, 4), bodyMat);
    cabin.position.set(0, 1.28, 0.18);
    const windshieldFront = new THREE.Mesh(new RoundedBoxGeometry(1.34, 0.38, 0.045, 0.035, 2), glassMat);
    windshieldFront.position.set(0, 1.43, -0.99);
    const windshieldRear = new THREE.Mesh(new RoundedBoxGeometry(1.34, 0.34, 0.045, 0.035, 2), glassMat);
    windshieldRear.position.set(0, 1.42, 1.35);
    const sideWindowLeft = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.36, 1.45, 0.035, 2), glassMat);
    sideWindowLeft.position.set(-0.875, 1.42, 0.18);
    const sideWindowRight = sideWindowLeft.clone();
    sideWindowRight.position.x = 0.875;
    group.add(body, lower, cabin, windshieldFront, windshieldRear, sideWindowLeft, sideWindowRight);

    const wheelGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 20);
    const hubGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.25, 16);
    [-1, 1].forEach(side => [-1.45, 1.45].forEach(z => {
      const wheel = new THREE.Mesh(wheelGeometry, tireMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.04, 0.38, z);
      const hub = new THREE.Mesh(hubGeometry, rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(side * 1.17, 0.38, z);
      group.add(wheel, hub);
    }));

    [-0.63, 0.63].forEach(x => {
      const headlamp = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.14, 0.06, 0.03, 2), lampFrontMat);
      headlamp.position.set(x, 0.79, -2.33);
      const taillamp = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.14, 0.06, 0.03, 2), lampRearMat);
      taillamp.position.set(x, 0.79, 2.33);
      group.add(headlamp, taillamp);
    });
    [-1, 1].forEach(side => {
      const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.13, 0.26, 0.04, 2), lowerMat);
      mirror.position.set(side * 1.08, 1.25, -0.75);
      group.add(mirror);
    });

    if (isEgo) {
      const lidar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.14, 20), lowerMat);
      lidar.position.set(0, 1.71, -0.56);
      const aura = new THREE.Mesh(
        new THREE.BoxGeometry(2.34, 1.75, 4.92),
        new THREE.MeshBasicMaterial({ color: this.profile.accent, wireframe: true, transparent: true, opacity: 0 }),
      );
      aura.position.y = 0.9;
      group.add(lidar, aura);
      this.egoAuraMat = aura.material as THREE.MeshBasicMaterial;
      this.egoV2xLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(-15, 8, 15)]),
        new THREE.LineBasicMaterial({ color: this.profile.accent, transparent: true, opacity: 0 }),
      );
      group.add(this.egoV2xLine);
    }
    group.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return group;
  }

  private buildRealisticVehicles() {
    const egoColor = this.visualPreset === 'night' ? 0x9ba9aa : 0xc8c7be;
    this.egoCar = this.createRealisticVehicle(egoColor, true);
    this.scene.add(this.egoCar);

    this.truck = new THREE.Group();
    this.truck.position.set(6, 0, 15);
    const truckBodyMat = new THREE.MeshPhysicalMaterial({ color: 0x56646a, metalness: 0.36, roughness: 0.42, clearcoat: 0.2 });
    const truckCabMat = new THREE.MeshPhysicalMaterial({ color: 0x9a9c92, metalness: 0.3, roughness: 0.36, clearcoat: 0.25 });
    const truckGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x26353a, metalness: 0.1, roughness: 0.16, clearcoat: 0.55 });
    const truckCab = new THREE.Mesh(new RoundedBoxGeometry(3.05, 2.7, 2.75, 0.2, 4), truckCabMat);
    truckCab.position.set(0, 1.5, -2.35);
    const truckWindshield = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.72, 0.05, 0.04, 2), truckGlassMat);
    truckWindshield.position.set(0, 2.0, -3.75);
    const trailer = new THREE.Mesh(new RoundedBoxGeometry(3.28, 3.55, 5.8, 0.18, 4), truckBodyMat);
    trailer.position.set(0, 2.0, 1.15);
    const trailerSide = new THREE.Mesh(new THREE.BoxGeometry(3.12, 2.3, 0.04), new THREE.MeshStandardMaterial({ color: 0x738083, roughness: 0.8 }));
    trailerSide.position.set(1.64, 2.0, 1.15);
    const trailerStripe = new THREE.Mesh(new THREE.BoxGeometry(3.14, 0.16, 0.05), new THREE.MeshStandardMaterial({ color: 0xc7b887, roughness: 0.62 }));
    trailerStripe.position.set(1.665, 1.25, 1.15);
    const blind = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.04, 8),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0.015, depthWrite: false }),
    );
    blind.position.set(4.5, 0.04, 0);
    this.truck.add(truckCab, truckWindshield, trailer, trailerSide, trailerStripe, blind);
    [-1, 1].forEach(side => [-2.15, 1.05, 2.5].forEach(z => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.28, 20), new THREE.MeshStandardMaterial({ color: 0x171a1b, roughness: 0.94 }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.6, 0.48, z);
      this.truck.add(wheel);
    }));
    this.truck.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.scene.add(this.truck);

    const colors = [0x697474, 0x7b6c5f, 0x42535a, 0x9b9b91, 0x4d5658, 0x7d7770];
    const positions = [-76, -48, -21, 27, 55, 83];
    for (let i = 0; i < 12; i++) {
      const isVertical = i % 2 === 0;
      const lane = isVertical ? (i % 4 === 0 ? -6 : 6) : (i % 4 === 0 ? -6 : 6);
      const pos = positions[Math.floor(i / 2)];
      const car = this.createRealisticVehicle(colors[i % colors.length]);
      if (isVertical) {
        car.position.set(lane, 0, pos);
        if (lane > 0) car.rotation.y = Math.PI;
      } else {
        car.position.set(pos, 0, lane);
        car.rotation.y = lane < 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      car.userData = { isVertical, speed: 18 + (i % 5) * 4, lane };
      this.scene.add(car);
      this.trafficCars.push(car);
    }
  }

  private buildRealisticPedestrian() {
    this.pedestrian = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xc99376, roughness: 0.62 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x3e5660, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.84 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x15191b, roughness: 0.9 });
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.58, 0.95, 0.36, 0.1, 3), shirtMat);
    torso.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skinMat);
    head.position.y = 1.8;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshStandardMaterial({ color: 0x24201e, roughness: 0.9 }),
    );
    hair.position.y = 1.89;
    [-1, 1].forEach(side => {
      const leg = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.82, 0.2, 0.05, 2), pantsMat);
      leg.position.set(side * 0.16, 0.46, 0);
      const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.12, 0.42, 0.04, 2), shoeMat);
      shoe.position.set(side * 0.16, 0.07, -0.08);
      const arm = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.68, 0.16, 0.05, 2), shirtMat);
      arm.position.set(side * 0.4, 1.08, 0);
      arm.rotation.z = side * -0.12;
      this.pedestrian.add(leg, shoe, arm);
    });
    this.pedWarn = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 32),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.pedWarn.rotation.x = -Math.PI / 2;
    this.pedWarn.position.y = 0.04;
    this.pedestrian.add(torso, head, hair, this.pedWarn);
    this.pedestrian.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    this.scene.add(this.pedestrian);
  }

  private buildRealisticParticles() {
    const count = 20;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.sin(i * 9.17) * 0.5) * 80;
      pos[i * 3 + 1] = 1 + (i % 5) * 1.8;
      pos[i * 3 + 2] = (Math.cos(i * 7.31) * 0.5) * 80;
      vel[i] = 0.002 + (i % 3) * 0.001;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: this.profile.sky, size: 0.035, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.particles.userData.velocities = vel;
    this.scene.add(this.particles);
  }

  private buildGround() {
    const layout = createIntersectionLayout();
    ['traffic-signals', 'streetscape'].forEach((name) => {
      const discardedBranch = layout.getObjectByName(name);
      if (!discardedBranch) return;
      this.disposeObject3D(discardedBranch);
      discardedBranch.removeFromParent();
    });

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(280, 280),
      new THREE.MeshStandardMaterial({ color: DEFAULT_SCENE_STYLE.palette.ground, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground, layout);
  }

  private buildBuildings() {
    const streetscape = new THREE.Group();
    streetscape.name = 'night-streetscape';

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
        new THREE.MeshStandardMaterial({ color: DEFAULT_SCENE_STYLE.palette.metal, roughness: 0.8 }),
      );
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.55, 0.55).translate(0, 7.15, 0),
        new THREE.MeshStandardMaterial({ color: DEFAULT_SCENE_STYLE.palette.glass, roughness: 0.65 }),
      );
      const antenna = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.45, 0.08).translate(0, 7.65, 0),
        new THREE.MeshStandardMaterial({ color: DEFAULT_SCENE_STYLE.palette.metal, roughness: 0.85 }),
      );
      const ringMat = new THREE.MeshBasicMaterial({ color: T.cyan, transparent: true, opacity: 0.08, depthWrite: false });
      const coneMat = new THREE.MeshBasicMaterial({ color: T.blue, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide });
      g.add(pole, head, antenna);
      this.scene.add(g);
      this.rsuObjects.push({ group: g, ringMat, coneMat, color: T.cyan });
    };
    mkRSU(-15, 15); mkRSU(15, -15);
  }

  private buildVehicles() {
    const mkVehicle = (vehicleClass: 'car' | 'truck' | 'bus', isEgo = false) => {
      const g = createRealtimeActorModel({ class: vehicleClass, modelType: 'vehicle' });
      if (isEgo) {
        const lidar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.3).translate(0, 1.3, -0.5),
          new THREE.MeshStandardMaterial({ color: DEFAULT_SCENE_STYLE.palette.metal, roughness: 0.5 }),
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
      new THREE.Color(DEFAULT_SCENE_STYLE.palette.metal),
      new THREE.Color(DEFAULT_SCENE_STYLE.palette.glass),
      new THREE.Color(DEFAULT_SCENE_STYLE.palette.generic),
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
      size: 0.12, transparent: true, opacity: 0.1, vertexColors: true,
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
        (l.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isActive
          ? SIGNAL_EMISSIVE.active
          : SIGNAL_EMISSIVE.inactive;
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
  setScenarioVisual(spec: ScenarioVisualSpec): void {
    this.scenarioVisualSpec = spec;
    this.attachScenarioVisualContext();
  }

  private attachScenarioVisualContext(): void {
    if (!this.scene || !this.scenarioVisualSpec) return;
    if (this.scenarioContextGroup) {
      this.scene.remove(this.scenarioContextGroup);
      this.disposeObject3D(this.scenarioContextGroup);
    }
    this.scenarioContextGroup = createScenarioVisualContext(this.scenarioVisualSpec);
    this.scene.add(this.scenarioContextGroup);

    const signalMode = this.scenarioVisualSpec.visualContext.signalMode;
    this.trafficLights.forEach((trafficLight) => {
      trafficLight.visible = signalMode !== 'none';
      if (signalMode === 'yellow_to_red') {
        trafficLight.userData.phase = 'yellow';
        trafficLight.userData.timer = 0;
      }
    });
  }

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
    this.renderRealtimeTrajectories();
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
      this.realtimeTrajectoryGroup.visible = false;
      this.truck.visible = true;
      this.pedestrian.visible = true;
    } else {
      this.realtimeObjectsGroup.visible = true;
      this.realtimeTrajectoryGroup.visible = true;
      this.truck.visible = false;
      this.pedestrian.visible = false;
    }
  }

  clearDynamicObjects(): void {
    this.realtimePool?.clear();
    this.clearRealtimeTrajectories();
  }

  private confidenceColor(confidence: number | undefined): THREE.Color {
    const normalized = Math.max(0, Math.min(1, Number(confidence ?? 0)));
    return new THREE.Color(0xef4444).lerp(new THREE.Color(0x22c55e), normalized);
  }

  private clearRealtimeTrajectories(): void {
    if (!this.realtimeTrajectoryGroup) return;
    for (const child of [...this.realtimeTrajectoryGroup.children]) {
      this.realtimeTrajectoryGroup.remove(child);
      const line = child as THREE.Line;
      line.geometry?.dispose();
      const material = line.material;
      if (Array.isArray(material)) material.forEach(item => item.dispose());
      else material?.dispose();
    }
  }

  private renderRealtimeTrajectories(): void {
    if (!this.realtimeTrajectoryGroup || !this.realtimePool) return;
    this.clearRealtimeTrajectories();
    for (const state of this.realtimePool.snapshot()) {
      const color = this.confidenceColor(state.predictionConfidence ?? state.confidence);
      if (state.historyTrajectory.length >= 2) {
        const history = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            state.historyTrajectory.map(point => new THREE.Vector3(point.x, 0.22, point.z)),
          ),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.78 }),
        );
        history.name = `history-${state.key}`;
        this.realtimeTrajectoryGroup.add(history);
      }
      if (state.predictedTrajectory.length >= 1) {
        const prediction = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(state.position.x, 0.3, state.position.z),
            ...state.predictedTrajectory.map(point => new THREE.Vector3(point.x, 0.3, point.z)),
          ]),
          new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.95 }),
        );
        prediction.computeLineDistances();
        prediction.name = `prediction-${state.key}`;
        this.realtimeTrajectoryGroup.add(prediction);
      }
    }
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
    if (this.scenarioVisualSpec?.visualContext.signalMode === 'none') return [];
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
        this.realtimePool?.advance(delta);

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
    if (this.scene) this.disposeObject3D(this.scene);
    this.composer?.dispose();
    this.controls?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
