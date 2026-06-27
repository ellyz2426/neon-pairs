import {
  World,
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Follower,
  ScreenSpace,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  PlaneGeometry,
  ConeGeometry,
  TorusGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  TetrahedronGeometry,
  RingGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  Color,
  Vector3,
  Quaternion,
  Euler,
  Fog,
  AmbientLight,
  PointLight,
  DirectionalLight,
  EdgesGeometry,
  LineSegments,
  AdditiveBlending,
  Float32BufferAttribute,
  BufferGeometry,
  Raycaster,
  Vector2,
  InputComponent,
} from '@iwsdk/core';

// ============================================================
// RUNTIME INPUT INTERFACE
// ============================================================

interface RuntimeInput {
  keyboard?: { getKeyDown(key: string): boolean; getKeyPressed(key: string): boolean; };
  xr: {
    gamepads: Record<'left' | 'right', {
      getButtonDown(id: string): boolean;
      getButtonValue(id: string): number;
      getAxesValues(id: string): { x: number; y: number } | undefined;
    } | undefined>;
  };
}

function getInput(): RuntimeInput | undefined {
  return (world as any).input as RuntimeInput | undefined;
}

// ============================================================
// TYPES & CONSTANTS
// ============================================================

type GameState = 'title' | 'modes' | 'difficulty' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'leaderboard' | 'achievements' | 'settings' | 'stats' | 'skins' | 'help';
type GameMode = 'classic' | 'timed' | 'moves' | 'speed' | 'zen' | 'daily' | 'endless' | 'blind';
type Difficulty = 'easy' | 'medium' | 'hard';

interface CardData {
  id: number;
  symbolIndex: number;
  row: number;
  col: number;
  mesh: any; // Group
  faceDown: boolean;
  matched: boolean;
  flipProgress: number;
  flipDir: number; // 1 = flipping face-up, -1 = flipping face-down
}

interface Theme {
  name: string;
  grid: number;
  accent: number;
  bg: number;
  fog: number;
  wall: number;
  card: number;
  symbol: number;
  glow: number;
  matched: number;
}

interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: () => boolean;
}

interface SkinDef {
  name: string;
  color: number;
  emissive: number;
  glow: number;
  unlock: string;
  unlockCheck: () => boolean;
}

interface LeaderboardEntry {
  score: number;
  mode: string;
  moves: number;
  accuracy: number;
  date: string;
}

const THEMES: Theme[] = [
  { name: 'Neon Holodeck', grid: 0x00ffff, accent: 0x00ffcc, bg: 0x000811, fog: 0x000811, wall: 0x003344, card: 0x001a2e, symbol: 0x00ffff, glow: 0x00ffff, matched: 0x00ff88 },
  { name: 'Crimson Arena', grid: 0xff4444, accent: 0xff6644, bg: 0x110000, fog: 0x110000, wall: 0x440000, card: 0x2e0000, symbol: 0xff4444, glow: 0xff4444, matched: 0xff8844 },
  { name: 'Toxic Neon', grid: 0x44ff44, accent: 0x88ff44, bg: 0x001100, fog: 0x001100, wall: 0x004400, card: 0x002e00, symbol: 0x44ff44, glow: 0x44ff44, matched: 0xccff44 },
  { name: 'Ultra Violet', grid: 0xaa44ff, accent: 0xcc66ff, bg: 0x0a0011, fog: 0x0a0011, wall: 0x330044, card: 0x1a002e, symbol: 0xaa44ff, glow: 0xaa44ff, matched: 0xff66cc },
  { name: 'Solar Blaze', grid: 0xff8800, accent: 0xffaa00, bg: 0x110800, fog: 0x110800, wall: 0x443300, card: 0x2e1a00, symbol: 0xff8800, glow: 0xff8800, matched: 0xffcc00 },
];

const SYMBOL_COLORS = [0x00ffff, 0xff44ff, 0x44ff44, 0xffcc00, 0xff4444, 0x4488ff, 0xff8800, 0xcc88ff, 0x88ffcc, 0xff66aa];

const GRID_CONFIGS: Record<Difficulty, { rows: number; cols: number }> = {
  easy: { rows: 3, cols: 4 },
  medium: { rows: 4, cols: 4 },
  hard: { rows: 4, cols: 5 },
};

// ============================================================
// SAVE DATA
// ============================================================

interface SaveData {
  games: number;
  totalScore: number;
  bestScore: number;
  totalPairs: number;
  totalMoves: number;
  bestCombo: number;
  perfectGames: number;
  totalMatches: number;
  totalFlips: number;
  playTime: number;
  level: number;
  xp: number;
  skin: number;
  themeIdx: number;
  masterVol: number;
  sfxVol: number;
  musicVol: number;
  achievements: string[];
  leaderboard: LeaderboardEntry[];
  dailyLast: string;
  dailyBest: number;
  dailyStreak: number;
  modesPlayed: string[];
  boardsCleared: number;
}

function defaultSave(): SaveData {
  return {
    games: 0, totalScore: 0, bestScore: 0, totalPairs: 0, totalMoves: 0,
    bestCombo: 0, perfectGames: 0, totalMatches: 0, totalFlips: 0, playTime: 0,
    level: 1, xp: 0, skin: 0, themeIdx: 0, masterVol: 100, sfxVol: 100, musicVol: 100,
    achievements: [], leaderboard: [], dailyLast: '', dailyBest: 0, dailyStreak: 0,
    modesPlayed: [], boardsCleared: 0,
  };
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem('neon-pairs-save');
    if (raw) return { ...defaultSave(), ...JSON.parse(raw) };
  } catch {}
  return defaultSave();
}

function saveSave(s: SaveData) {
  try { localStorage.setItem('neon-pairs-save', JSON.stringify(s)); } catch {}
}

// ============================================================
// SKINS
// ============================================================

const SKINS: SkinDef[] = [
  { name: 'Neon Cyan', color: 0x004466, emissive: 0x002233, glow: 0x00ffff, unlock: 'Default', unlockCheck: () => true },
  { name: 'Solar Flare', color: 0x664400, emissive: 0x332200, glow: 0xff8800, unlock: '50 pairs matched', unlockCheck: () => save.totalPairs >= 50 },
  { name: 'Plasma Pink', color: 0x660044, emissive: 0x330022, glow: 0xff44ff, unlock: '5K total score', unlockCheck: () => save.totalScore >= 5000 },
  { name: 'Frost Blue', color: 0x224466, emissive: 0x112233, glow: 0x88ccff, unlock: '10 games played', unlockCheck: () => save.games >= 10 },
  { name: 'Toxic Green', color: 0x004400, emissive: 0x002200, glow: 0x44ff44, unlock: 'x5 combo', unlockCheck: () => save.bestCombo >= 5 },
  { name: 'Royal Gold', color: 0x664400, emissive: 0x443300, glow: 0xffcc00, unlock: 'Perfect game', unlockCheck: () => save.perfectGames >= 1 },
  { name: 'Void Purple', color: 0x330044, emissive: 0x1a0022, glow: 0xaa44ff, unlock: '80% accuracy', unlockCheck: () => save.totalFlips > 0 && (save.totalMatches / (save.totalFlips / 2)) >= 0.8 },
  { name: 'Inferno Red', color: 0x440000, emissive: 0x220000, glow: 0xff4444, unlock: 'All modes played', unlockCheck: () => save.modesPlayed.length >= 8 },
];

