import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ScenarioVisualSpec } from './scenarioCatalog';

export interface ActorVisualState {
  class: string;
  subtype?: string;
  modelType: 'person' | 'bicycle' | 'vehicle' | 'generic';
}

export const DEFAULT_SCENE_STYLE = {
  background: 0x030712,
  bloomStrength: 0.16,
  scanlineOpacity: 0.018,
  fogNear: 120,
  fogFar: 320,
  toneMappingExposure: 1.05,
  maxPixelRatio: 1.5,
  shadowMapSize: 1024,
  palette: {
    ground: 0x0d1721,
    road: 0x080c16,
    curb: 0x24303a,
    sidewalk: 0x111d28,
    marking: 0xb9b4a3,
    yellowMarking: 0x8b7545,
    building: 0x0d151d,
    window: 0x6e624d,
    windowGlow: 0xb09a72,
    treeTrunk: 0x211b18,
    treeCanopy: 0x13251f,
    metal: 0x334351,
    glass: 0x273c4e,
    person: 0x607789,
    bicycle: 0x4e8f83,
    vehicle: 0x3c5669,
    generic: 0x657080,
    cyan: 0x72cbd0,
    blue: 0x6e86ad,
    red: 0xd56f72,
    green: 0x76a889,
    orange: 0xb4975f,
  },
} as const;

const COLORS = DEFAULT_SCENE_STYLE.palette;

function standardMaterial(color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0.1,
    emissiveIntensity: 0,
    ...options,
  });
}

function basicMaterial(color: number, options: THREE.MeshBasicMaterialParameters = {}) {
  return new THREE.MeshBasicMaterial({ color, ...options });
}

function mesh<T extends THREE.BufferGeometry>(
  name: string,
  geometry: T,
  material: THREE.Material,
): THREE.Mesh<T, THREE.Material> {
  const result = new THREE.Mesh(geometry, material);
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function addBox(
  parent: THREE.Object3D,
  name: string,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: THREE.Vector3 | [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const result = mesh(name, new THREE.BoxGeometry(width, height, depth), material);
  result.position.fromArray(position instanceof THREE.Vector3 ? position.toArray() : position);
  parent.add(result);
  return result;
}

function addCylinderBetween(
  parent: THREE.Object3D,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 8,
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const result = mesh(name, new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments), material);
  result.position.copy(start).add(end).multiplyScalar(0.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(result);
  return result;
}

function addSidewalk(parent: THREE.Group, name: string, size: [number, number, number], position: [number, number, number]) {
  const group = new THREE.Group();
  group.name = name;
  addBox(group, `${name}-surface`, size[0], 0.12, size[2], standardMaterial(COLORS.sidewalk), position);
  addBox(group, `${name}-curb`, size[0], 0.18, size[2] + 0.12, standardMaterial(COLORS.curb), [position[0], 0.1, position[2]]);
  parent.add(group);
  return group;
}

function addCrosswalk(parent: THREE.Group, name: string, horizontal: boolean, offset: number) {
  const group = new THREE.Group();
  group.name = name;
  for (let index = 0; index < 5; index += 1) {
    const stripe = mesh(
      `${name}-stripe-${index + 1}`,
      new THREE.PlaneGeometry(horizontal ? 2.8 : 0.55, horizontal ? 0.55 : 2.8),
      basicMaterial(COLORS.marking),
    );
    stripe.rotation.x = -Math.PI / 2;
    if (horizontal) {
      stripe.position.set(-5.6 + index * 2.8, 0.07, offset);
    } else {
      stripe.position.set(offset, 0.07, -5.6 + index * 2.8);
    }
    group.add(stripe);
  }
  parent.add(group);
}

export function createBuilding(width: number, height: number, depth: number): THREE.Group {
  const building = new THREE.Group();
  building.name = 'building';

  addBox(building, 'building-body', width, height, depth, standardMaterial(COLORS.building), [0, height / 2, 0]);

  const windows = new THREE.Group();
  windows.name = 'building-windows';
  const columns = Math.max(1, Math.floor(width / 2));
  const rows = Math.max(1, Math.floor(height / 2.4));
  const windowWidth = Math.min(0.75, Math.max(0.35, width / (columns * 2.4)));
  const windowHeight = Math.min(0.7, Math.max(0.35, height / (rows * 2.8)));
  const windowMaterial = standardMaterial(COLORS.window, {
    emissive: COLORS.windowGlow,
    emissiveIntensity: 0.1,
    roughness: 0.65,
  });

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column - (columns - 1) / 2) * (width / columns);
      const y = 1.2 + row * (height / (rows + 0.3));
      addBox(windows, `window-front-${row + 1}-${column + 1}`, windowWidth, windowHeight, 0.06, windowMaterial, [x, y, depth / 2 + 0.04]);
      addBox(windows, `window-back-${row + 1}-${column + 1}`, windowWidth, windowHeight, 0.06, windowMaterial, [x, y, -depth / 2 - 0.04]);
    }
  }
  building.add(windows);
  return building;
}

