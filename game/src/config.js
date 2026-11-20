// Sunhaven Heat — every tuning number, colour and story beat in one place.
// The city is a road grid: roads run along x and z at the coordinates in ROAD_LINES,
// blocks of buildings sit between them, and the sea laps the east edge past x = 205.

export const SAVE_KEY = 'sunhaven-heat-save-v1';

export const STEP = 1 / 60;
export const CITY_HALF = 210;
export const ROAD_LINES = [-160, -120, -80, -40, 0, 40, 80, 120, 160];
export const ROAD_WIDTH = 12;
export const WATER_X = 205;

// Landmark beacons (all sit on roads, so a car can always reach them).
export const GARAGE_POS = { x: -140, z: 120 };
export const BANK_POS = { x: 140, z: -120 };
export const DOCKS_POS = { x: 188, z: 0 };
export const SAFEHOUSE_POS = { x: -120, z: -140 };

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10.5,
  radius: 0.6,
  maxHealth: 100,
  turnSpeed: 12,
};

export const CAR = {
  maxSpeed: 38,
  reverseMax: 12,
  accel: 16,
  brake: 34,
  drag: 0.55,
  steer: 1.9,
  radius: 2.1,
};

export const POLICE = {
  maxSpeed: 42,
  accel: 20,
  ramDamage: 14,
  bustSeconds: 2.5,
};

export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;

export const WANTED_DECAY_SECONDS = 12;
export const WANTED_MISSION_DECAY_SECONDS = 6;

// Sun-soaked coastal palette: warm walls, terracotta roofs, teal sea, golden light.
export const PALETTE = {
  sky: 0x8ec9ee,
  sun: 0xfff2cf,
  ground: 0x9a938a,
  road: 0x33363d,
  roadLine: 0xf2d06b,
  sidewalk: 0xb8b0a4,
  water: 0x2e7f9e,
  sand: 0xe8d3a2,
  park: 0x6fae5e,
  walls: [0xf2e3c6, 0xe8b48a, 0xd98a6c, 0x9fc6c0, 0xf6d9a0, 0xc9a0b8, 0x8fb8d8, 0xe0cfa8],
  roofs: [0xb5502e, 0x7a4a35, 0x4a6b7a, 0x8a6d3b],
  carPaint: [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3aa655, 0xd8d8d8, 0x22242a, 0x7a4a9e, 0xe07a3b],
  glass: 0x1c2733,
};

export const MISSIONS = [
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 500,
    intro: 'Vera needs a car. Steal one and bring it to her garage.',
    stages: [
      { kind: 'steal', text: 'Steal a car — press E next to one' },
      { kind: 'goto', target: GARAGE_POS, text: 'Drive the car to Vera’s garage' },
    ],
  },
  {
    id: 'the-courier',
    title: 'The Courier',
    reward: 800,
    intro: 'A package is waiting at the docks. Fetch it, then bring it to Vera.',
    stages: [
      { kind: 'goto', target: DOCKS_POS, text: 'Pick up the package at the docks' },
      { kind: 'goto', target: GARAGE_POS, text: 'Deliver the package to Vera’s garage' },
    ],
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    reward: 1200,
    intro: 'The cops are on you. Lose them and reach the safehouse.',
    stages: [
      { kind: 'escape', target: SAFEHOUSE_POS, text: 'Reach the safehouse — lose the heat' },
    ],
  },
  {
    id: 'the-vault-job',
    title: 'The Vault Job',
    reward: 5000,
    intro: 'Harbor Bank. Crack the vault, then get out of Sunhaven’s sight.',
    stages: [
      { kind: 'goto', target: BANK_POS, text: 'Reach Harbor Bank' },
      { kind: 'crack', target: BANK_POS, seconds: 6, text: 'Crack the vault — stay by the bank' },
      { kind: 'escape', target: GARAGE_POS, text: 'Escape to Vera’s garage with the loot' },
    ],
  },
];

export const STORY = {
  title: 'SUNHAVEN HEAT',
  tagline: 'A sun-soaked open-world crime story. Your city. Your rules.',
  intro:
    'Jax Marlowe drives for hire in Sunhaven — a coastal city of palm-lined avenues, ' +
    'neon nights and fast money. Vera, the fixer who runs the garage on Marlin Row, has ' +
    'four jobs for you. Steal, deliver, run, and pull the biggest score the harbor has seen.',
  controls: [
    'WASD — move / drive',
    'Mouse drag — camera',
    'E — enter / exit car',
    'Click — shoot · F — punch',
    'Space — brake · Shift — run',
    'P — pause · M — mute',
  ],
};