// ============================================================
// GLOBALS
// ============================================================

let world: World;
let save: SaveData;
let state: GameState = 'title';
let mode: GameMode = 'classic';
let difficulty: Difficulty = 'medium';

// Game session
let cards: CardData[] = [];
let cardMeshGroup: Group;
let flippedCards: CardData[] = [];
let matchedCount = 0;
let totalPairs = 0;
let moveCount = 0;
let score = 0;
let combo = 0;
let bestCombo = 0;
let gameTime = 0;
let timeLimit = 0;
let moveLimit = 0;
let isLocked = false; // prevent flipping during animations
let gameActive = false;
let countdownTimer = 0;
let countdownPhase = 0;
let blindRevealTimer = 0;
let blindPhase: 'reveal' | 'play' = 'play';
let endlessBoardCount = 0;

// Seeded RNG for daily
let dailySeed = 0;
function mulberry32(a: number) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let seededRandom = Math.random;

// Audio
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let droneOsc1: OscillatorNode | null = null;
let droneOsc2: OscillatorNode | null = null;
let droneOsc3: OscillatorNode | null = null;

// UI entities
const uiEntities: Record<string, any> = {};

// Environment
let envGroup: Group;
let decorations: { mesh: any; rotSpeed: number; bobSpeed: number; bobAmp: number; baseY: number }[] = [];
let ambientParticles: { mesh: any; vel: Vector3; baseOpacity: number }[] = [];
let accentLight1: PointLight;
let accentLight2: PointLight;

// Particles
interface Particle {
  mesh: any;
  vel: Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}
let particles: Particle[] = [];
const MAX_PARTICLES = 150;

// Raycaster
const raycaster = new Raycaster();
const mouse = new Vector2();
let cardMeshes: any[] = [];

// Toast
let toastTimer = 0;
let toastQueue: string[] = [];

// Achievements page
let achievementsPage = 0;

// ============================================================
// AUDIO SYSTEM
// ============================================================

function initAudio() {
  if (audioCtx) return;
  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  sfxGain = audioCtx.createGain();
  musicGain = audioCtx.createGain();
  sfxGain.connect(masterGain);
  musicGain.connect(masterGain);
  masterGain.connect(audioCtx.destination);
  updateVolumes();
}

function updateVolumes() {
  if (!masterGain || !sfxGain || !musicGain) return;
  masterGain.gain.value = save.masterVol / 100;
  sfxGain.gain.value = save.sfxVol / 100;
  musicGain.gain.value = save.musicVol / 100;
}

function playSfx(freq: number, type: OscillatorType, dur: number, vol = 0.3) {
  if (!audioCtx || !sfxGain) { initAudio(); if (!audioCtx || !sfxGain) return; }
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq * (0.95 + Math.random() * 0.1);
  g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g);
  g.connect(sfxGain);
  o.start();
  o.stop(audioCtx.currentTime + dur);
}

function playFlipSfx() {
  playSfx(880, 'sine', 0.12, 0.25);
  playSfx(1320, 'triangle', 0.08, 0.15);
}

function playMatchSfx() {
  if (!audioCtx || !sfxGain) return;
  const notes = [660, 880, 1100, 1320];
  notes.forEach((f, i) => {
    setTimeout(() => playSfx(f, 'sine', 0.2, 0.3), i * 60);
  });
}

function playMismatchSfx() {
  playSfx(330, 'sawtooth', 0.3, 0.2);
  playSfx(220, 'sawtooth', 0.25, 0.15);
}

function playComboSfx(level: number) {
  const baseFreq = 660 + level * 110;
  playSfx(baseFreq, 'triangle', 0.15, 0.25);
  setTimeout(() => playSfx(baseFreq * 1.25, 'triangle', 0.12, 0.2), 80);
}

function playAchievementSfx() {
  const notes = [660, 880, 1100, 1320, 1540];
  notes.forEach((f, i) => {
    setTimeout(() => playSfx(f, 'sine', 0.25, 0.25), i * 80);
  });
}

function playCountdownSfx() { playSfx(440, 'sine', 0.15, 0.3); }
function playGoSfx() { playSfx(880, 'sine', 0.3, 0.4); }
function playClickSfx() { playSfx(660, 'sine', 0.06, 0.2); playSfx(990, 'sine', 0.04, 0.1); }
function playGameOverSfx() {
  [440, 392, 349, 330].forEach((f, i) => setTimeout(() => playSfx(f, 'triangle', 0.3, 0.25), i * 120));
}
function playGameStartSfx() {
  [330, 392, 440, 523].forEach((f, i) => setTimeout(() => playSfx(f, 'triangle', 0.2, 0.25), i * 100));
}
function playBoardClearSfx() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playSfx(f, 'sine', 0.3, 0.3), i * 100));
}

function startDrone() {
  if (!audioCtx || !musicGain) { initAudio(); if (!audioCtx || !musicGain) return; }
  if (droneOsc1) return;
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.frequency.value = 0.15;
  lfoGain.gain.value = 30;
  lfo.connect(lfoGain);

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  lfoGain.connect(filter.frequency);

  droneOsc1 = audioCtx.createOscillator();
  droneOsc1.type = 'sine';
  droneOsc1.frequency.value = 55;
  const g1 = audioCtx.createGain();
  g1.gain.value = 0.08;
  droneOsc1.connect(g1);
  g1.connect(filter);

  droneOsc2 = audioCtx.createOscillator();
  droneOsc2.type = 'triangle';
  droneOsc2.frequency.value = 82.5;
  const g2 = audioCtx.createGain();
  g2.gain.value = 0.05;
  droneOsc2.connect(g2);
  g2.connect(filter);

  droneOsc3 = audioCtx.createOscillator();
  droneOsc3.type = 'sine';
  droneOsc3.frequency.value = 110;
  const g3 = audioCtx.createGain();
  g3.gain.value = 0.04;
  droneOsc3.connect(g3);
  g3.connect(filter);

  filter.connect(musicGain);
  lfo.start();
  droneOsc1.start();
  droneOsc2.start();
  droneOsc3.start();
}

// ============================================================
// SYMBOL GEOMETRY CREATION
// ============================================================

function createSymbolMesh(symbolIndex: number, color: number): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 });
  const edgeMat = new LineBasicMaterial({ color, transparent: true, opacity: 0.8 });

  const geometries = [
    () => new BoxGeometry(0.12, 0.12, 0.12),
    () => new SphereGeometry(0.08, 8, 8),
    () => new OctahedronGeometry(0.09),
    () => new ConeGeometry(0.07, 0.14, 6),
    () => new TorusGeometry(0.06, 0.025, 8, 12),
    () => new CylinderGeometry(0.07, 0.07, 0.1, 8),
    () => new TetrahedronGeometry(0.1),
    () => new IcosahedronGeometry(0.08),
    () => new BoxGeometry(0.14, 0.06, 0.06),
    () => new RingGeometry(0.04, 0.08, 8),
  ];

  const geom = geometries[symbolIndex % geometries.length]();
  const mesh = new Mesh(geom, mat);
  g.add(mesh);

  const edges = new EdgesGeometry(geom);
  const wireframe = new LineSegments(edges, edgeMat);
  g.add(wireframe);

  // Small glow sphere
  const glowMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: AdditiveBlending });
  const glowMesh = new Mesh(new SphereGeometry(0.12, 8, 8), glowMat);
  g.add(glowMesh);

  return g;
}