export function createTree(): THREE.Group {
  const tree = new THREE.Group();
  tree.name = 'tree';

  const trunk = mesh('tree-trunk', new THREE.CylinderGeometry(0.28, 0.38, 2.4, 8), standardMaterial(COLORS.treeTrunk));
  trunk.position.y = 1.2;
  tree.add(trunk);

  const canopy = mesh('tree-canopy', new THREE.IcosahedronGeometry(1.35, 1), standardMaterial(COLORS.treeCanopy, { roughness: 1 }));
  canopy.position.y = 3.05;
  tree.add(canopy);
  return tree;
}

export function createTrafficSignal(active: 'red' | 'yellow' | 'green'): THREE.Group {
  const signal = new THREE.Group();
  signal.name = 'traffic-signal';
  const darkMaterial = standardMaterial(COLORS.metal, { roughness: 0.72 });

  const pole = mesh('signal-pole', new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), darkMaterial);
  pole.position.y = 1.7;
  signal.add(pole);
  addBox(signal, 'signal-housing', 0.72, 1.65, 0.46, darkMaterial, [0, 3.15, 0]);

  const lampColors: Record<'red' | 'yellow' | 'green', number> = {
    red: COLORS.red,
    yellow: COLORS.orange,
    green: COLORS.green,
  };
  (['red', 'yellow', 'green'] as const).forEach((color, index) => {
    const isActive = color === active;
    const material = standardMaterial(lampColors[color], {
      emissive: lampColors[color],
      emissiveIntensity: isActive ? 0.45 : 0.03,
      roughness: 0.5,
    });
    const lamp = mesh(`signal-${color}`, new THREE.SphereGeometry(0.19, 12, 8), material);
    lamp.position.set(0, 3.65 - index * 0.5, 0.26);
    signal.add(lamp);
  });
  return signal;
}

function createLaneMarkings(): THREE.Group {
  const markings = new THREE.Group();
  markings.name = 'lane-markings';
  const white = basicMaterial(COLORS.marking);
  const yellow = basicMaterial(COLORS.yellowMarking);
  for (let index = -2; index <= 2; index += 1) {
    const vertical = mesh(`lane-marking-vertical-${index}`, new THREE.PlaneGeometry(0.12, 6), white);
    vertical.rotation.x = -Math.PI / 2;
    vertical.position.set(index * 3.1, 0.08, 0);
    markings.add(vertical);
  }
  const horizontal = mesh('lane-marking-centerline', new THREE.PlaneGeometry(6, 0.12), yellow);
  horizontal.rotation.x = -Math.PI / 2;
  horizontal.position.y = 0.08;
  markings.add(horizontal);
  return markings;
}

