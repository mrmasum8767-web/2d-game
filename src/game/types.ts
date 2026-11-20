export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export interface SectorInfo {
  index: number;
  name: string;
  skyColor: number;
  fogColor: number;
  sunColor: number;
  accentColor: number;
}

export interface GameHudSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  distance: number;
  hull: number;
  maxHull: number;
  shieldCharge: number; // 0..100
  boostEnergy: number; // 0..100
  isBoosting: boolean;
  combo: number;
  maxCombo: number;
  ringsCleared: number;
  dronesShattered: number;
  crystalsCollected: number;
  speedKmh: number;
  sectorIndex: number;
  sectorName: string;
  isNewBest: boolean;
  muted: boolean;
  cannonCooldownRatio: number; // 0 = ready, 1 = cooling
  mouseSteer: boolean;
  invertY: boolean;
}

export const SECTORS: SectorInfo[] = [
  {
    index: 1,
    name: 'Dawn Gorge',
    skyColor: 0xe8a87c,
    fogColor: 0xdfb18c,
    sunColor: 0xffe4b8,
    accentColor: 0x2dd4bf,
  },
  {
    index: 2,
    name: 'Amber Narrows',
    skyColor: 0xd98057,
    fogColor: 0xcf7b57,
    sunColor: 0xffcfa0,
    accentColor: 0x38bdf8,
  },
  {
    index: 3,
    name: 'Crimson Spire',
    skyColor: 0x8f4350,
    fogColor: 0x843d4c,
    sunColor: 0xffb088,
    accentColor: 0xfbbf24,
  },
  {
    index: 4,
    name: 'Solar Overdrive',
    skyColor: 0x3a2c4e,
    fogColor: 0x453156,
    sunColor: 0xffd18c,
    accentColor: 0x22d3ee,
  },
];

export const GAME_CONSTANTS = {
  CORRIDOR_HALF_WIDTH: 12.5,
  MIN_ALTITUDE: 1.4,
  MAX_ALTITUDE: 9.2,
  BASE_SPEED: 46,
  MAX_BASE_SPEED: 88,
  BOOST_SPEED_MULT: 1.52,
  BOOST_DRAIN_PER_SEC: 42,
  BOOST_REGEN_PER_SEC: 13,
  RING_BOOST_BONUS: 26,
  CANNON_COOLDOWN: 0.24,
  MAX_HULL: 3,
  INVULN_DURATION: 1.25,
  CHUNK_LENGTH: 140,
  CHUNK_COUNT: 3,
  BEST_SCORE_KEY: 'solaris_drift_best_score_v1',
};