// ============================================================
// CARD CREATION
// ============================================================

function createCardMesh(symbolIndex: number, skin: SkinDef, theme: Theme): Group {
  const group = new Group();

  // Card back (face-down side)
  const backMat = new MeshStandardMaterial({
    color: skin.color,
    emissive: skin.emissive,
    emissiveIntensity: 0.4,
    metalness: 0.3,
    roughness: 0.6,
  });
  const backGeom = new BoxGeometry(0.22, 0.30, 0.012);
  const backMesh = new Mesh(backGeom, backMat);
  backMesh.name = 'cardBack';
  group.add(backMesh);

  // Card back wireframe edges
  const backEdges = new EdgesGeometry(backGeom);
  const backWire = new LineSegments(backEdges, new LineBasicMaterial({ color: skin.glow, transparent: true, opacity: 0.6 }));
  group.add(backWire);

  // Back glow
  const backGlow = new Mesh(
    new PlaneGeometry(0.24, 0.32),
    new MeshBasicMaterial({ color: skin.glow, transparent: true, opacity: 0.15, blending: AdditiveBlending })
  );
  backGlow.position.z = 0.007;
  backGlow.name = 'backGlow';
  group.add(backGlow);

  // Card face (face-up side)
  const faceMat = new MeshStandardMaterial({
    color: theme.card,
    emissive: theme.card,
    emissiveIntensity: 0.2,
    metalness: 0.2,
    roughness: 0.7,
  });
  const faceGeom = new BoxGeometry(0.22, 0.30, 0.012);
  const faceMesh = new Mesh(faceGeom, faceMat);
  faceMesh.rotation.y = Math.PI; // faces the other way
  faceMesh.name = 'cardFace';
  group.add(faceMesh);

  // Symbol on face (offset forward from the face)
  const symbolGroup = createSymbolMesh(symbolIndex, SYMBOL_COLORS[symbolIndex % SYMBOL_COLORS.length]);
  symbolGroup.position.z = -0.015;
  symbolGroup.rotation.y = Math.PI;
  symbolGroup.name = 'symbol';
  group.add(symbolGroup);

  // Matched glow (initially invisible)
  const matchGlow = new Mesh(
    new PlaneGeometry(0.26, 0.34),
    new MeshBasicMaterial({ color: theme.matched, transparent: true, opacity: 0, blending: AdditiveBlending })
  );
  matchGlow.position.z = 0.008;
  matchGlow.name = 'matchGlow';
  group.add(matchGlow);

  return group;
}

// ============================================================
// BOARD SETUP
// ============================================================

function shuffleArray<T>(arr: T[], rng = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function setupBoard() {
  const config = GRID_CONFIGS[difficulty];
  const { rows, cols } = config;
  totalPairs = (rows * cols) / 2;
  matchedCount = 0;
  moveCount = 0;
  score = 0;
  combo = 0;
  bestCombo = 0;
  gameTime = 0;
  flippedCards = [];
  isLocked = false;
  blindPhase = mode === 'blind' ? 'reveal' : 'play';
  blindRevealTimer = mode === 'blind' ? 3.0 : 0;

  // Set mode-specific limits
  switch (mode) {
    case 'timed':
      timeLimit = difficulty === 'easy' ? 60 : difficulty === 'medium' ? 90 : 120;
      moveLimit = 0;
      break;
    case 'moves':
      moveLimit = difficulty === 'easy' ? 18 : difficulty === 'medium' ? 24 : 30;
      timeLimit = 0;
      break;
    case 'speed':
      timeLimit = difficulty === 'easy' ? 30 : difficulty === 'medium' ? 45 : 60;
      moveLimit = 0;
      break;
    default:
      timeLimit = 0;
      moveLimit = 0;
  }

  // Clear old cards
  if (cardMeshGroup) {
    world.scene.remove(cardMeshGroup);
  }
  cardMeshGroup = new Group();
  cards = [];
  cardMeshes = [];

  // Generate symbol pairs
  const rng = mode === 'daily' ? seededRandom : Math.random;
  const symbolIndices: number[] = [];
  for (let i = 0; i < totalPairs; i++) {
    symbolIndices.push(i % 10); // Use 10 symbol types
    symbolIndices.push(i % 10);
  }
  shuffleArray(symbolIndices, rng);

  const skin = SKINS[save.skin] || SKINS[0];
  const theme = THEMES[save.themeIdx] || THEMES[0];
  const cardSpacingX = 0.30;
  const cardSpacingY = 0.38;
  const offsetX = ((cols - 1) * cardSpacingX) / 2;
  const offsetY = ((rows - 1) * cardSpacingY) / 2;

  let cardId = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const symbolIdx = symbolIndices[cardId];
      const mesh = createCardMesh(symbolIdx, skin, theme);
      const x = c * cardSpacingX - offsetX;
      const y = r * cardSpacingY - offsetY + 1.4;
      mesh.position.set(x, y, -2.0);
      cardMeshGroup.add(mesh);
      cardMeshes.push(mesh);

      const card: CardData = {
        id: cardId,
        symbolIndex: symbolIdx,
        row: r,
        col: c,
        mesh,
        faceDown: true,
        matched: false,
        flipProgress: 0,
        flipDir: 0,
      };
      cards.push(card);
      cardId++;
    }
  }

  world.scene.add(cardMeshGroup);

  // Blind mode: start face-up for reveal phase
  if (mode === 'blind') {
    cards.forEach(c => {
      c.faceDown = false;
      c.mesh.rotation.y = Math.PI;
    });
  }
}

// ============================================================
// CARD INTERACTION
// ============================================================

function flipCard(card: CardData) {
  if (isLocked || card.matched || !card.faceDown || flippedCards.includes(card)) return;
  if (flippedCards.length >= 2) return;

  initAudio();
  playFlipSfx();
  card.flipDir = 1;
  card.flipProgress = 0;
  card.faceDown = false;
  flippedCards.push(card);

  if (flippedCards.length === 2) {
    moveCount++;
    isLocked = true;
    const [c1, c2] = flippedCards;

    if (c1.symbolIndex === c2.symbolIndex) {
      // Match!
      setTimeout(() => {
        c1.matched = true;
        c2.matched = true;
        matchedCount++;
        combo++;
        if (combo > bestCombo) bestCombo = combo;

        // Score: base 100 * combo multiplier
        const comboMult = Math.min(combo, 10);
        const points = 100 * comboMult;
        score += points;

        playMatchSfx();
        if (combo >= 2) playComboSfx(combo);

        // Match glow effect
        [c1, c2].forEach(c => {
          const glow = c.mesh.getObjectByName('matchGlow');
          if (glow) glow.material.opacity = 0.5;
        });

        // Spawn particles at matched cards
        const theme = THEMES[save.themeIdx] || THEMES[0];
        [c1, c2].forEach(c => {
          spawnParticleBurst(c.mesh.position.clone().add(new Vector3(0, 0, 0.1)), 12, theme.matched);
        });

        showToast(`Match! +${points}${combo > 1 ? ' x' + comboMult : ''}`);

        flippedCards = [];
        isLocked = false;

        // Check win
        if (matchedCount >= totalPairs) {
          if (mode === 'endless') {
            endlessBoardCount++;
            save.boardsCleared++;
            playBoardClearSfx();
            showToast(`Board ${endlessBoardCount} cleared!`);
            setupBoard();
            gameActive = true;
          } else {
            handleGameWin();
          }
        }
      }, 400);
    } else {
      // Mismatch
      combo = 0;
      setTimeout(() => {
        playMismatchSfx();
        c1.flipDir = -1;
        c1.flipProgress = 1;
        c2.flipDir = -1;
        c2.flipProgress = 1;
        c1.faceDown = true;
        c2.faceDown = true;
        flippedCards = [];
        setTimeout(() => { isLocked = false; }, 300);
      }, 800);
    }

    // Check move limit
    if (mode === 'moves' && moveLimit > 0 && moveCount >= moveLimit && matchedCount < totalPairs) {
      setTimeout(() => handleGameLoss(), 1000);
    }
  }
}

