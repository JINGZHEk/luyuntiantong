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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const T = {
  bg: 0x030712, road: 0x080c16, grid: 0x0a1930,
  cyan: 0x00f3ff, blue: 0x0088ff, red: 0xff2a55,
  green: 0x00ffaa, orange: 0xffaa00, purple: 0xa855f7,
};
const ROAD_W = 24;
const SCENARIO_DUR = 12;
const EVT = { pedStart: 3, rsuDetect: 4.5, v2xWarn: 5, brakeStart: 5.5, stopTime: 7.5, safeCross: 9.5 };

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
  bloomStrength = 1.5;
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
  private pedWarn!: THREE.Mesh;
  private egoAuraMat!: THREE.MeshBasicMaterial;
  private egoV2xLine!: THREE.Line;

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
    this.scene.fog = new THREE.FogExp2(T.bg, 0.008);
    this.scene.background = new THREE.Color(T.bg);

    /* camera */
    this.camera = new THREE.PerspectiveCamera(45, w / h, 1, 500);
    this.camera.position.set(100, 100, 100);

    /* post‑processing */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), this.bloomStrength, 0.4, 0.1);
    this.composer.addPass(this.bloomPass);

    /* controls */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.maxDistance = 250;

    /* lights */
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const dir = new THREE.DirectionalLight(0xaaccff, 1.5);
    dir.position.set(50, 100, 20);
    this.scene.add(dir);
    const pl1 = new THREE.PointLight(T.cyan, 0.8, 30); pl1.position.set(0, 12, 0); this.scene.add(pl1);
    const pl2 = new THREE.PointLight(T.green, 0.4, 25); pl2.position.set(-15, 8, -15); this.scene.add(pl2);
    const pl3 = new THREE.PointLight(T.purple, 0.3, 25); pl3.position.set(15, 8, 15); this.scene.add(pl3);

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

    /* resize */
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
  }

  /* -------------------------------------------------------------- */
  /*  Build scene objects                                              */
  /* -------------------------------------------------------------- */
  private buildGround() {
    const g = new THREE.Group();
    /* grid */
    const grid = new THREE.GridHelper(400, 100, T.grid, T.grid);
    grid.position.y = -0.1;
    (grid.material as THREE.Material).opacity = 0.5;
    (grid.material as THREE.Material).transparent = true;
    g.add(grid);

    /* roads */
    const mat = new THREE.MeshStandardMaterial({ color: T.road, roughness: 0.9, depthWrite: false });
    const rZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 400), mat);
    rZ.rotation.x = -Math.PI / 2; g.add(rZ);
    const rX = new THREE.Mesh(new THREE.PlaneGeometry(400, ROAD_W), mat);
    rX.rotation.x = -Math.PI / 2; rX.position.y = 0.01; g.add(rX);

    /* edge lines */
    const addLine = (pts: THREE.Vector3[], color: number, op = 0.5) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }),
      );
      g.add(l);
    };
    [-ROAD_W / 2, ROAD_W / 2].forEach(x => {
      addLine([new THREE.Vector3(x, 0.02, -200), new THREE.Vector3(x, 0.02, 200)], T.cyan);
      addLine([new THREE.Vector3(-200, 0.02, x), new THREE.Vector3(200, 0.02, x)], T.cyan);
    });

    /* crosswalk */
    const cwMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
    for (let i = 0; i < 8; i++) {
      const z = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 8), cwMat);
      z.rotation.x = -Math.PI / 2;
      z.position.set(-10 + i * 2.8, 0.03, ROAD_W / 2 + 2);
      g.add(z);
    }

    /* dashed center lane markings */
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.35 });
    for (let i = -20; i < 20; i++) {
      if (Math.abs(i) < 2) continue; /* skip intersection center */
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 3), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.025, i * 5);
      g.add(dash);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.3), dashMat);
      dashH.rotation.x = -Math.PI / 2;
      dashH.position.set(i * 5, 0.025, 0);
      g.add(dashH);
    }

    /* subtle road edge glow strips */
    const glowMat = new THREE.MeshBasicMaterial({ color: T.cyan, transparent: true, opacity: 0.04, depthWrite: false });
    const stripW = 1.5;
    [-ROAD_W / 2, ROAD_W / 2].forEach(x => {
      const sZ = new THREE.Mesh(new THREE.PlaneGeometry(stripW, 400), glowMat);
      sZ.rotation.x = -Math.PI / 2; sZ.position.set(x, 0.015, 0); g.add(sZ);
      const sX = new THREE.Mesh(new THREE.PlaneGeometry(400, stripW), glowMat);
      sX.rotation.x = -Math.PI / 2; sX.position.set(0, 0.015, x); g.add(sX);
    });
    this.scene.add(g);
  }

  private buildBuildings() {
    const buildings = new THREE.Group();
    const bMats = [
      new THREE.MeshStandardMaterial({ color: 0x050a15, roughness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x081020, roughness: 0.3 }),
    ];
    const edgeColors = [T.cyan, T.purple, T.blue, T.green, 0x4466ff, 0x22cccc];
    const windowColors = [0x00f3ff, 0xa855f7, 0x0088ff, 0xffaa00, 0x00ffaa, 0xff6644];
    const addBlock = (cx: number, cz: number) => {
      for (let i = 0; i < 6; i++) {
        const w = 10 + Math.random() * 15, d = 10 + Math.random() * 15, h = 20 + Math.random() * 60;
        const x = cx + (Math.random() - 0.5) * 40, z = cz + (Math.random() - 0.5) * 40;
        if (Math.abs(x) < ROAD_W / 2 + 10 && Math.abs(z) < ROAD_W / 2 + 10) return;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMats[Math.floor(Math.random() * 2)]);
        b.position.set(x, h / 2, z);
        const edgeColor = edgeColors[Math.floor(Math.random() * edgeColors.length)];
        const edges = new THREE.EdgesGeometry(b.geometry);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.12 + Math.random() * 0.1 }));
        line.position.copy(b.position);
        buildings.add(b, line);
        /* window lights — small emissive dots on building faces */
        const winCount = Math.floor(3 + Math.random() * 5);
        for (let j = 0; j < winCount; j++) {
          const winColor = windowColors[Math.floor(Math.random() * windowColors.length)];
          const wy = h * 0.2 + Math.random() * h * 0.7;
          const side = Math.floor(Math.random() * 4);
          const wx = side < 2 ? (side === 0 ? -w / 2 - 0.05 : w / 2 + 0.05) : (Math.random() - 0.5) * w * 0.8;
          const wz = side >= 2 ? (side === 2 ? -d / 2 - 0.05 : d / 2 + 0.05) : (Math.random() - 0.5) * d * 0.8;
          const win = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.8),
            new THREE.MeshBasicMaterial({ color: winColor, transparent: true, opacity: 0.15 + Math.random() * 0.25, side: THREE.DoubleSide, depthWrite: false }),
          );
          win.position.set(x + wx, wy, z + wz);
          if (side < 2) win.rotation.y = Math.PI / 2;
          buildings.add(win);
        }
      }
    };
    addBlock(-60, -60); addBlock(60, -60); addBlock(-60, 60); addBlock(60, 60);
    this.scene.add(buildings);
  }

  private buildTrafficLights() {
    const mkTL = (x: number, z: number, phase: string) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 4, 8).translate(0, 2, 0),
        new THREE.MeshStandardMaterial({ color: 0x333333 }),
      );
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 1.2, 0.3).translate(0, 4.5, 0),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      );
      const lights: { mesh: THREE.Mesh; color: number }[] = [];
      [T.red, T.orange, T.green].forEach(c => {
        const idx = [T.red, T.orange, T.green].indexOf(c);
        const s = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8).translate(0, 4.8 - idx * 0.35, 0.16),
          new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 }),
        );
        g.add(s);
        lights.push({ mesh: s, color: c });
      });
      g.add(pole, box);
      g.userData = { phase, lights, timer: 0 };
      this.scene.add(g);
      this.trafficLights.push(g);
    };
    mkTL(-10, 10, 'green'); mkTL(10, -10, 'green');
    mkTL(10, 10, 'red'); mkTL(-10, -10, 'yellow');
  }

  private buildRSUs() {
    const mkRSU = (x: number, z: number, color: number = T.cyan) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 12, 8).translate(0, 6, 0),
        new THREE.MeshStandardMaterial({ color: 0x222222 }),
      );
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 1).translate(0, 12.5, 0),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1 }),
      );
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 0.1, 32).translate(0, 0.5, 0), ringMat);
      const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(18, 12, 16, 1, true).translate(0, 6, 0), coneMat);
      g.add(pole, head, ring, cone);
      this.scene.add(g);
      this.rsuObjects.push({ group: g, ringMat, coneMat, color });
    };
    mkRSU(-15, 15, T.cyan); mkRSU(15, -15, T.purple);
  }

  private buildVehicles() {
    const mkVehicle = (color: number, isEgo = false) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.2, 5).translate(0, 0.8, 0),
        new THREE.MeshStandardMaterial({ color, roughness: 0.2 }),
      );
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(2.3, 0.6, 2.8).translate(0, 1.6, -0.2),
        new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.1 }),
      );
      g.add(body, glass);
      if (isEgo) {
        const lidar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.3).translate(0, 2, -0.5),
          new THREE.MeshBasicMaterial({ color: T.cyan }),
        );
        const aura = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 2, 5.4).translate(0, 1.2, 0),
          new THREE.MeshBasicMaterial({ color: T.cyan, wireframe: true, transparent: true, opacity: 0.2 }),
        );
        g.add(lidar, aura);
        this.egoAuraMat = aura.material as THREE.MeshBasicMaterial;
        /* V2X line */
        const v2x = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 2, 0), new THREE.Vector3(-15, 12, 15)]),
          new THREE.LineBasicMaterial({ color: T.blue, transparent: true, opacity: 0 }),
        );
        g.add(v2x);
        this.egoV2xLine = v2x;
        /* sensor cone */
        const sCone = new THREE.Mesh(
          new THREE.ConeGeometry(6, 18, 12, 1, true).rotateX(Math.PI / 2).translate(0, 1, -12),
          new THREE.MeshBasicMaterial({ color: T.cyan, transparent: true, opacity: 0.04, side: THREE.DoubleSide, depthWrite: false }),
        );
        g.add(sCone);
      }
      return g;
    };

    /* ego */
    this.egoCar = mkVehicle(0x111111, true);
    this.scene.add(this.egoCar);

    /* truck */
    this.truck = new THREE.Group();
    this.truck.position.set(6, 0, 15);
    this.truck.add(new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 3.5, 8).translate(0, 2.5, 1),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    ));
    this.truck.add(new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.5, 2.5).translate(0, 2, -4),
      new THREE.MeshStandardMaterial({ color: 0x334455 }),
    ));
    const blind = new THREE.Mesh(
      new THREE.BoxGeometry(10, 0.1, 8).translate(5, 0.1, 0),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0.1, depthWrite: false }),
    );
    this.truck.add(blind);
    this.scene.add(this.truck);

    /* traffic cars */
    const trafficColors = [0x1a2a44, 0x2a1a3a, 0x1a3a2a, 0x333344, 0x2a2a3a, 0x1a2a3a, 0x3a2a1a, 0x222233];
    const laneX = [-6, 6], laneZ = [-6, 6];
    for (let i = 0; i < 12; i++) {
      const tc = mkVehicle(trafficColors[i % trafficColors.length]);
      const isV = i % 2 === 0;
      const lane = isV ? laneX[i % 2] : laneZ[i % 2];
      const pos = Math.random() * 200 - 100;
      if (isV) { tc.position.set(lane, 0, pos); if (lane > 0) tc.rotation.y = Math.PI; }
      else { tc.position.set(pos, 0, lane); tc.rotation.y = lane < 0 ? Math.PI / 2 : -Math.PI / 2; }
      tc.userData = { isVertical: isV, speed: 20 + Math.random() * 20, lane };
      this.scene.add(tc);
      this.trafficCars.push(tc);
    }
  }

  private buildPedestrian() {
    this.pedestrian = new THREE.Group();
    this.pedestrian.add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 1.8).translate(0, 0.9, 0),
      new THREE.MeshStandardMaterial({ color: 0xffccaa }),
    ));
    this.pedWarn = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 0.1).translate(0, 0.1, 0),
      new THREE.MeshBasicMaterial({ color: T.red, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.pedestrian.add(this.pedWarn);
    this.scene.add(this.pedestrian);
  }

  private buildParticles() {
    const count = 150;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    const particlePalette = [
      new THREE.Color(T.cyan), new THREE.Color(T.cyan), new THREE.Color(T.cyan),
      new THREE.Color(T.purple), new THREE.Color(T.purple),
      new THREE.Color(T.blue), new THREE.Color(T.blue),
      new THREE.Color(T.green), new THREE.Color(0x4466ff),
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
      size: 0.15, transparent: true, opacity: 0.6, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
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
    this.coverageGroup.visible = false;
    this.rsuObjects.forEach(r => {
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(25, 25, 0.2, 32),
        new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
      );
      disc.position.copy(r.group.position);
      disc.position.y = 0.3;
      this.coverageGroup.add(disc);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(24.5, 25, 32),
        new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(r.group.position);
      ring.position.y = 0.4;
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
    this.trajLines.visible = mode === 'traffic';
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
  private updateScenario(delta: number) {
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
      (this.egoV2xLine.material as THREE.LineBasicMaterial).opacity = 1;
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
        (l.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isActive ? 1.0 : 0.1;
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
        if (this.mode === 'ego') this.updateScenario(delta);
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
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