export function createIntersectionLayout(): THREE.Group {
  const layout = new THREE.Group();
  layout.name = 'intersection-layout';

  const roadSurface = new THREE.Group();
  roadSurface.name = 'road-surface';
  const roadMaterial = standardMaterial(COLORS.road, { roughness: 0.95 });
  const northSouthRoad = mesh('road-surface-north-south', new THREE.PlaneGeometry(18, 220), roadMaterial);
  northSouthRoad.rotation.x = -Math.PI / 2;
  northSouthRoad.position.y = 0.01;
  roadSurface.add(northSouthRoad);
  const eastWestRoad = mesh('road-surface-east-west', new THREE.PlaneGeometry(220, 18), roadMaterial);
  eastWestRoad.rotation.x = -Math.PI / 2;
  eastWestRoad.position.y = 0.012;
  roadSurface.add(eastWestRoad);
  layout.add(roadSurface);

  addSidewalk(layout, 'sidewalk-north', [220, 0.12, 5], [0, 0.16, 11.5]);
  addSidewalk(layout, 'sidewalk-south', [220, 0.12, 5], [0, 0.16, -11.5]);
  addSidewalk(layout, 'sidewalk-east', [5, 0.12, 220], [11.5, 0.16, 0]);
  addSidewalk(layout, 'sidewalk-west', [5, 0.12, 220], [-11.5, 0.16, 0]);

  layout.add(createLaneMarkings());
  const crosswalks = new THREE.Group();
  crosswalks.name = 'crosswalks';
  addCrosswalk(crosswalks, 'crosswalk-north', true, 8.5);
  addCrosswalk(crosswalks, 'crosswalk-south', true, -8.5);
  addCrosswalk(crosswalks, 'crosswalk-east', false, 8.5);
  addCrosswalk(crosswalks, 'crosswalk-west', false, -8.5);
  layout.add(crosswalks);

  const signals = new THREE.Group();
  signals.name = 'traffic-signals';
  (['north', 'east', 'south', 'west'] as const).forEach((direction, index) => {
    const signal = createTrafficSignal(index % 3 === 0 ? 'green' : 'red');
    signal.name = `traffic-signal-${direction}`;
    signal.position.set(
      direction === 'east' ? 10 : direction === 'west' ? -10 : 0,
      0,
      direction === 'north' ? 10 : direction === 'south' ? -10 : 0,
    );
    signal.rotation.y = index * (Math.PI / 2);
    signals.add(signal);
  });
  layout.add(signals);

  const streetscape = new THREE.Group();
  streetscape.name = 'streetscape';
  const northwest = createBuilding(7, 9, 6);
  northwest.name = 'building-northwest';
  northwest.position.set(-16, 0, 16);
  streetscape.add(northwest);
  const southeast = createBuilding(8, 12, 6);
  southeast.name = 'building-southeast';
  southeast.position.set(16, 0, -16);
  streetscape.add(southeast);
  const northeastTree = createTree();
  northeastTree.name = 'tree-northeast';
  northeastTree.position.set(16, 0, 16);
  streetscape.add(northeastTree);
  const southwestTree = createTree();
  southwestTree.name = 'tree-southwest';
  southwestTree.position.set(-16, 0, -16);
  streetscape.add(southwestTree);
  layout.add(streetscape);

  return layout;
}

function createCuePlane(
  name: string,
  width: number,
  depth: number,
  color: number,
  position: [number, number, number],
): THREE.Mesh {
  const cue = mesh(
    name,
    new THREE.PlaneGeometry(width, depth),
    basicMaterial(color, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  );
  cue.rotation.x = -Math.PI / 2;
  cue.position.set(...position);
  return cue;
}

function createCueLine(name: string, points: THREE.Vector3[], color: number): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false }),
  );
  line.name = name;
  line.position.y = 0.11;
  return line;
}