// ============================================================
// GAME WIN/LOSS
// ============================================================

function handleGameWin() {
  gameActive = false;
  const accuracy = moveCount > 0 ? Math.round((totalPairs / moveCount) * 100) : 0;
  const isPerfect = moveCount === totalPairs;

  // Update save
  save.games++;
  save.totalScore += score;
  if (score > save.bestScore) save.bestScore = score;
  save.totalPairs += matchedCount;
  save.totalMoves += moveCount;
  if (bestCombo > save.bestCombo) save.bestCombo = bestCombo;
  if (isPerfect) save.perfectGames++;
  save.totalMatches += matchedCount;
  save.totalFlips += moveCount * 2;
  save.playTime += Math.floor(gameTime);
  save.boardsCleared++;

  // XP
  const xpGain = Math.floor(score / 10) + matchedCount * 5;
  save.xp += xpGain;
  const xpNeeded = 100 + save.level * 50;
  if (save.xp >= xpNeeded) {
    save.xp -= xpNeeded;
    save.level++;
    showToast(`Level Up! Level ${save.level}`);
  }

  // Mode tracking
  if (!save.modesPlayed.includes(mode)) save.modesPlayed.push(mode);

  // Daily tracking
  if (mode === 'daily') {
    const today = new Date().toISOString().slice(0, 10);
    if (save.dailyLast === today) {
      if (score > save.dailyBest) save.dailyBest = score;
    } else {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      save.dailyStreak = save.dailyLast === yesterday ? save.dailyStreak + 1 : 1;
      save.dailyLast = today;
      save.dailyBest = score;
    }
  }

  // Leaderboard
  save.leaderboard.push({ score, mode, moves: moveCount, accuracy, date: new Date().toISOString().slice(0, 10) });
  save.leaderboard.sort((a, b) => b.score - a.score);
  save.leaderboard = save.leaderboard.slice(0, 20);

  // Check achievements
  checkAchievements();
  saveSave(save);

  // Rating
  let rating = 'C';
  if (accuracy >= 100) rating = 'S';
  else if (accuracy >= 80) rating = 'A';
  else if (accuracy >= 60) rating = 'B';

  playGameOverSfx();
  if (isPerfect) {
    spawnParticleBurst(new Vector3(0, 1.8, -2.0), 40, 0xffcc00);
  }

  // Show gameover
  state = 'gameover';
  showPanel('gameover');
  hidePanel('hud');
  updateGameOverPanel(accuracy, rating);
}

function handleGameLoss() {
  gameActive = false;
  save.games++;
  save.totalMoves += moveCount;
  save.totalPairs += matchedCount;
  save.totalMatches += matchedCount;
  save.totalFlips += moveCount * 2;
  save.playTime += Math.floor(gameTime);
  if (!save.modesPlayed.includes(mode)) save.modesPlayed.push(mode);
  checkAchievements();
  saveSave(save);

  const accuracy = moveCount > 0 ? Math.round((matchedCount / moveCount) * 100) : 0;

  playGameOverSfx();
  state = 'gameover';
  showPanel('gameover');
  hidePanel('hud');
  updateGameOverPanel(accuracy, 'F');
}

// ============================================================
// ACHIEVEMENTS
// ============================================================

function getAchievements(): Achievement[] {
  return [
    { id: 'first_match', name: 'First Match', desc: 'Match your first pair', check: () => save.totalPairs >= 1 },
    { id: 'ten_matches', name: 'Pair Finder', desc: 'Match 10 pairs', check: () => save.totalPairs >= 10 },
    { id: 'fifty_matches', name: 'Memory Master', desc: 'Match 50 pairs', check: () => save.totalPairs >= 50 },
    { id: 'hundred_matches', name: 'Pair Legend', desc: 'Match 100 pairs', check: () => save.totalPairs >= 100 },
    { id: 'five_hundred_matches', name: 'Photographic', desc: 'Match 500 pairs', check: () => save.totalPairs >= 500 },
    { id: 'score_500', name: 'Scorer', desc: 'Score 500 in one game', check: () => score >= 500 },
    { id: 'score_1k', name: 'High Scorer', desc: 'Score 1,000 in one game', check: () => score >= 1000 },
    { id: 'score_5k', name: 'Score Master', desc: 'Score 5,000 in one game', check: () => score >= 5000 },
    { id: 'score_10k', name: 'Score Legend', desc: 'Score 10,000 in one game', check: () => score >= 10000 },
    { id: 'combo_x3', name: 'Combo Starter', desc: 'Get a x3 combo', check: () => bestCombo >= 3 },
    { id: 'combo_x5', name: 'Combo King', desc: 'Get a x5 combo', check: () => bestCombo >= 5 },
    { id: 'combo_x8', name: 'Combo Master', desc: 'Get a x8 combo', check: () => bestCombo >= 8 },
    { id: 'combo_x10', name: 'Perfect Recall', desc: 'Get a x10 combo', check: () => bestCombo >= 10 },
    { id: 'perfect_game', name: 'Flawless', desc: 'Win without a mismatch', check: () => save.perfectGames >= 1 },
    { id: 'three_perfects', name: 'Triple Perfect', desc: '3 perfect games', check: () => save.perfectGames >= 3 },
    { id: 'games_10', name: 'Getting Started', desc: 'Play 10 games', check: () => save.games >= 10 },
    { id: 'games_50', name: 'Dedicated', desc: 'Play 50 games', check: () => save.games >= 50 },
    { id: 'games_100', name: 'Veteran', desc: 'Play 100 games', check: () => save.games >= 100 },
    { id: 'daily_done', name: 'Daily Player', desc: 'Complete a daily challenge', check: () => save.dailyLast.length > 0 },
    { id: 'daily_3', name: 'Daily Streak', desc: '3-day daily streak', check: () => save.dailyStreak >= 3 },
    { id: 'daily_7', name: 'Weekly Warrior', desc: '7-day daily streak', check: () => save.dailyStreak >= 7 },
    { id: 'all_modes', name: 'Explorer', desc: 'Play all 8 modes', check: () => save.modesPlayed.length >= 8 },
    { id: 'accuracy_80', name: 'Sharp Memory', desc: '80%+ accuracy lifetime', check: () => save.totalFlips > 0 && (save.totalMatches / (save.totalFlips / 2)) >= 0.8 },
    { id: 'speed_30', name: 'Speed Demon', desc: 'Clear board in under 30s', check: () => gameTime > 0 && gameTime < 30 && matchedCount >= totalPairs },
    { id: 'no_mistake', name: 'No Mistakes', desc: 'Clear board: matches = total pairs', check: () => moveCount === totalPairs && matchedCount >= totalPairs },
    { id: 'skin_unlock', name: 'Fashionista', desc: 'Unlock a new card skin', check: () => SKINS.filter(s => s.unlockCheck()).length > 1 },
    { id: 'theme_all', name: 'Theme Tourist', desc: 'Try all 5 themes', check: () => false },
    { id: 'total_10k', name: 'Career Score', desc: '10K total score', check: () => save.totalScore >= 10000 },
    { id: 'total_50k', name: 'Score Machine', desc: '50K total score', check: () => save.totalScore >= 50000 },
    { id: 'level_10', name: 'Rising Star', desc: 'Reach level 10', check: () => save.level >= 10 },
    { id: 'level_25', name: 'Experienced', desc: 'Reach level 25', check: () => save.level >= 25 },
    { id: 'level_50', name: 'Grandmaster', desc: 'Reach level 50', check: () => save.level >= 50 },
    { id: 'endless_3', name: 'Endurance', desc: 'Clear 3 boards in Endless', check: () => mode === 'endless' && endlessBoardCount >= 3 },
    { id: 'endless_5', name: 'Marathon', desc: 'Clear 5 boards in Endless', check: () => mode === 'endless' && endlessBoardCount >= 5 },
    { id: 'blind_win', name: 'Blind Master', desc: 'Win a Blind Recall game', check: () => mode === 'blind' && matchedCount >= totalPairs },
    { id: 'fast_match', name: 'Lightning Match', desc: 'Match in under 2 seconds', check: () => false },
    { id: 'boards_10', name: 'Board Clearer', desc: 'Clear 10 boards total', check: () => save.boardsCleared >= 10 },
    { id: 'boards_50', name: 'Board Master', desc: 'Clear 50 boards total', check: () => save.boardsCleared >= 50 },
    { id: 'easy_master', name: 'Easy Breeze', desc: 'Score 500+ on Easy', check: () => difficulty === 'easy' && score >= 500 },
    { id: 'hard_master', name: 'Hard Mode Hero', desc: 'Win on Hard difficulty', check: () => difficulty === 'hard' && matchedCount >= totalPairs },
  ];
}

function checkAchievements() {
  const achs = getAchievements();
  achs.forEach(a => {
    if (!save.achievements.includes(a.id) && a.check()) {
      save.achievements.push(a.id);
      showToast(`Achievement: ${a.name}`);
      playAchievementSfx();
    }
  });
}

// ============================================================
// PARTICLES
// ============================================================

function initParticles() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const geom = new SphereGeometry(0.015, 4, 4);
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending });
    const mesh = new Mesh(geom, mat);
    mesh.visible = false;
    world.scene.add(mesh);
    particles.push({ mesh, vel: new Vector3(), life: 0, maxLife: 0, active: false });
  }
}

function spawnParticleBurst(pos: Vector3, count: number, color: number) {
  let spawned = 0;
  for (const p of particles) {
    if (spawned >= count) break;
    if (p.active) continue;
    p.active = true;
    p.mesh.visible = true;
    p.mesh.position.copy(pos);
    p.vel.set((Math.random() - 0.5) * 2, Math.random() * 2 + 1, (Math.random() - 0.5) * 2);
    p.life = 0;
    p.maxLife = 0.6 + Math.random() * 0.6;
    (p.mesh.material as any).color.set(color);
    (p.mesh.material as any).opacity = 1;
    spawned++;
  }
}

function updateParticles(delta: number) {
  for (const p of particles) {
    if (!p.active) continue;
    p.life += delta;
    if (p.life >= p.maxLife) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }
    p.vel.y -= 4 * delta;
    p.mesh.position.addScaledVector(p.vel, delta);
    (p.mesh.material as any).opacity = 1 - p.life / p.maxLife;
  }
}

// ============================================================
// ENVIRONMENT
// ============================================================

function buildEnvironment() {
  envGroup = new Group();
  const theme = THEMES[save.themeIdx] || THEMES[0];

  // Floor grid
  const floorMat = new MeshBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.15 });
  for (let i = -10; i <= 10; i++) {
    const hGeom = new BufferGeometry();
    hGeom.setAttribute('position', new Float32BufferAttribute([i, 0, -10, i, 0, 10], 3));
    envGroup.add(new LineSegments(hGeom, new LineBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.15 })));
    const vGeom = new BufferGeometry();
    vGeom.setAttribute('position', new Float32BufferAttribute([-10, 0, i, 10, 0, i], 3));
    envGroup.add(new LineSegments(vGeom, new LineBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.15 })));
  }

  // Ceiling grid
  for (let i = -10; i <= 10; i++) {
    const hGeom = new BufferGeometry();
    hGeom.setAttribute('position', new Float32BufferAttribute([i, 4, -10, i, 4, 10], 3));
    envGroup.add(new LineSegments(hGeom, new LineBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.08 })));
    const vGeom = new BufferGeometry();
    vGeom.setAttribute('position', new Float32BufferAttribute([-10, 4, i, 10, 4, i], 3));
    envGroup.add(new LineSegments(vGeom, new LineBasicMaterial({ color: theme.grid, transparent: true, opacity: 0.08 })));
  }

  // Floating decorations
  decorations = [];
  const decoGeoms = [
    () => new TorusGeometry(0.3, 0.05, 8, 16),
    () => new BoxGeometry(0.3, 0.3, 0.3),
    () => new SphereGeometry(0.2, 8, 8),
    () => new ConeGeometry(0.15, 0.3, 6),
  ];
  for (let i = 0; i < 14; i++) {
    const geomFn = decoGeoms[i % decoGeoms.length];
    const geom = geomFn();
    const mat = new MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.15, wireframe: true });
    const mesh = new Mesh(geom, mat);
    const angle = (i / 14) * Math.PI * 2;
    const dist = 4 + Math.random() * 3;
    const baseY = 1 + Math.random() * 2;
    mesh.position.set(Math.cos(angle) * dist, baseY, Math.sin(angle) * dist - 2);
    envGroup.add(mesh);
    decorations.push({
      mesh,
      rotSpeed: 0.3 + Math.random() * 0.5,
      bobSpeed: 0.5 + Math.random() * 0.5,
      bobAmp: 0.1 + Math.random() * 0.15,
      baseY,
    });
  }

  // Ambient particles
  ambientParticles = [];
  for (let i = 0; i < 40; i++) {
    const mat = new MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.2 + Math.random() * 0.3, blending: AdditiveBlending });
    const mesh = new Mesh(new SphereGeometry(0.01 + Math.random() * 0.02, 4, 4), mat);
    mesh.position.set(
      (Math.random() - 0.5) * 16,
      Math.random() * 3.5 + 0.5,
      (Math.random() - 0.5) * 16 - 2
    );
    envGroup.add(mesh);
    ambientParticles.push({
      mesh,
      vel: new Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.1),
      baseOpacity: 0.2 + Math.random() * 0.3,
    });
  }

  world.scene.add(envGroup);

  // Lighting
  const ambient = new AmbientLight(0xffffff, 0.3);
  world.scene.add(ambient);

  const dir = new DirectionalLight(0xffffff, 0.4);
  dir.position.set(2, 4, 2);
  world.scene.add(dir);

  accentLight1 = new PointLight(theme.accent, 1, 10);
  accentLight1.position.set(-2, 2.5, -1);
  world.scene.add(accentLight1);

  accentLight2 = new PointLight(theme.glow, 0.6, 8);
  accentLight2.position.set(2, 2, -3);
  world.scene.add(accentLight2);

  // Fog
  (world.scene as any).fog = new Fog(new Color(theme.bg), 5, 25);
  (world.scene as any).background = new Color(theme.bg);
}