export function createScenarioVisualContext(spec: ScenarioVisualSpec): THREE.Group {
  const context = new THREE.Group();
  context.name = 'scenario-context';
  context.userData.scenarioId = spec.scenario_id;
  context.userData.description = spec.description;

  const { visualContext } = spec;
  const cueColor = visualContext.sensorCue === 'infrared' ? COLORS.orange : COLORS.cyan;
  if (visualContext.occluder !== 'none') {
    context.add(createCuePlane('scenario-occluder-zone', 7.5, 5.5, cueColor, [4, 0.06, 2.8]));
    if (visualContext.occluder === 'building') {
      const corner = addBox(context, 'scenario-corner-blind-wall', 4.5, 4.8, 0.55, standardMaterial(COLORS.building), [8, 2.4, 5.4]);
      corner.castShadow = true;
    }
  }

  if (visualContext.sensorCue === 'infrared') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.5, 3.62, 48),
      basicMaterial(COLORS.orange, { transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.name = 'scenario-infrared-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(4, 0.1, 2.8);
    context.add(ring);
  }

  if (visualContext.signalMode === 'yellow_to_red') {
    context.add(createCuePlane('scenario-signal-transition', 3.2, 1.8, COLORS.orange, [0, 0.08, 0]));
  }
  if (visualContext.signalMode === 'none') {
    context.add(createCueLine('scenario-unsignalized-crossing', [new THREE.Vector3(-7, 0, 0), new THREE.Vector3(7, 0, 0)], COLORS.marking));
  }

  switch (visualContext.conflictCue) {
    case 'cross_traffic':
      context.add(createCueLine('scenario-cross-traffic', [new THREE.Vector3(-12, 0, 4), new THREE.Vector3(12, 0, -4)], cueColor));
      break;
    case 'left_turn':
      context.add(createCueLine('scenario-left-turn-arc', [
        new THREE.Vector3(-10, 0, 0),
        new THREE.Vector3(-4, 0, 0),
        new THREE.Vector3(0, 0, 3),
        new THREE.Vector3(4, 0, 6),
      ], cueColor));
      break;
    case 'ramp_merge':
      context.add(createCueLine('scenario-ramp-merge', [
        new THREE.Vector3(12, 0, 12),
        new THREE.Vector3(8, 0, 8),
        new THREE.Vector3(2, 0, 3),
        new THREE.Vector3(-2, 0, 0),
      ], cueColor));
      break;
    default:
      break;
  }

  switch (visualContext.behavior) {
    case 'consecutive_pedestrians':
      context.add(createCueLine('scenario-sequence-path', [new THREE.Vector3(14, 0, 5), new THREE.Vector3(9, 0, 1), new THREE.Vector3(4, 0, -4)], COLORS.green));
      break;
    case 'pedestrian_return':
      context.add(createCueLine('scenario-return-path', [new THREE.Vector3(14, 0, 5), new THREE.Vector3(9, 0, -1), new THREE.Vector3(11, 0, 5)], COLORS.orange));
      break;
    case 'fast_ebike':
      context.add(createCueLine('scenario-fast-ecycle-path', [new THREE.Vector3(14, 0, 4), new THREE.Vector3(8, 0, 0), new THREE.Vector3(2, 0, -4)], COLORS.red));
      break;
    case 'wrong_way_delivery':
      context.add(createCueLine('scenario-wrong-way-arrow', [new THREE.Vector3(12, 0, -4), new THREE.Vector3(6, 0, 0), new THREE.Vector3(0, 0, 4)], COLORS.orange));
      break;
    case 'bicycle_lane_change':
      context.add(createCueLine('scenario-lane-change', [new THREE.Vector3(14, 0, 3), new THREE.Vector3(8, 0, 3), new THREE.Vector3(3, 0, 0)], COLORS.green));
      break;
    case 'child_cyclist':
      context.add(createCueLine('scenario-unstable-cycle-path', [new THREE.Vector3(14, 0, 4), new THREE.Vector3(10, 0, 1), new THREE.Vector3(7, 0, 3), new THREE.Vector3(3, 0, -2)], COLORS.orange));
      break;
    case 'signal_transition':
    case 'standard_crossing':
      break;
  }

  return context;
}