function updateEnvironment(time: number, delta: number) {
  for (const d of decorations) {
    d.mesh.rotation.x += d.rotSpeed * delta;
    d.mesh.rotation.z += d.rotSpeed * 0.5 * delta;
    d.mesh.position.y = d.baseY + Math.sin(time * d.bobSpeed) * d.bobAmp;
  }
  for (const p of ambientParticles) {
    p.mesh.position.addScaledVector(p.vel, delta);
    (p.mesh.material as any).opacity = p.baseOpacity * (0.5 + 0.5 * Math.sin(time * 2 + p.mesh.position.x * 3));
    // Wrap around
    if (p.mesh.position.x > 8) p.mesh.position.x = -8;
    if (p.mesh.position.x < -8) p.mesh.position.x = 8;
    if (p.mesh.position.z > 6) p.mesh.position.z = -10;
    if (p.mesh.position.z < -10) p.mesh.position.z = 6;
  }
}

// ============================================================
// PANEL MANAGEMENT
// ============================================================

function showPanel(name: string) {
  const e = uiEntities[name];
  if (e && e.object3D) e.object3D.visible = true;
}

function hidePanel(name: string) {
  const e = uiEntities[name];
  if (e && e.object3D) e.object3D.visible = false;
}

function hideAllPanels() {
  for (const key in uiEntities) {
    hidePanel(key);
  }
}

function showToast(msg: string) {
  toastQueue.push(msg);
}

function updateGameOverPanel(accuracy: number, rating: string) {
  // Updated via the UI system qualify event
}

// ============================================================
// MAIN GAME SYSTEM
// ============================================================

class NeonPairsSystem extends createSystem({
  titlePanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
  modesPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modes.json')] },
  difficultyPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/difficulty.json')] },
  hudPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  pausePanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  gameoverPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
  leaderboardPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
  achievementsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  settingsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  statsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  skinsPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
  helpPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
  toastPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
  countdownPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
}) {
  private docs: Record<string, UIKitDocument> = {};
  private totalTime = 0;

  init() {
    const panelNames = ['title', 'modes', 'difficulty', 'hud', 'pause', 'gameover',
      'leaderboard', 'achievements', 'settings', 'stats', 'skins', 'help', 'toast', 'countdown'];

    const queryMap: Record<string, any> = {
      title: this.queries.titlePanel,
      modes: this.queries.modesPanel,
      difficulty: this.queries.difficultyPanel,
      hud: this.queries.hudPanel,
      pause: this.queries.pausePanel,
      gameover: this.queries.gameoverPanel,
      leaderboard: this.queries.leaderboardPanel,
      achievements: this.queries.achievementsPanel,
      settings: this.queries.settingsPanel,
      stats: this.queries.statsPanel,
      skins: this.queries.skinsPanel,
      help: this.queries.helpPanel,
      toast: this.queries.toastPanel,
      countdown: this.queries.countdownPanel,
    };

    for (const name of panelNames) {
      queryMap[name].subscribe('qualify', (entity: any) => {
        const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
        if (!doc) return;
        this.docs[name] = doc;
        this.wirePanel(name, doc, entity);

        // Initial visibility
        if (name === 'title') {
          showPanel('title');
        } else {
          hidePanel(name);
        }
      });
    }
  }

  private setText(panelName: string, id: string, text: string) {
    const doc = this.docs[panelName];
    if (!doc) return;
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.setProperties({ text });
  }

  private wirePanel(name: string, doc: UIKitDocument, entity: any) {
    const btn = (id: string, handler: () => void) => {
      const el = doc.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', () => { playClickSfx(); handler(); });
    };

    switch (name) {
      case 'title':
        this.setText('title', 'lbl-level', `Level ${save.level}`);
        btn('btn-play', () => { hideAllPanels(); state = 'modes'; showPanel('modes'); });
        btn('btn-scores', () => { hideAllPanels(); state = 'leaderboard'; this.updateLeaderboard(); showPanel('leaderboard'); });
        btn('btn-achievements', () => { hideAllPanels(); state = 'achievements'; achievementsPage = 0; this.updateAchievements(); showPanel('achievements'); });
        btn('btn-stats', () => { hideAllPanels(); state = 'stats'; this.updateStats(); showPanel('stats'); });
        btn('btn-skins', () => { hideAllPanels(); state = 'skins'; this.updateSkins(); showPanel('skins'); });
        btn('btn-settings', () => { hideAllPanels(); state = 'settings'; this.updateSettings(); showPanel('settings'); });
        btn('btn-help', () => { hideAllPanels(); state = 'help'; showPanel('help'); });
        break;

      case 'modes':
        const modes: [string, GameMode][] = [
          ['btn-classic', 'classic'], ['btn-timed', 'timed'], ['btn-moves', 'moves'],
          ['btn-speed', 'speed'], ['btn-zen', 'zen'], ['btn-daily', 'daily'],
          ['btn-endless', 'endless'], ['btn-blind', 'blind'],
        ];
        modes.forEach(([id, m]) => btn(id, () => { mode = m; hideAllPanels(); state = 'difficulty'; showPanel('difficulty'); }));
        btn('btn-back', () => { hideAllPanels(); state = 'title'; showPanel('title'); });
        break;

      case 'difficulty':
        btn('btn-easy', () => { difficulty = 'easy'; this.startGame(); });
        btn('btn-medium', () => { difficulty = 'medium'; this.startGame(); });
        btn('btn-hard', () => { difficulty = 'hard'; this.startGame(); });
        btn('btn-back', () => { hideAllPanels(); state = 'modes'; showPanel('modes'); });
        break;

      case 'pause':
        btn('btn-resume', () => { hidePanel('pause'); showPanel('hud'); state = 'playing'; gameActive = true; });
        btn('btn-quit', () => { hideAllPanels(); gameActive = false; if (cardMeshGroup) world.scene.remove(cardMeshGroup); state = 'title'; showPanel('title'); this.setText('title', 'lbl-level', `Level ${save.level}`); });
        break;

      case 'gameover':
        btn('btn-rematch', () => { this.startGame(); });
        btn('btn-menu', () => { hideAllPanels(); if (cardMeshGroup) world.scene.remove(cardMeshGroup); state = 'title'; showPanel('title'); this.setText('title', 'lbl-level', `Level ${save.level}`); });
        break;

      case 'leaderboard':
      case 'stats':
      case 'skins':
      case 'help':
        btn('btn-back', () => { hideAllPanels(); state = 'title'; showPanel('title'); });
        break;

      case 'achievements':
        btn('btn-back', () => { hideAllPanels(); state = 'title'; showPanel('title'); });
        btn('btn-prev', () => { if (achievementsPage > 0) { achievementsPage--; this.updateAchievements(); } });
        btn('btn-next', () => { achievementsPage++; this.updateAchievements(); });
        break;

      case 'settings':
        btn('btn-master-up', () => { save.masterVol = Math.min(100, save.masterVol + 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-master-down', () => { save.masterVol = Math.max(0, save.masterVol - 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-sfx-up', () => { save.sfxVol = Math.min(100, save.sfxVol + 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-sfx-down', () => { save.sfxVol = Math.max(0, save.sfxVol - 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-music-up', () => { save.musicVol = Math.min(100, save.musicVol + 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-music-down', () => { save.musicVol = Math.max(0, save.musicVol - 10); updateVolumes(); this.updateSettings(); saveSave(save); });
        btn('btn-theme-prev', () => { save.themeIdx = (save.themeIdx - 1 + THEMES.length) % THEMES.length; this.updateSettings(); saveSave(save); });
        btn('btn-theme-next', () => { save.themeIdx = (save.themeIdx + 1) % THEMES.length; this.updateSettings(); saveSave(save); });
        btn('btn-back', () => { hideAllPanels(); state = 'title'; showPanel('title'); });
        break;
    }

    // Wire skin buttons
    if (name === 'skins') {
      for (let i = 0; i < SKINS.length; i++) {
        btn(`sk${i}`, () => {
          if (SKINS[i].unlockCheck()) {
            save.skin = i;
            this.updateSkins();
            saveSave(save);
          }
        });
      }
    }
  }

  private startGame() {
    initAudio();
    startDrone();

    // Daily seed
    if (mode === 'daily') {
      const today = new Date();
      dailySeed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
      seededRandom = mulberry32(dailySeed);
    } else {
      seededRandom = Math.random;
    }

    endlessBoardCount = 0;
    hideAllPanels();
    setupBoard();

    // Countdown
    state = 'countdown';
    countdownTimer = 0;
    countdownPhase = 3;
    showPanel('countdown');
    this.setText('countdown', 'lbl-count', '3');
    playCountdownSfx();
  }

  private updateLeaderboard() {
    for (let i = 0; i < 10; i++) {
      const entry = save.leaderboard[i];
      this.setText('leaderboard', `row${i}`, entry
        ? `${i + 1}. ${entry.score} - ${entry.mode} - ${entry.accuracy}%`
        : `${i + 1}. ---`);
    }
  }

  private updateAchievements() {
    const achs = getAchievements();
    const perPage = 15;
    const totalPages = Math.ceil(achs.length / perPage);
    if (achievementsPage >= totalPages) achievementsPage = totalPages - 1;
    const start = achievementsPage * perPage;

    this.setText('achievements', 'lbl-count', `${save.achievements.length} / ${achs.length}`);
    this.setText('achievements', 'lbl-page', `${achievementsPage + 1}/${totalPages}`);

    for (let i = 0; i < perPage; i++) {
      const idx = start + i;
      const a = achs[idx];
      this.setText('achievements', `a${i}`, a
        ? `${save.achievements.includes(a.id) ? '[*]' : '[ ]'} ${a.name}: ${a.desc}`
        : '');
    }
  }

  private updateStats() {
    const acc = save.totalFlips > 0 ? Math.round((save.totalMatches / (save.totalFlips / 2)) * 100) : 0;
    const lines = [
      `Games: ${save.games}`,
      `Total Score: ${save.totalScore}`,
      `Best Score: ${save.bestScore}`,
      `Total Pairs: ${save.totalPairs}`,
      `Total Moves: ${save.totalMoves}`,
      `Best Combo: x${save.bestCombo}`,
      `Perfect Games: ${save.perfectGames}`,
      `Accuracy: ${acc}%`,
      `Play Time: ${Math.floor(save.playTime / 60)}m`,
      `Level: ${save.level}`,
    ];
    lines.forEach((l, i) => this.setText('stats', `s${i}`, l));
  }

  private updateSettings() {
    this.setText('settings', 'lbl-master', `${save.masterVol}`);
    this.setText('settings', 'lbl-sfx', `${save.sfxVol}`);
    this.setText('settings', 'lbl-music', `${save.musicVol}`);
    this.setText('settings', 'lbl-theme', THEMES[save.themeIdx].name);
  }

  private updateSkins() {
    for (let i = 0; i < SKINS.length; i++) {
      const s = SKINS[i];
      const unlocked = s.unlockCheck();
      const equipped = save.skin === i;
      let label = s.name;
      if (equipped) label += ' [Equipped]';
      else if (!unlocked) label += ` [${s.unlock}]`;
      this.setText('skins', `sk${i}`, label);
    }
  }

  private updateHud() {
    const modeNames: Record<GameMode, string> = {
      classic: 'Classic', timed: 'Timed', moves: 'Limited Moves', speed: 'Speed Match',
      zen: 'Zen', daily: 'Daily Challenge', endless: 'Endless', blind: 'Blind Recall',
    };
    this.setText('hud', 'lbl-mode', modeNames[mode] || mode);
    this.setText('hud', 'lbl-pairs', `Pairs: ${matchedCount}/${totalPairs}${mode === 'endless' ? ` (Board ${endlessBoardCount + 1})` : ''}`);
    this.setText('hud', 'lbl-moves', mode === 'moves' && moveLimit > 0
      ? `Moves: ${moveCount}/${moveLimit}`
      : `Moves: ${moveCount}`);

    if (mode === 'timed' || mode === 'speed') {
      const remaining = Math.max(0, timeLimit - gameTime);
      const m = Math.floor(remaining / 60);
      const s = Math.floor(remaining % 60);
      this.setText('hud', 'lbl-time', `Time: ${m}:${s.toString().padStart(2, '0')}`);
    } else {
      const m = Math.floor(gameTime / 60);
      const s = Math.floor(gameTime % 60);
      this.setText('hud', 'lbl-time', `Time: ${m}:${s.toString().padStart(2, '0')}`);
    }

    this.setText('hud', 'lbl-combo', combo > 1 ? `Combo: x${Math.min(combo, 10)}` : '');
    this.setText('hud', 'lbl-score', `Score: ${score}`);
    this.setText('hud', 'lbl-best', `Best: ${save.bestScore}`);
  }

  update(delta: number, time: number) {
    this.totalTime = time;

    // Countdown
    if (state === 'countdown') {
      countdownTimer += delta;
      if (countdownTimer >= 1) {
        countdownTimer -= 1;
        countdownPhase--;
        if (countdownPhase <= 0) {
          hidePanel('countdown');
          showPanel('hud');
          state = 'playing';
          gameActive = true;
          playGoSfx();
          playGameStartSfx();
          this.setText('countdown', 'lbl-count', 'GO!');
        } else {
          this.setText('countdown', 'lbl-count', `${countdownPhase}`);
          playCountdownSfx();
        }
      }
    }

    // Playing state
    if (state === 'playing' && gameActive) {
      gameTime += delta;

      // Blind mode reveal timer
      if (mode === 'blind' && blindPhase === 'reveal') {
        blindRevealTimer -= delta;
        if (blindRevealTimer <= 0) {
          blindPhase = 'play';
          // Flip all cards face down
          cards.forEach(c => {
            if (!c.matched) {
              c.flipDir = -1;
              c.flipProgress = 1;
              c.faceDown = true;
            }
          });
        }
      }

      // Time limit check
      if ((mode === 'timed' || mode === 'speed') && timeLimit > 0 && gameTime >= timeLimit) {
        if (matchedCount < totalPairs) {
          handleGameLoss();
        } else {
          handleGameWin();
        }
      }

      this.updateHud();

      // Input handling
      this.handleInput();
    }

    // Update card flip animations
    for (const card of cards) {
      if (card.flipDir !== 0) {
        card.flipProgress += card.flipDir * delta * 4;
        if (card.flipDir > 0 && card.flipProgress >= 1) {
          card.flipProgress = 1;
          card.flipDir = 0;
          card.mesh.rotation.y = Math.PI;
        } else if (card.flipDir < 0 && card.flipProgress <= 0) {
          card.flipProgress = 0;
          card.flipDir = 0;
          card.mesh.rotation.y = 0;
        } else {
          card.mesh.rotation.y = card.flipProgress * Math.PI;
        }
      }

      // Matched card glow pulse
      if (card.matched) {
        const glow = card.mesh.getObjectByName('matchGlow');
        if (glow) {
          glow.material.opacity = 0.3 + 0.2 * Math.sin(time * 3);
        }
        // Gentle float
        card.mesh.position.y += Math.sin(time * 2 + card.id * 0.5) * 0.0003;
      }
    }

    // Update environment
    updateEnvironment(time, delta);
    updateParticles(delta);

    // Toast system
    if (toastTimer > 0) {
      toastTimer -= delta;
      if (toastTimer <= 0) {
        hidePanel('toast');
        // Check queue
        if (toastQueue.length > 0) {
          const msg = toastQueue.shift()!;
          this.setText('toast', 'lbl-toast', msg);
          showPanel('toast');
          toastTimer = 2.0;
        }
      }
    } else if (toastQueue.length > 0) {
      const msg = toastQueue.shift()!;
      this.setText('toast', 'lbl-toast', msg);
      showPanel('toast');
      toastTimer = 2.0;
    }

    // Input handling (keyboard + XR)
    const inp = getInput();
    if (inp?.keyboard) {
      if (inp.keyboard.getKeyDown('Escape') || inp.keyboard.getKeyDown('KeyP')) {
        if (state === 'playing') {
          state = 'paused';
          gameActive = false;
          hidePanel('hud');
          showPanel('pause');
        } else if (state === 'paused') {
          state = 'playing';
          gameActive = true;
          hidePanel('pause');
          showPanel('hud');
        }
      }

      if (inp.keyboard.getKeyDown('KeyR') && state === 'gameover') {
        this.startGame();
      }
    }

    // VR B button for pause
    const rightGp = inp?.xr?.gamepads?.right;
    if (rightGp?.getButtonDown(InputComponent.B_Button)) {
      if (state === 'playing') {
        state = 'paused';
        gameActive = false;
        hidePanel('hud');
        showPanel('pause');
      } else if (state === 'paused') {
        state = 'playing';
        gameActive = true;
        hidePanel('pause');
        showPanel('hud');
      }
    }
  }

  private handleInput() {
    if (isLocked || !gameActive) return;
    if (mode === 'blind' && blindPhase === 'reveal') return;

    // XR trigger: raycast from controller
    const inp = getInput();
    const rightGp = inp?.xr?.gamepads?.right;
    if (rightGp?.getButtonDown(InputComponent.Trigger)) {
      const raySpace = (world as any).playerSpaceEntities?.raySpaces?.right?.object3D;
      if (raySpace && cardMeshGroup) {
        const origin = new Vector3();
        const dir = new Vector3(0, 0, -1);
        raySpace.getWorldPosition(origin);
        raySpace.getWorldDirection(dir);
        dir.negate();
        raycaster.set(origin, dir);
        const hits = raycaster.intersectObjects(cardMeshGroup.children, true);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          // Find which card group this belongs to
          let parent = hitObj.parent;
          while (parent && parent !== cardMeshGroup) {
            if (cards.some(c => c.mesh === parent)) break;
            parent = parent.parent;
          }
          const card = cards.find(c => c.mesh === parent);
          if (card) flipCard(card);
        }
      }
    }
  }
}

// ============================================================
// MOUSE CLICK HANDLER
// ============================================================

function setupMouseInput() {
  const canvas = document.getElementById('app');
  if (!canvas) return;

  canvas.addEventListener('click', (event: MouseEvent) => {
    if (state !== 'playing' || !gameActive || isLocked) return;
    if (mode === 'blind' && blindPhase === 'reveal') return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, world.camera);
    if (!cardMeshGroup) return;

    const hits = raycaster.intersectObjects(cardMeshGroup.children, true);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      let parent = hitObj.parent;
      while (parent && parent !== cardMeshGroup) {
        if (cards.some(c => c.mesh === parent)) break;
        parent = parent!.parent;
      }
      const card = cards.find(c => c.mesh === parent);
      if (card) flipCard(card);
    }
  });
}

// ============================================================
// BOOT
// ============================================================

async function main() {
  save = loadSave();

  const container = document.getElementById('app') as HTMLDivElement;
  world = await World.create(container, {
    xr: { offer: 'once' },
    browserControls: true,
    features: {
      physics: false,
    },
    render: {
      fov: 70,
    },
  } as any);

  // Build environment
  buildEnvironment();
  initParticles();

  // Create UI panels
  const panelConfigs: { name: string; config: string; pos: number[]; scale: number; fol: boolean }[] = [
    { name: 'title', config: './ui/title.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'modes', config: './ui/modes.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'difficulty', config: './ui/difficulty.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'hud', config: './ui/hud.json', pos: [-0.2, 0.12, -0.5], scale: 1.0, fol: true },
    { name: 'pause', config: './ui/pause.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'gameover', config: './ui/gameover.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'leaderboard', config: './ui/leaderboard.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'achievements', config: './ui/achievements.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'settings', config: './ui/settings.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'stats', config: './ui/stats.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'skins', config: './ui/skins.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'help', config: './ui/help.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false },
    { name: 'toast', config: './ui/toast.json', pos: [0, -0.12, -0.5], scale: 1.0, fol: true },
    { name: 'countdown', config: './ui/countdown.json', pos: [0, 0, -0.5], scale: 1.5, fol: true },
  ];

  for (const pc of panelConfigs) {
    const entity = world.createTransformEntity();
    entity.addComponent(PanelUI, { config: pc.config });

    if (pc.fol) {
      entity.addComponent(Follower);
      const off = entity.getVectorView(Follower, 'offsetPosition');
      if (off) { off[0] = pc.pos[0]; off[1] = pc.pos[1]; off[2] = pc.pos[2]; }
      entity.addComponent(ScreenSpace);
    }

    if (entity.object3D) {
      entity.object3D.position.set(pc.pos[0], pc.pos[1], pc.pos[2]);
      entity.object3D.scale.setScalar(pc.scale);
    }

    uiEntities[pc.name] = entity;
  }

  // Register game system
  world.registerSystem(NeonPairsSystem);

  // Setup mouse input
  setupMouseInput();
}

main().catch(console.error);