function createVehicleModel(actorClass: string): THREE.Group {
  const vehicle = new THREE.Group();
  vehicle.name = 'actor-vehicle';
  const normalizedClass = actorClass.toLowerCase();
  const bodyColor = normalizedClass === 'truck'
    ? COLORS.blue
    : normalizedClass === 'bus'
      ? COLORS.green
      : COLORS.vehicle;
  const bodyMaterial = standardMaterial(bodyColor, {
    roughness: 0.68,
    metalness: 0.18,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  const body = mesh('vehicle-body', new RoundedBoxGeometry(1.55, 0.5, 3.2, 0.12, 3), bodyMaterial);
  body.position.set(0, 0.62, 0);
  vehicle.add(body);
  const lowerMaterial = standardMaterial(COLORS.metal, { color: 0x202628, roughness: 0.58, metalness: 0.35 });
  const lowerBody = mesh('vehicle-lower-body', new RoundedBoxGeometry(1.62, 0.18, 3.08, 0.05, 2), lowerMaterial);
  lowerBody.position.y = 0.4;
  vehicle.add(lowerBody);
  const cabin = mesh('vehicle-cabin', new RoundedBoxGeometry(1.28, 0.46, 1.72, 0.16, 3), bodyMaterial);
  cabin.position.set(0, 0.98, 0.12);
  vehicle.add(cabin);

  const bumperMaterial = standardMaterial(COLORS.metal, { roughness: 0.72, metalness: 0.18 });
  addBox(vehicle, 'vehicle-bumper-front', 1.42, 0.12, 0.1, bumperMaterial, [0, 0.4, -1.62]);
  addBox(vehicle, 'vehicle-bumper-rear', 1.42, 0.12, 0.1, bumperMaterial, [0, 0.4, 1.62]);

  const windows = new THREE.Group();
  windows.name = 'vehicle-windows';
  const glassMaterial = standardMaterial(COLORS.glass, {
    emissive: COLORS.windowGlow,
    emissiveIntensity: 0.12,
    roughness: 0.5,
    metalness: 0.08,
  });
  addBox(windows, 'vehicle-window-front', 1.18, 0.34, 0.65, glassMaterial, [0, 0.96, -0.68]);
  addBox(windows, 'vehicle-window-rear', 1.18, 0.34, 0.65, glassMaterial, [0, 0.96, 0.68]);
  ([
    ['vehicle-window-side-front-left', -0.79, -0.55],
    ['vehicle-window-side-front-right', 0.79, -0.55],
    ['vehicle-window-side-rear-left', -0.79, 0.55],
    ['vehicle-window-side-rear-right', 0.79, 0.55],
  ] as const).forEach(([name, x, z]) => {
    addBox(windows, name, 0.06, 0.3, 0.72, glassMaterial, [x, 0.96, z]);
  });
  vehicle.add(windows);

  const mirrorMaterial = standardMaterial(COLORS.metal, { roughness: 0.48, metalness: 0.38 });
  addBox(vehicle, 'vehicle-mirror-left', 0.14, 0.1, 0.22, mirrorMaterial, [-0.8, 1.08, -0.72]);
  addBox(vehicle, 'vehicle-mirror-right', 0.14, 0.1, 0.22, mirrorMaterial, [0.8, 1.08, -0.72]);

  const wheelMaterial = standardMaterial(COLORS.metal, { roughness: 0.95, metalness: 0.18 });
  ([
    ['vehicle-wheel-front-left', -0.82, -1.05],
    ['vehicle-wheel-front-right', 0.82, -1.05],
    ['vehicle-wheel-rear-left', -0.82, 1.05],
    ['vehicle-wheel-rear-right', 0.82, 1.05],
  ] as const).forEach(([name, x, z]) => {
    const wheel = mesh(name, new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    vehicle.add(wheel);
  });

  const headlightFront = new THREE.Group();
  headlightFront.name = 'vehicle-headlight-front';
  const headlightMaterial = standardMaterial(COLORS.windowGlow, {
    emissive: COLORS.windowGlow,
    emissiveIntensity: 0.22,
    roughness: 0.4,
  });
  addBox(headlightFront, 'vehicle-headlight-front-left', 0.28, 0.16, 0.08, headlightMaterial, [-0.48, 0.68, -1.63]);
  addBox(headlightFront, 'vehicle-headlight-front-right', 0.28, 0.16, 0.08, headlightMaterial, [0.48, 0.68, -1.63]);
  vehicle.add(headlightFront);
  const taillightRear = new THREE.Group();
  taillightRear.name = 'vehicle-taillight-rear';
  const taillightMaterial = standardMaterial(COLORS.red, {
    emissive: COLORS.red,
    emissiveIntensity: 0.18,
    roughness: 0.4,
  });
  addBox(taillightRear, 'vehicle-taillight-rear-left', 0.28, 0.16, 0.08, taillightMaterial, [-0.48, 0.68, 1.63]);
  addBox(taillightRear, 'vehicle-taillight-rear-right', 0.48, 0.16, 0.08, taillightMaterial, [0.48, 0.68, 1.63]);
  vehicle.add(taillightRear);
  if (normalizedClass === 'truck') {
    vehicle.scale.set(1.18, 1.22, 1.35);
  } else if (normalizedClass === 'bus') {
    vehicle.scale.set(1.25, 1.35, 1.55);
  }
  return vehicle;
}

function createPersonModel(subtype?: string): THREE.Group {
  const person = new THREE.Group();
  person.name = 'actor-person';
  const skin = standardMaterial(COLORS.windowGlow);
  const clothingColor = subtype === 'delivery_rider' ? COLORS.orange : subtype === 'child' ? COLORS.green : COLORS.person;
  const clothing = standardMaterial(clothingColor);
  const head = mesh('person-head', new THREE.SphereGeometry(0.24, 12, 8), skin);
  head.position.y = 1.75;
  person.add(head);
  addBox(person, 'person-torso', 0.52, 0.72, 0.3, clothing, [0, 1.15, 0]);
  addCylinderBetween(person, 'person-arm-left', new THREE.Vector3(-0.25, 1.4, 0), new THREE.Vector3(-0.42, 0.85, 0), 0.08, clothing);
  addCylinderBetween(person, 'person-arm-right', new THREE.Vector3(0.25, 1.4, 0), new THREE.Vector3(0.42, 0.85, 0), 0.08, clothing);
  addCylinderBetween(person, 'person-leg-left', new THREE.Vector3(-0.13, 0.78, 0), new THREE.Vector3(-0.15, 0.1, 0), 0.1, clothing);
  addCylinderBetween(person, 'person-leg-right', new THREE.Vector3(0.13, 0.78, 0), new THREE.Vector3(0.15, 0.1, 0), 0.1, clothing);
  if (subtype === 'child') person.scale.setScalar(0.78);
  return person;
}

function createBicycleModel(subtype?: string): THREE.Group {
  const bicycle = new THREE.Group();
  bicycle.name = 'actor-bicycle';
  const wheelMaterial = standardMaterial(COLORS.metal, { roughness: 0.95, metalness: 0.18 });
  const frontWheel = mesh('bicycle-wheel-front', new THREE.TorusGeometry(0.62, 0.055, 8, 16), wheelMaterial);
  frontWheel.position.set(0.68, 0.65, 0);
  bicycle.add(frontWheel);
  const rearWheel = mesh('bicycle-wheel-rear', new THREE.TorusGeometry(0.62, 0.055, 8, 16), wheelMaterial);
  rearWheel.position.set(-0.68, 0.65, 0);
  bicycle.add(rearWheel);

  const frame = new THREE.Group();
  frame.name = 'bicycle-frame';
  const frameMaterial = standardMaterial(COLORS.bicycle);
  addCylinderBetween(frame, 'bicycle-frame-bar', new THREE.Vector3(-0.68, 0.65, 0), new THREE.Vector3(0, 0.65, 0), 0.045, frameMaterial);
  addCylinderBetween(frame, 'bicycle-frame-seat-bar', new THREE.Vector3(0, 0.65, 0), new THREE.Vector3(-0.28, 1.12, 0), 0.045, frameMaterial);
  addCylinderBetween(frame, 'bicycle-frame-handle-bar', new THREE.Vector3(0.68, 0.65, 0), new THREE.Vector3(0.48, 1.2, 0), 0.045, frameMaterial);
  bicycle.add(frame);

  const rider = createPersonModel(subtype);
  rider.name = 'bicycle-rider';
  rider.scale.setScalar(0.72);
  rider.position.set(-0.05, 0.58, 0);
  bicycle.add(rider);
  if (subtype === 'child') bicycle.scale.setScalar(0.82);
  return bicycle;
}

function createGenericModel(): THREE.Group {
  const generic = new THREE.Group();
  generic.name = 'actor-generic';
  addBox(generic, 'generic-body', 0.9, 0.9, 0.9, standardMaterial(COLORS.generic), [0, 0.55, 0]);
  const labelAnchor = new THREE.Object3D();
  labelAnchor.name = 'generic-label-anchor';
  labelAnchor.position.y = 1.2;
  generic.add(labelAnchor);
  return generic;
}

export function createRealtimeActorModel(state: ActorVisualState): THREE.Group {
  let model: THREE.Group;
  switch (state.modelType) {
    case 'vehicle':
      model = createVehicleModel(state.class);
      break;
    case 'person':
      model = createPersonModel(state.subtype);
      break;
    case 'bicycle':
      model = createBicycleModel(state.subtype);
      break;
    case 'generic':
      model = createGenericModel();
      break;
  }
  model.userData.actorClass = state.class;
  model.userData.actorSubtype = state.subtype;
  return model;
}
