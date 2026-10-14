import Phaser from 'phaser';
import { HUD_ICONS, HUD_PALETTE } from './hud-icons';
import { PanelUI, SKILLS, type PanelAction } from './panel-ui';
import './style.css';

const SIDEBAR_MODE = document.body.classList.contains('vscode-sidebar');
let W = 960;
let H = 540;
let HUD_HEIGHT = 96;
let HUD_Y = H - HUD_HEIGHT;
let WATER_Y = Math.max(172, Math.round(HUD_Y * .55));
// Nudge the sea painted into the sky art below the live surface so the
// distant horizon sits a little lower without moving the boat or ocean layer.
const SKY_BACKDROP_Y_OFFSET = 8;
let SEA_DEPTH = H - WATER_Y;
let SEABED_Y = HUD_Y - Math.min(64, SEA_DEPTH * .18);
let OCEAN_VIEW_HEIGHT = H - WATER_Y;
let OCEAN_SCROLL_RANGE = Math.max(WATER_Y + 24, Math.round(OCEAN_VIEW_HEIGHT * 1.4));
let OCEAN_CONTENT_HEIGHT = OCEAN_VIEW_HEIGHT + OCEAN_SCROLL_RANGE;
let OCEAN_SIDE_RANGE = Math.max(220, Math.round(W * .55));
let OCEAN_CONTENT_WIDTH = W + OCEAN_SIDE_RANGE * 2;
const AUTO_FISHING_DURATION = 10_000;
// Keep the larger boat inside both the narrow sidebar and the sky area.
let BOAT_SCALE = Math.min(1.8, (W - 32) / 156, (WATER_Y - 28) / 90);
// Only the keel sits below the surface; idle bobbing stays close to this baseline.
let BOAT_Y = WATER_Y - 22 * BOAT_SCALE;

function updateViewportMetrics(): void {
  W = Math.max(SIDEBAR_MODE ? 280 : 320, Math.round(window.innerWidth));
  H = Math.max(SIDEBAR_MODE ? 440 : 360, Math.round(window.innerHeight));
  HUD_HEIGHT = SIDEBAR_MODE ? 130 : Math.min(96, Math.max(72, Math.round(H * .16)));
  HUD_Y = H - HUD_HEIGHT;
  // Short landscape screens need a shallower sky, while tall/mobile screens
  // expose more ocean depth like the responsive reference layout.
  WATER_Y = Math.max(150, Math.round(HUD_Y * (H > W ? .45 : .55)));
  SEA_DEPTH = H - WATER_Y;
  SEABED_Y = HUD_Y - Math.min(64, SEA_DEPTH * .18);
  OCEAN_VIEW_HEIGHT = H - WATER_Y;
  OCEAN_SCROLL_RANGE = Math.max(WATER_Y + 24, Math.round(OCEAN_VIEW_HEIGHT * 1.4));
  OCEAN_CONTENT_HEIGHT = OCEAN_VIEW_HEIGHT + OCEAN_SCROLL_RANGE;
  OCEAN_SIDE_RANGE = Math.max(220, Math.round(W * .55));
  OCEAN_CONTENT_WIDTH = W + OCEAN_SIDE_RANGE * 2;
  BOAT_SCALE = Math.min(1.8, (W - 32) / 156, (WATER_Y - 28) / 90);
  BOAT_Y = WATER_Y - 22 * BOAT_SCALE;
}

updateViewportMetrics();

type HookState = 'idle' | 'dropping' | 'timing' | 'reeling';
type FishDepthZone = 'top' | 'middle' | 'bottom';
export type PanelName = 'skills' | 'shop' | 'inventory' | 'character' | 'boat' | 'codex';
export type SkillKey = 'focus' | 'precision' | 'luck' | 'treasure' | 'automation' | 'efficiency' | 'endurance' | 'frugality';

interface AmbientFishData {
  speed: number;
  direction: 1 | -1;
  waveOffset: number;
  worldX: number;
  baseY: number;
  targetY: number;
  depthMin: number;
  depthMax: number;
  nextTurnAt: number;
}

interface CatchResult {
  id: string;
  name: string;
  rarity: string;
  value: number;
  xp: number;
  color: string;
}

export interface FishDefinition extends CatchResult {
  tint: number;
  weight: number;
  minRod: number;
  minBoat: number;
  minBait: number;
  requirement?: string;
}

export interface RodDefinition { tier: number; name: string; rarity: string; cost: number; color: string; }
export interface BaitDefinition { tier: number; name: string; rarity: string; cost: number; color: string; }
export interface BoatDefinition {
  tier: number; name: string; cost: number; bonus: string; hull: number; trim: number;
  valueBonus?: number; rareBonus?: number; autoDelay?: number;
}

export interface Progress {
  captainName: string;
  coins: number;
  xp: number;
  level: number;
  skillPoints: number;
  catches: number;
  bestStreak: number;
  bait: number;
  baitStock: number[];
  selectedBait: number;
  fishInventory: Record<string, number>;
  rodLevel: number;
  hullLevel: number;
  focus: number;
  precision: number;
  luck: number;
  treasure: number;
  automation: number;
  efficiency: number;
  endurance: number;
  frugality: number;
}

const DEFAULT_PROGRESS: Progress = {
  captainName: '', coins: 0, xp: 0, level: 1, skillPoints: 1, catches: 0, bestStreak: 0,
  bait: 3, baitStock: [3, 0, 0, 0, 0], selectedBait: 0, fishInventory: {},
  rodLevel: 1, hullLevel: 1, focus: 0, precision: 0, luck: 0, treasure: 0,
  automation: 0, efficiency: 0, endurance: 0, frugality: 0,
};

const RODS: RodDefinition[] = [
  { tier: 1, name: 'Dockhand Reed', rarity: 'COMMON', cost: 0, color: '#a8c8c9' },
  { tier: 2, name: 'Copper Spinner', rarity: 'UNCOMMON', cost: 120, color: '#76c5a4' },
  { tier: 3, name: 'Silver Current', rarity: 'RARE', cost: 300, color: '#68bde1' },
  { tier: 4, name: 'Deepwater Lance', rarity: 'RARE+', cost: 650, color: '#6692df' },
  { tier: 5, name: 'Storm Bender', rarity: 'EPIC', cost: 1200, color: '#a67de0' },
  { tier: 6, name: 'Obsidian Line', rarity: 'EPIC+', cost: 2200, color: '#c16bd5' },
  { tier: 7, name: 'Frostbite Rod', rarity: 'LEGENDARY', cost: 4000, color: '#70e3ef' },
  { tier: 8, name: 'Crown Harpoon', rarity: 'LEGENDARY+', cost: 7000, color: '#ffc85a' },
  { tier: 9, name: 'Prismatic Reel', rarity: 'MYTHIC', cost: 12000, color: '#ff739d' },
  { tier: 10, name: 'Abyss Tether', rarity: 'ABYSSAL', cost: 20000, color: '#8c75ff' },
  { tier: 11, name: 'Starforged Rod', rarity: 'DIVINE', cost: 33000, color: '#fff09a' },
];

const BAITS: BaitDefinition[] = [
  { tier: 1, name: 'Dock Worms', rarity: 'COMMON', cost: 25, color: '#c9a477' },
  { tier: 2, name: 'Glow Grubs', rarity: 'UNCOMMON', cost: 90, color: '#74d59b' },
  { tier: 3, name: 'Storm Shrimp', rarity: 'RARE', cost: 250, color: '#65bfe8' },
  { tier: 4, name: 'Moon Squid', rarity: 'EPIC', cost: 650, color: '#c084e8' },
  { tier: 5, name: 'Star Essence', rarity: 'MYTHIC', cost: 1500, color: '#ffd86a' },
];

const BOATS: BoatDefinition[] = [
  { tier: 1, name: 'Rusty Minnow', cost: 0, bonus: 'Starter skiff', hull: 0x572f32, trim: 0xd4513f },
  { tier: 2, name: 'Copper Skiff', cost: 400, bonus: '+5% catch value', hull: 0x70402f, trim: 0xd98245, valueBonus: .05 },
  { tier: 3, name: 'Tide Runner', cost: 1100, bonus: 'Shorter auto cooldown', hull: 0x24506a, trim: 0x58b6c4, autoDelay: 350 },
  { tier: 4, name: 'Fortune Barge', cost: 2600, bonus: '+3% rare-fish chance', hull: 0x553b70, trim: 0xb484d9, rareBonus: .03 },
  { tier: 5, name: 'Reef Whisper', cost: 6000, bonus: 'REEF RESONANCE: catches Prism fish', hull: 0x1f685d, trim: 0x70dbc1, valueBonus: .08 },
  { tier: 6, name: 'Abyss Seeker', cost: 14000, bonus: 'ABYSS SONAR: catches Void fish', hull: 0x222a55, trim: 0x826fea, rareBonus: .05 },
  { tier: 7, name: 'Starwake Ark', cost: 30000, bonus: 'CELESTIAL NET: catches Divine fish', hull: 0x5b4322, trim: 0xffd86a, valueBonus: .12 },
];

const FISH: FishDefinition[] = [
  { id: 'harbor_herring', name: 'Harbor Herring', rarity: 'COMMON I', value: 18, xp: 10, color: '#9fc9c2', tint: 0x9fc9c2, weight: 300, minRod: 1, minBoat: 1, minBait: 1 },
  { id: 'silver_sprat', name: 'Silver Sprat', rarity: 'COMMON II', value: 24, xp: 13, color: '#c2d8d5', tint: 0xc2d8d5, weight: 250, minRod: 1, minBoat: 1, minBait: 1 },
  { id: 'blue_mackerel', name: 'Blue Mackerel', rarity: 'UNCOMMON I', value: 36, xp: 17, color: '#72b8ce', tint: 0x72b8ce, weight: 185, minRod: 2, minBoat: 1, minBait: 1 },
  { id: 'copper_perch', name: 'Copper Perch', rarity: 'UNCOMMON II', value: 45, xp: 20, color: '#d29a67', tint: 0xd29a67, weight: 150, minRod: 2, minBoat: 1, minBait: 1 },
  { id: 'emerald_bass', name: 'Emerald Bass', rarity: 'RARE I', value: 62, xp: 26, color: '#65ce94', tint: 0x65ce94, weight: 112, minRod: 2, minBoat: 2, minBait: 2 },
  { id: 'crimson_cod', name: 'Crimson Cod', rarity: 'RARE II', value: 82, xp: 32, color: '#e46f69', tint: 0xe46f69, weight: 86, minRod: 3, minBoat: 2, minBait: 2 },
  { id: 'sapphire_tuna', name: 'Sapphire Tuna', rarity: 'ELITE I', value: 108, xp: 38, color: '#598fe1', tint: 0x598fe1, weight: 64, minRod: 3, minBoat: 2, minBait: 2 },
  { id: 'ghost_eel', name: 'Ghost Eel', rarity: 'ELITE II', value: 138, xp: 45, color: '#b9c7e8', tint: 0xb9c7e8, weight: 48, minRod: 4, minBoat: 3, minBait: 2 },
  { id: 'storm_marlin', name: 'Storm Marlin', rarity: 'EPIC I', value: 185, xp: 55, color: '#8c79dc', tint: 0x8c79dc, weight: 33, minRod: 5, minBoat: 3, minBait: 3 },
  { id: 'sunscale_koi', name: 'Sunscale Koi', rarity: 'EPIC II', value: 225, xp: 64, color: '#f2b94f', tint: 0xf2b94f, weight: 26, minRod: 5, minBoat: 3, minBait: 3 },
  { id: 'obsidian_grouper', name: 'Obsidian Grouper', rarity: 'EPIC III', value: 275, xp: 74, color: '#826c95', tint: 0x826c95, weight: 19, minRod: 6, minBoat: 3, minBait: 3 },
  { id: 'frostfin_shark', name: 'Frostfin Shark', rarity: 'LEGENDARY I', value: 360, xp: 88, color: '#86e1ec', tint: 0x86e1ec, weight: 14, minRod: 7, minBoat: 4, minBait: 3 },
  { id: 'thunder_ray', name: 'Thunder Ray', rarity: 'LEGENDARY II', value: 440, xp: 102, color: '#d3b35d', tint: 0xd3b35d, weight: 10, minRod: 7, minBoat: 4, minBait: 4 },
  { id: 'crown_swordfish', name: 'Crown Swordfish', rarity: 'LEGENDARY III', value: 550, xp: 118, color: '#ffd45c', tint: 0xffd45c, weight: 7, minRod: 8, minBoat: 4, minBait: 4 },
  { id: 'prism_ray', name: 'Prism Ray', rarity: 'MYTHIC I', value: 720, xp: 140, color: '#f17fcd', tint: 0xf17fcd, weight: 5, minRod: 9, minBoat: 5, minBait: 4, requirement: 'Reef Resonance' },
  { id: 'coral_crown', name: 'Coral Crown', rarity: 'MYTHIC II', value: 880, xp: 165, color: '#ff846e', tint: 0xff846e, weight: 3.8, minRod: 9, minBoat: 5, minBait: 4, requirement: 'Reef Resonance' },
  { id: 'void_angler', name: 'Void Angler', rarity: 'ABYSSAL I', value: 1150, xp: 195, color: '#795fe0', tint: 0x795fe0, weight: 2.5, minRod: 10, minBoat: 6, minBait: 5, requirement: 'Abyss Sonar' },
  { id: 'leviathan_fry', name: 'Leviathan Fry', rarity: 'ABYSSAL II', value: 1450, xp: 225, color: '#a463ec', tint: 0xa463ec, weight: 1.6, minRod: 10, minBoat: 6, minBait: 5, requirement: 'Abyss Sonar' },
  { id: 'timeworn_oarfish', name: 'Timeworn Oarfish', rarity: 'TRANSCENDENT', value: 1850, xp: 260, color: '#ef87ff', tint: 0xef87ff, weight: .9, minRod: 11, minBoat: 6, minBait: 5, requirement: 'Abyss Sonar' },
  { id: 'celestial_coelacanth', name: 'Celestial Coelacanth', rarity: 'DIVINE', value: 2800, xp: 340, color: '#fff09a', tint: 0xfff09a, weight: .4, minRod: 11, minBoat: 7, minBait: 5, requirement: 'Celestial Net' },
];

function readProgress(): Progress {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem('retro-reel-progress-v2') ?? '{}') as Partial<Progress>;
    const progress = { ...DEFAULT_PROGRESS, ...saved };
    progress.baitStock = Array.isArray(saved.baitStock)
      ? [...saved.baitStock.slice(0, BAITS.length), ...Array(BAITS.length).fill(0)].slice(0, BAITS.length)
      : [Number(saved.bait ?? DEFAULT_PROGRESS.bait), 0, 0, 0, 0];
    progress.selectedBait = Phaser.Math.Clamp(Number(saved.selectedBait ?? 0), 0, BAITS.length - 1);
    progress.rodLevel = Phaser.Math.Clamp(Number(saved.rodLevel ?? 1), 1, RODS.length);
    progress.hullLevel = Phaser.Math.Clamp(Number(saved.hullLevel ?? 1), 1, BOATS.length);
    progress.fishInventory = saved.fishInventory && typeof saved.fishInventory === 'object' ? { ...saved.fishInventory } : {};
    progress.bait = progress.baitStock[progress.selectedBait] ?? 0;
    return progress;
  } catch {
    return { ...DEFAULT_PROGRESS, baitStock: [...DEFAULT_PROGRESS.baitStock], fishInventory: {} };
  }
}

function saveProgress(progress: Progress): void {
  try {
    globalThis.localStorage?.setItem('retro-reel-progress-v2', JSON.stringify(progress));
  } catch {
    // Some restricted VS Code webviews disable local storage.
  }
}

class ReelScene extends Phaser.Scene {
  private boat!: Phaser.GameObjects.Container;
  private boatArt!: Phaser.GameObjects.Graphics;
  private boatFlag!: Phaser.GameObjects.Graphics;
  private boatDisturbance = 0;
  private boatTravelDirection: 1 | -1 = 1;
  private starterBoat!: Phaser.GameObjects.Image;
  private starterBoatSubmerged!: Phaser.GameObjects.Image;
  private rod!: Phaser.GameObjects.Image;
  private landedFish!: Phaser.GameObjects.Image;
  private castElapsed = 0;
  private castFrom = new Phaser.Math.Vector2();
  private castTargetX = 0;
  private reelElapsed = 0;
  private reelFrom = new Phaser.Math.Vector2();
  private hook!: Phaser.GameObjects.Arc;
  private line!: Phaser.GameObjects.Graphics;
  private fish!: Phaser.GameObjects.Group;
  private surfaceWaveFill!: Phaser.GameObjects.Graphics;
  private waves!: Phaser.GameObjects.Graphics;
  private boatWake!: Phaser.GameObjects.Graphics;
  private surfaceGlow!: Phaser.GameObjects.Graphics;
  private surfaceSparkles!: Phaser.GameObjects.Graphics;
  private surfaceFoam!: Phaser.GameObjects.TileSprite;
  private oceanBubbles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private skyBackdrop!: Phaser.GameObjects.Image;
  private skyBackdropWidth = W;
  private oceanDepthFill!: Phaser.GameObjects.Graphics;
  private reefBackdrop!: Phaser.GameObjects.Image;
  private reefBackdropWidth = W;
  private reefBlend!: Phaser.GameObjects.Graphics;
  private reefBackdropBaseY = WATER_Y;
  private oceanMaskShape!: Phaser.GameObjects.Graphics;
  private oceanMask!: Phaser.Display.Masks.GeometryMask;
  private depthText!: Phaser.GameObjects.Text;
  private oceanDepthOffset = 0;
  private oceanDepthTarget = 0;
  private oceanXOffset = OCEAN_SIDE_RANGE;
  private oceanXTarget = OCEAN_SIDE_RANGE;
  private oceanDragging = false;
  private oceanDragX = 0;
  private oceanDragY = 0;
  private boatWorldX = OCEAN_SIDE_RANGE + W / 2;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private statusText!: Phaser.GameObjects.Text;
  private castButtonText!: Phaser.GameObjects.Text;
  private autoIndicator!: Phaser.GameObjects.Rectangle;
  private profileStats?: Phaser.GameObjects.Text;
  private timingPanel!: Phaser.GameObjects.Container;
  private timingZone!: Phaser.GameObjects.Rectangle;
  private timingMarker!: Phaser.GameObjects.Arc;
  private timingLabel!: Phaser.GameObjects.Text;
  private activePanel?: Phaser.GameObjects.Container;
  private panelUI?: PanelUI;
  private hookState: HookState = 'idle';
  private progress = readProgress();
  private autoFishing = false;
  private streak = 0;
  private lastSpawn = 0;
  private bobTime = 0;
  private hookTargetY = 330;
  private timingValue = 0;
  private timingDirection: 1 | -1 = 1;
  private zoneStart = .42;
  private zoneSize = .18;
  private autoResolveAt = 0;
  private autoStartedAt = 0;
  private automaticCast = false;
  private nextAutoCastAt = 0;
  private lastCatch?: CatchResult;
  private profileReady = false;
  private shopCategory: 'rods' | 'bait' = 'rods';
  private shopPage = 0;
  private inventoryPage = 0;
  private codexPage = 0;

  constructor() { super('reel'); }

  preload(): void {
    this.load.image('sky-backdrop', new URL('./assets/sky-backdrop-expanded-v2.png', import.meta.url).href);
    this.load.image('starter-boat', new URL('./assets/starter-boat-v4.png', import.meta.url).href);
    this.load.image('starter-captain', new URL('./assets/starter-captain.png', import.meta.url).href);
    this.load.image('starter-rod', new URL('./assets/starter-rod.png', import.meta.url).href);
    this.load.image('ambient-fish-sprites', new URL('./assets/ambient-fish-sprites.png', import.meta.url).href);
    this.load.image('reef-backdrop', new URL('./assets/reef-backdrop-expanded-v2.png', import.meta.url).href);
  }

  create(): void {
    this.panelUI?.destroy();
    this.activePanel = undefined;
    this.hookState = 'idle';
    this.oceanDepthOffset = 0;
    this.oceanDepthTarget = 0;
    this.oceanXOffset = OCEAN_SIDE_RANGE;
    this.oceanXTarget = OCEAN_SIDE_RANGE;
    this.boatWorldX = OCEAN_SIDE_RANGE + W / 2;
    this.reefBackdropBaseY = WATER_Y;
    this.progress = readProgress();
    this.panelUI = new PanelUI(action => this.handlePanelAction(action), () => this.closePanel());
    if (!this.textures.exists('fish')) this.createTextures();
    const ambientFish = this.textures.get('ambient-fish-sprites');
    ambientFish.setFilter(Phaser.Textures.FilterMode.NEAREST);
    // The generated fish are intentionally spaced by silhouette rather than
    // centered in equal thirds, so use their measured alpha bounds as frames.
    if (!ambientFish.has('round')) ambientFish.add('round', 0, 60, 194, 445, 359);
    if (!ambientFish.has('classic')) ambientFish.add('classic', 0, 587, 178, 688, 395);
    if (!ambientFish.has('long')) ambientFish.add('long', 0, 1312, 234, 847, 303);
    this.drawWorld();
    this.fish = this.add.group();
    this.line = this.add.graphics().setDepth(8);
    this.hook = this.add.circle(W / 2, WATER_Y + 5, 5, 0xf6dda0)
      .setStrokeStyle(2, 0x44312e).setDepth(10).setVisible(false);
    this.createBoat();
    this.landedFish = this.add.image(0, 0, 'fish').setDepth(11).setVisible(false);
    this.createHud();
    this.createTimingPanel();
    this.createOceanDepthControls();
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('A,D,SPACE,ESC') as Record<string, Phaser.Input.Keyboard.Key>;
    this.spawnSchool();
    this.updateHud();
    this.game.events.off('captain-ready', this.handleCaptainReady, this);
    this.game.events.on('captain-ready', this.handleCaptainReady, this);
  }

  private handleCaptainReady(name: string): void {
    this.progress = readProgress();
    this.profileReady = true;
    this.updateHud();
    this.flashStatus(`WELCOME ABOARD, ${name.toUpperCase()}!`, '#fff1be');
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, .05);
    this.bobTime += dt;
    this.updateOceanDepth(dt);
    this.drawSurfaceWaves();
    this.drawBoatFlag();
    this.surfaceSparkles.setAlpha(.8 + Math.sin(this.bobTime * 1.6) * .16);
    this.surfaceFoam.tilePositionX = -Math.floor(this.bobTime * 3) % 192;
    this.surfaceFoam.setAlpha(.5 + Math.sin(this.bobTime * .9) * .15);
    if (!this.profileReady) {
      this.updateFish(dt);
      this.updateLine();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) && this.activePanel) this.closePanel();
    if (Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && !this.activePanel) this.handleFishingAction();

    this.updateBoat(dt);
    this.updateHook(time, dt);
    this.updateFish(dt);
    if (time - this.lastSpawn > 1800 && this.fish.countActive(true) < 14) {
      this.spawnFish();
      this.lastSpawn = time;
    }
    if (this.autoFishing && this.hookState === 'idle' && !this.activePanel && time >= this.nextAutoCastAt) {
      this.startCast();
    }
    this.updateLine();
  }

  private createTextures(): void {
    const g = this.add.graphics();

    // A crisp, shaded pixel fish. Neutral values preserve their contrast when
    // the sprite is tinted to a different underwater color.
    g.fillStyle(0x1d2b34)
      .fillRect(6, 3, 20, 12).fillRect(3, 5, 25, 8)
      .fillTriangle(7, 9, 0, 2, 0, 16)
      .fillTriangle(13, 14, 20, 18, 22, 13);
    g.fillStyle(0xf4f0d6)
      .fillRect(7, 5, 18, 8).fillRect(4, 7, 23, 4)
      .fillTriangle(6, 9, 1, 5, 1, 13);
    g.fillStyle(0xb9ced0).fillRect(8, 11, 12, 2).fillRect(12, 5, 8, 1);
    g.fillStyle(0xffffff).fillRect(22, 6, 3, 3);
    g.fillStyle(0x17242c).fillRect(23, 7, 2, 2).fillRect(27, 9, 2, 1);
    g.generateTexture('fish', 30, 19).clear();

    // Hollow pixel bubble with a small highlight; scaling this texture creates
    // multiple readable bubble sizes without soft vector edges.
    g.fillStyle(0xffffff, .8)
      .fillRect(2, 0, 4, 1).fillRect(1, 1, 1, 2).fillRect(6, 1, 1, 2)
      .fillRect(0, 3, 1, 3).fillRect(7, 3, 1, 3)
      .fillRect(1, 6, 1, 1).fillRect(6, 6, 1, 1).fillRect(2, 7, 4, 1);
    g.fillStyle(0xffffff).fillRect(2, 1, 1, 2);
    g.generateTexture('bubble', 8, 8).clear();

    g.fillStyle(0xffffff)
      .fillRect(16, 1, 15, 1).fillRect(78, 2, 22, 1).fillRect(148, 1, 18, 1)
      .fillRect(41, 5, 19, 1).fillRect(112, 6, 14, 1).fillRect(171, 5, 12, 1);
    g.generateTexture('surface-foam', 192, 8).destroy();
  }

  private drawWorld(): void {
    const world = this.add.graphics();
    this.drawSky();
    // Keep the reference's bright blue water through the pale, hazy seabed.
    world.fillGradientStyle(0x498df6, 0x498df6, 0x639ff5, 0x639ff5)
      .fillRect(0, WATER_Y, W, SEA_DEPTH);
    this.oceanMaskShape = this.add.graphics().setVisible(false);
    this.oceanMaskShape.fillStyle(0xffffff).fillRect(0, WATER_Y, W, H - WATER_Y);
    this.oceanMask = this.oceanMaskShape.createGeometryMask();
    this.drawReef();
    // Keep the solid water lip behind the boat while its bright crest crosses
    // in front; this preserves the visible blue submerged-hull treatment.
    this.surfaceWaveFill = this.add.graphics().setDepth(11);
    this.waves = this.add.graphics().setDepth(13);
    this.boatWake = this.add.graphics().setDepth(14);
    this.drawSurfaceWaves();
    this.surfaceGlow = this.add.graphics().setDepth(13);
    this.surfaceGlow.fillStyle(0xffffff, .36).fillRect(0, WATER_Y - 2, W, 4);
    this.surfaceGlow.fillStyle(0xffffff, .27).fillRect(0, WATER_Y + 2, W, 3);
    this.surfaceGlow.fillStyle(0xffffff, .18).fillRect(0, WATER_Y + 5, W, 3);
    this.surfaceGlow.fillStyle(0xffffff, .1).fillRect(0, WATER_Y + 8, W, 3);
    this.surfaceGlow.fillStyle(0xffffff, .04).fillRect(0, WATER_Y + 11, W, 3);
    this.surfaceSparkles = this.add.graphics().setDepth(13);
    const sparkleCount = Math.max(24, Math.floor(W / 23));
    for (let i = 0; i < sparkleCount; i++) {
      const x = Phaser.Math.Between(4, W - 4);
      const y = Phaser.Math.Between(WATER_Y, WATER_Y + 7);
      const width = Math.random() < .22 ? Phaser.Math.Between(3, 5) : Phaser.Math.Between(1, 2);
      const alpha = Phaser.Math.FloatBetween(.38, .82);
      this.surfaceSparkles.fillStyle(0xffffff, alpha).fillRect(x, y, width, 1);
      if (width >= 4 && Math.random() < .5) {
        this.surfaceSparkles.fillStyle(0xffffff, alpha * .55).fillRect(x + Math.floor(width / 2), y - 1, 1, 3);
      }
    }
    this.surfaceFoam = this.add.tileSprite(W / 2, WATER_Y, W, 8, 'surface-foam')
      .setDepth(13).setAlpha(.5);
    this.oceanBubbles = this.add.particles(0, 0, 'bubble', {
      x: { min: 18, max: W - 18 },
      y: { min: WATER_Y + 34, max: Math.max(WATER_Y + 48, SEABED_Y - 12) },
      lifespan: { min: 2800, max: 6200 },
      speedX: { min: -3, max: 3 }, speedY: { min: -9, max: -23 },
      scale: { start: .18, end: .48 }, alpha: { start: .3, end: 0 },
      frequency: 310,
      tint: [0xd5efff, 0xbfe9ee, 0xf0f6d8],
    }).setDepth(4).setMask(this.oceanMask);
  }

  private drawSurfaceWaves(): void {
    const step = SIDEBAR_MODE ? 3 : 4;
    const waveY = (x: number): number => {
      let height = Math.sin(x * .036 + this.bobTime * 1.45) * 1.7
        + Math.sin(x * .083 - this.bobTime * .9) * .65;
      if (this.boatDisturbance > .01) {
        const relativeX = (x - this.boat.x) * this.boatTravelDirection;
        const radius = (relativeX < 0 ? 124 : 70) * BOAT_SCALE;
        const proximity = Phaser.Math.Clamp(1 - Math.abs(relativeX) / radius, 0, 1);
        const easedProximity = proximity * proximity;
        height += easedProximity * this.boatDisturbance * (
          Math.sin(x * .21 - this.bobTime * 8.8 * this.boatTravelDirection) * 2.35
          + Math.sin(x * .39 + this.bobTime * 11.4) * .75
        );
      }
      return WATER_Y + Math.round(height);
    };

    this.surfaceWaveFill.clear().fillStyle(0x498df6, 1)
      .beginPath().moveTo(0, waveY(0));
    for (let x = step; x <= W; x += step) this.surfaceWaveFill.lineTo(x, waveY(x));
    this.surfaceWaveFill.lineTo(W, WATER_Y + 10).lineTo(0, WATER_Y + 10)
      .closePath().fillPath();

    this.waves.clear().lineStyle(1.5, 0xe2f8f0, .82)
      .beginPath().moveTo(0, waveY(0));
    for (let x = step; x <= W; x += step) this.waves.lineTo(x, waveY(x));
    this.waves.strokePath();

    this.boatWake.clear();
    if (this.boatDisturbance > .025) {
      const wake = this.boatWake;
      const strength = this.boatDisturbance;
      const direction = this.boatTravelDirection;
      const phase = Math.floor(this.bobTime * 18) % 12;
      wake.fillStyle(0xffffff, .3 + strength * .48);
      for (let index = 0; index < 4; index++) {
        const distance = (24 + index * 20 + phase) * BOAT_SCALE;
        const length = Math.max(3, Math.round((13 - index * 2) * BOAT_SCALE * strength));
        const x = Math.round(this.boat.x - direction * distance);
        const y = WATER_Y + 2 + (index % 2) * 3;
        wake.fillRect(direction === 1 ? x - length : x, y, length, 1);
      }

      const leadingEdge = Math.round(this.boat.x + direction * 60 * BOAT_SCALE);
      const trailingEdge = Math.round(this.boat.x - direction * 57 * BOAT_SCALE);
      const outwardRect = (edge: number, travelDirection: 1 | -1, length: number, y: number): void => {
        wake.fillRect(travelDirection === 1 ? edge : edge - length, y, length, 1);
      };

      // A compact stack of bright pixels breaks over the leading end of the
      // hull. The longer, lower bars make the splash read against a bright sky.
      wake.fillStyle(0xffffff, .5 + strength * .45);
      outwardRect(leadingEdge, direction, Math.round(13 * BOAT_SCALE), WATER_Y);
      outwardRect(leadingEdge, direction, Math.round(9 * BOAT_SCALE), WATER_Y - 2);
      outwardRect(leadingEdge, direction, Math.round(5 * BOAT_SCALE), WATER_Y - 4);
      outwardRect(leadingEdge, direction, Math.round(2 * BOAT_SCALE), WATER_Y - 6);

      // Churn fans out from the opposite end and swaps sides immediately when
      // sailing direction changes.
      const wakeDirection = -direction as 1 | -1;
      wake.fillStyle(0xe8fbff, .38 + strength * .42);
      outwardRect(trailingEdge, wakeDirection, Math.round(24 * BOAT_SCALE), WATER_Y + 1);
      outwardRect(trailingEdge, wakeDirection, Math.round(18 * BOAT_SCALE), WATER_Y + 3);
      outwardRect(trailingEdge, wakeDirection, Math.round(10 * BOAT_SCALE), WATER_Y + 5);
    }
  }

  private drawSky(): void {
    const skyTexture = this.textures.get('sky-backdrop');
    skyTexture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    const skyFrame = this.textures.getFrame('sky-backdrop')!;
    // Scale raster scenery only by whole pixels. Fractionally enlarging it to
    // the full scrollable world made the pixel art soft on ultrawide windows.
    const skyScale = Math.max(1, Math.ceil(W / skyFrame.width));
    this.skyBackdropWidth = skyFrame.width * skyScale;
    const skyHeight = skyFrame.height * skyScale;
    this.skyBackdrop = this.add.image(
      -this.backdropOffset(this.skyBackdropWidth), WATER_Y + SKY_BACKDROP_Y_OFFSET, 'sky-backdrop',
    )
      .setOrigin(0, 1).setDisplaySize(this.skyBackdropWidth, skyHeight);
  }

  private drawReef(): void {
    // A single atmospheric scene embeds the corals in the seabed instead of
    // presenting separate, collectible-looking plant sprites.
    this.textures.get('reef-backdrop').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const seaColor = 0x498df6;
    this.oceanDepthFill = this.add.graphics().setPosition(-this.oceanXOffset, 0)
      .setDepth(1).setMask(this.oceanMask);
    this.oceanDepthFill.fillStyle(seaColor)
      .fillRect(0, WATER_Y, OCEAN_CONTENT_WIDTH, OCEAN_CONTENT_HEIGHT);

    const reefFrame = this.textures.getFrame('reef-backdrop')!;
    const reefScale = Math.max(
      1,
      Math.ceil(W / reefFrame.width),
      Math.ceil(OCEAN_CONTENT_HEIGHT / reefFrame.height),
    );
    this.reefBackdropWidth = reefFrame.width * reefScale;
    const reefHeight = reefFrame.height * reefScale;
    this.reefBackdropBaseY = WATER_Y + OCEAN_CONTENT_HEIGHT - reefHeight;
    this.reefBackdrop = this.add.image(-this.backdropOffset(this.reefBackdropWidth), this.reefBackdropBaseY, 'reef-backdrop')
      .setOrigin(0).setDisplaySize(this.reefBackdropWidth, reefHeight).setDepth(1)
      .setMask(this.oceanMask);

    const blendHeight = Math.min(130, reefHeight * .24);
    this.reefBlend = this.add.graphics().setPosition(-this.oceanXOffset, 0)
      .setDepth(1).setMask(this.oceanMask);
    this.reefBlend.fillGradientStyle(
      seaColor, seaColor, seaColor, seaColor, .98, .98, 0, 0,
    ).fillRect(0, this.reefBackdropBaseY, OCEAN_CONTENT_WIDTH, blendHeight);
  }

  private backdropOffset(displayWidth: number): number {
    const overflow = Math.max(0, displayWidth - W);
    const travel = Math.max(1, OCEAN_SIDE_RANGE * 2);
    return overflow * Phaser.Math.Clamp(this.oceanXOffset / travel, 0, 1);
  }

  private createOceanDepthControls(): void {
    this.depthText = this.add.text(W - 10, WATER_Y + 15, 'DEPTH 0m  ·  SCROLL / DRAG', {
      fontFamily: 'DM Mono', fontSize: SIDEBAR_MODE ? '7px' : '9px', color: '#e8fbff',
      backgroundColor: '#174f7f', padding: { x: 5, y: 3 },
    }).setOrigin(1, 0).setDepth(20).setAlpha(.72);

    const overOcean = (pointer: Phaser.Input.Pointer): boolean => {
      const surfaceY = WATER_Y - this.oceanDepthOffset;
      return pointer.y > Math.max(0, surfaceY + 12) && pointer.y < H && !this.activePanel;
    };
    this.input.on('wheel', (
      pointer: Phaser.Input.Pointer,
      _over: Phaser.GameObjects.GameObject[],
      _deltaX: number,
      deltaY: number,
    ) => {
      if (!overOcean(pointer)) return;
      this.oceanDepthTarget = Phaser.Math.Clamp(
        this.oceanDepthTarget + deltaY * .55, 0, OCEAN_SCROLL_RANGE,
      );
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!overOcean(pointer)) return;
      this.oceanDragging = true;
      this.oceanDragX = pointer.x;
      this.oceanDragY = pointer.y;
      this.game.canvas.style.cursor = 'grabbing';
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.oceanDragging || !pointer.isDown) return;
      const deltaX = pointer.x - this.oceanDragX;
      const deltaY = pointer.y - this.oceanDragY;
      this.oceanDragX = pointer.x;
      this.oceanDragY = pointer.y;
      this.oceanXTarget = Phaser.Math.Clamp(
        this.oceanXTarget - deltaX, 0, OCEAN_CONTENT_WIDTH - W,
      );
      this.oceanDepthTarget = Phaser.Math.Clamp(
        this.oceanDepthTarget - deltaY, 0, OCEAN_SCROLL_RANGE,
      );
    });
    const stopDragging = (): void => {
      this.oceanDragging = false;
      this.game.canvas.style.cursor = 'default';
    };
    this.input.on('pointerup', stopDragging);
    this.input.on('gameout', stopDragging);
  }

  private updateOceanDepth(dt: number): void {
    const response = 1 - Math.exp(-dt * 10);
    this.oceanXOffset = Phaser.Math.Linear(this.oceanXOffset, this.oceanXTarget, response);
    this.oceanDepthOffset = Phaser.Math.Linear(
      this.oceanDepthOffset, this.oceanDepthTarget, response,
    );
    const surfaceY = Math.max(0, WATER_Y - this.oceanDepthOffset);
    this.oceanMaskShape.clear().fillStyle(0xffffff).fillRect(0, surfaceY, W, H - surfaceY);
    this.skyBackdrop.x = -this.backdropOffset(this.skyBackdropWidth);
    this.skyBackdrop.y = WATER_Y + SKY_BACKDROP_Y_OFFSET - this.oceanDepthOffset;
    this.oceanDepthFill.x = -this.oceanXOffset;
    this.oceanDepthFill.y = -this.oceanDepthOffset;
    this.reefBackdrop.x = -this.backdropOffset(this.reefBackdropWidth);
    this.reefBackdrop.y = this.reefBackdropBaseY - this.oceanDepthOffset;
    this.reefBlend.x = -this.oceanXOffset;
    this.reefBlend.y = -this.oceanDepthOffset;
    this.surfaceWaveFill.y = -this.oceanDepthOffset;
    this.waves.y = -this.oceanDepthOffset;
    this.boatWake.y = -this.oceanDepthOffset;
    this.surfaceGlow.y = -this.oceanDepthOffset;
    this.surfaceSparkles.y = -this.oceanDepthOffset;
    this.surfaceFoam.y = WATER_Y - this.oceanDepthOffset;
    this.oceanBubbles.y = -this.oceanDepthOffset * .7;
    this.boat.x = this.boatWorldX - this.oceanXOffset;
    this.boat.y = BOAT_Y - this.oceanDepthOffset;
    const metres = Math.round(this.oceanDepthOffset * .35);
    this.depthText.setText(`DEPTH ${metres}m  ·  SCROLL / DRAG`);
  }

  private createBoat(): void {
    for (const key of ['starter-boat', 'starter-captain', 'starter-rod']) {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.boatArt = this.add.graphics();
    this.boatFlag = this.add.graphics();
    const boatFrame = this.textures.getFrame('starter-boat')!;
    const boatWidth = 144;
    const boatHeight = boatWidth * boatFrame.height / boatFrame.width;
    const boatBottom = 31;
    const boatTop = boatBottom - boatHeight;
    const makeBoatLayer = () => this.add.image(0, boatBottom, 'starter-boat')
      .setOrigin(.5, 1).setDisplaySize(boatWidth, boatHeight);
    this.starterBoat = makeBoatLayer();

    // The near gunwale starts 69% down this sprite. Only that foreground section
    // overlaps the crew; the far rail, crate and mast stay behind them.
    const railTop = Math.round(boatFrame.height * .69);
    const foregroundHull = makeBoatLayer()
      .setCrop(0, railTop, boatFrame.width, boatFrame.height - railTop);

    // A filled tint blends the sea color over the wood instead of multiplying it
    // into a darker brown. Texture alpha confines the wash to the hull silhouette.
    const localWaterline = (WATER_Y - BOAT_Y) / BOAT_SCALE;
    const cropTop = Math.round(boatFrame.height * (localWaterline - boatTop) / boatHeight);
    this.starterBoatSubmerged = makeBoatLayer()
      .setTintFill(0x498df6).setAlpha(.72)
      .setCrop(0, cropTop, boatFrame.width, boatFrame.height - cropTop);
    // The torso ends at 87% of the padded captain image. Bury that edge below the
    // near rail while keeping the head, shoulders and rod hand above it.
    const captain = this.add.image(22, 14, 'starter-captain').setOrigin(.5, .87).setDisplaySize(28, 29);
    this.rod = this.add.image(26, 11.8, 'starter-rod').setOrigin(.27, .83).setDisplaySize(22, 41);
    this.boat = this.add.container(W / 2, BOAT_Y, [
      this.starterBoat, this.boatFlag, this.rod, captain, foregroundHull, this.boatArt,
      this.starterBoatSubmerged,
    ])
      .setScale(BOAT_SCALE).setDepth(12);
    this.paintBoat();
    this.drawBoatFlag();
  }

  private drawBoatFlag(): void {
    if (!this.boatFlag) return;
    const frame = Math.floor(this.bobTime * 8) % 4;
    const tipOffset = [0, 1, 0, -1][frame];
    const foldOffset = [0, -1, 1, 0][frame];
    const flag = this.boatFlag.clear();

    flag.lineStyle(1, 0x59636a, .9).fillStyle(0xf7f3df, 1)
      .beginPath()
      .moveTo(-29, -29)
      .lineTo(-15, -27 + tipOffset)
      .lineTo(-18, -24 + foldOffset)
      .lineTo(-29, -24)
      .closePath().fillPath().strokePath();
    flag.lineStyle(1, 0xffffff, .9)
      .beginPath().moveTo(-28, -28).lineTo(-17, -26 + tipOffset).strokePath();
    flag.fillStyle(0xc9d5d4, .85)
      .fillRect(-28, -24, Math.max(5, 10 + foldOffset), 1);
  }

  private paintBoat(): void {
    const tier = Phaser.Math.Clamp(this.progress.hullLevel, 1, BOATS.length);
    const boat = BOATS[tier - 1];
    const art = this.boatArt.clear();
    this.starterBoat.setVisible(true).clearTint();
    if (tier === 1) return;
    // Overlay upgrade fittings on the illustrated hull instead of replacing it.
    art.fillStyle(boat.trim, .9).fillRoundedRect(-33, 18, 68, 2, 1);
    if (tier >= 3) art.fillStyle(0x15394b).fillRoundedRect(-56, 11, 8, 12, 2).fillCircle(-55, 25, 3);
    if (tier >= 4) {
      art.lineStyle(1.5, 0x79513c).lineBetween(-42, 10, -42, -26);
      art.fillStyle(boat.trim).fillTriangle(-42, -26, -29, -21, -42, -16);
    }
    if (tier >= 5) art.lineStyle(1.5, 0x7cf1db).lineBetween(-14, 10, -17, -37).strokeCircle(-17, -39, 3);
    if (tier >= 6) art.fillStyle(0x9d91ff).fillCircle(-17, -39, 2).fillCircle(-49, 12, 2);
    if (tier >= 7) art.fillStyle(0xffef91, .9).fillCircle(-41, 16, 2).fillCircle(42, 16, 2);
  }

  private createHud(): void {
    this.statusText = this.add.text(W / 2, HUD_Y - 22, '', {
      fontFamily: 'DM Mono', fontSize: SIDEBAR_MODE ? '9px' : '12px', color: '#fff1be',
      backgroundColor: '#082b3b', padding: { x: 9, y: 5 },
      wordWrap: { width: W - 44 }, align: 'center',
    }).setOrigin(.5).setDepth(23).setAlpha(0);
    const size = 44;
    const edge = 12;
    const top = edge + size / 2;
    const step = size + 10;
    // Small utility buttons leave the center and bottom of the scene open.
    (['inventory', 'shop', 'codex'] as const).forEach((panel, index) => {
      this.createHudIcon(edge + size / 2, top + index * step, size, panel);
    });
    (['character', 'skills', 'boat'] as const).forEach((panel, index) => {
      this.createHudIcon(W - edge - size / 2, top + index * step, size, panel);
    });
    this.createHudIcon(W - edge - size / 2 - step, top, size, 'cast');
  }

  private createHudIcon(x: number, y: number, size: number, panel: PanelName | 'cast'): void {
    const frame = this.add.graphics();
    const icon = this.add.graphics();
    const half = size / 2;
    const drawFrame = (hover = false, pressed = false): void => {
      frame.clear();
      const box = (inset: number, color: number, offsetY = 0): void => {
        const width = size - inset * 2;
        frame.fillStyle(color)
          .fillRect(-half + inset + 2, -half + inset + offsetY, width - 4, width)
          .fillRect(-half + inset, -half + inset + 2 + offsetY, width, width - 4);
      };
      box(0, 0x243039, 3);
      box(0, 0x243039);
      box(2, pressed ? 0xb7c1c1 : hover ? 0xf8faf2 : 0xdce2dd);
      frame.fillStyle(pressed ? 0x9ca8aa : 0xffffff)
        .fillRect(-half + 4, -half + 2, size - 8, 2)
        .fillRect(-half + 2, -half + 4, 2, size - 8);
      frame.fillStyle(0x9ca8aa)
        .fillRect(-half + 4, half - 4, size - 8, 2)
        .fillRect(half - 4, -half + 4, 2, size - 8);
    };
    drawFrame();
    const pixel = 2;
    HUD_ICONS[panel].forEach((row, rowIndex) => {
      [...row].forEach((color, column) => {
        if (color === '.') return;
        icon.fillStyle(0x061820, .48).fillRect(
          (column - 8) * pixel + 1, (rowIndex - 8) * pixel + 2, pixel, pixel,
        );
      });
    });
    HUD_ICONS[panel].forEach((row, rowIndex) => {
      [...row].forEach((color, column) => {
        if (color === '.') return;
        icon.fillStyle(HUD_PALETTE[color]).fillRect(
          (column - 8) * pixel, (rowIndex - 8) * pixel, pixel, pixel,
        );
      });
    });
    icon.setScale(1.06);
    const button = this.add.container(x, y, [frame, icon]).setDepth(22).setSize(size, size)
      .setName(panel).setInteractive({ useHandCursor: true });
    const tooltip = panel === 'character' ? 'PROFILE' : panel === 'cast' ? 'CAST / REEL [SPACE]'
      : panel === 'codex' ? 'FISH COLLECTION' : panel.toUpperCase();
    const label = this.add.text(x < W / 2 ? x - half : x + half, y + half + 8, tooltip, {
      fontFamily: 'DM Mono', fontSize: '10px', color: '#fff1be',
      backgroundColor: '#102c3b', padding: { x: 8, y: 6 },
    }).setOrigin(x < W / 2 ? 0 : 1, 0).setDepth(25).setVisible(false);
    if (panel === 'cast') this.castButtonText = label;
    if (panel === 'character') {
      this.autoIndicator = this.add.rectangle(half - 3, half - 3, 8, 8, 0x60d394)
        .setStrokeStyle(2, 0x243039).setVisible(false);
      button.add(this.autoIndicator);
    }
    button.on('pointerover', () => { drawFrame(true); label.setVisible(!this.activePanel); });
    button.on('pointerout', () => { drawFrame(); icon.y = 0; label.setVisible(false); });
    button.on('pointerdown', () => { drawFrame(true, true); icon.y = 2; });
    button.on('pointerup', () => {
      drawFrame(); icon.y = 0; label.setVisible(false);
      if (!this.profileReady || this.activePanel) return;
      if (panel === 'cast') this.handleFishingAction();
      else this.openPanel(panel);
    });
  }

  private createTimingPanel(): void {
    const panelWidth = Math.min(500, W - 28);
    const y = Math.min(HUD_Y - 58, WATER_Y + 190);
    const bg = this.add.rectangle(W / 2, y, panelWidth, 72, 0x041722, .95).setStrokeStyle(3, 0xffdf9d);
    const rail = this.add.rectangle(W / 2, y + 12, panelWidth - 52, 15, 0x0a2a37).setStrokeStyle(2, 0x547c80);
    this.timingZone = this.add.rectangle(0, y + 12, 80, 13, 0x60d394, .8).setOrigin(0, .5);
    this.timingMarker = this.add.circle(0, y + 12, 8, 0xffdf9d).setStrokeStyle(3, 0x9c3f35);
    this.timingLabel = this.add.text(W / 2, y - 18, 'HIT SPACE IN THE GREEN ZONE', {
      fontFamily: 'DM Mono', fontSize: SIDEBAR_MODE ? '9px' : '12px', color: '#fff1be',
    }).setOrigin(.5);
    this.timingPanel = this.add.container(0, 0, [bg, rail, this.timingZone, this.timingMarker, this.timingLabel])
      .setDepth(30).setVisible(false);
  }

  private updateBoat(dt: number): void {
    let move = 0;
    const canSteer = this.hookState === 'idle' && !this.activePanel;
    if (canSteer && (this.cursors.left.isDown || this.keys.A.isDown)) move--;
    if (canSteer && (this.cursors.right.isDown || this.keys.D.isDown)) move++;
    if (move !== 0) this.boatTravelDirection = move as 1 | -1;
    const wakeResponse = 1 - Math.exp(-dt * (move === 0 ? 4.2 : 9));
    this.boatDisturbance = Phaser.Math.Linear(this.boatDisturbance, Math.abs(move), wakeResponse);
    if (!canSteer) return;
    const edge = 78 * BOAT_SCALE;
    this.boatWorldX = Phaser.Math.Clamp(
      this.boatWorldX + move * 170 * dt, edge, OCEAN_CONTENT_WIDTH - edge,
    );
    const screenX = this.boatWorldX - this.oceanXOffset;
    const leftFollow = W * .34;
    const rightFollow = W * .66;
    if (move < 0 && screenX < leftFollow) this.oceanXTarget = this.boatWorldX - leftFollow;
    if (move > 0 && screenX > rightFollow) this.oceanXTarget = this.boatWorldX - rightFollow;
    this.oceanXTarget = Phaser.Math.Clamp(this.oceanXTarget, 0, OCEAN_CONTENT_WIDTH - W);
    this.boat.x = this.boatWorldX - this.oceanXOffset;
  }

  private handleFishingAction(): void {
    if (this.activePanel || this.autoFishing || this.automaticCast) return;
    if (this.hookState === 'idle') this.startCast();
    else if (this.hookState === 'timing') this.resolveManualCatch();
  }

  private startCast(): void {
    if (this.hookState !== 'idle') return;
    let selectedStock = this.progress.baitStock[this.progress.selectedBait] ?? 0;
    let receivedRelief = false;
    const totalBait = this.progress.baitStock.reduce((sum, stock) => sum + stock, 0);
    const needsDockRelief = this.progress.catches === 0
      && this.progress.coins < BAITS[0].cost
      && totalBait === 0;
    if (selectedStock <= 0 && needsDockRelief) {
      this.progress.selectedBait = 0;
      this.progress.baitStock[0] = 3;
      this.progress.bait = 3;
      selectedStock = 3;
      receivedRelief = true;
      saveProgress(this.progress);
      this.updateHud();
    }
    if (selectedStock <= 0) {
      if (this.autoFishing) this.toggleAutoFishing();
      this.flashStatus('OUT OF BAIT — VISIT THE SHOP', '#ff8c72');
      this.shopCategory = 'bait';
      this.shopPage = 0;
      this.openPanel('shop');
      return;
    }
    this.progress.baitStock[this.progress.selectedBait]--;
    this.progress.bait = this.progress.baitStock[this.progress.selectedBait];
    saveProgress(this.progress);
    this.updateHud();
    this.automaticCast = this.autoFishing;
    this.hookState = 'dropping';
    // Fishing happens at the surface; the swimming fish remain ambient scenery.
    this.hookTargetY = WATER_Y + 3;
    this.castElapsed = 0;
    this.castFrom.copy(this.rodTip());
    this.castTargetX = Phaser.Math.Clamp(this.boat.x + 95 * BOAT_SCALE, 16, W - 16);
    this.hook.setPosition(this.castFrom.x, this.castFrom.y).setVisible(true);
    this.castButtonText.setText('DROPPING…');
    this.flashStatus(
      receivedRelief ? 'DOCKMASTER RELIEF — 3 FREE WORMS' : this.autoFishing ? 'AUTO CAST DEPLOYED' : 'LINE DROPPING…',
      receivedRelief ? '#79dfa4' : '#87cbd0',
    );
  }

  private updateHook(time: number, dt: number): void {
    if (this.hookState === 'idle') return;
    if (this.hookState === 'dropping') {
      this.castElapsed += dt;
      const p = Math.min(1, this.castElapsed / .65);
      this.rod.setAngle(-18 * Math.sin(p * Math.PI));
      this.hook.setPosition(
        Phaser.Math.Linear(this.castFrom.x, this.castTargetX, p),
        Phaser.Math.Linear(this.castFrom.y, this.hookTargetY, p) - Math.sin(p * Math.PI) * 30,
      );
      if (p === 1) this.beginTiming(time);
    } else if (this.hookState === 'timing') {
      this.hook.y = this.hookTargetY + Math.sin(this.bobTime * 3) * 2;
      this.rod.setAngle(3 + Math.sin(this.bobTime * 3) * 1.5);
      if (this.automaticCast) {
        this.updateAutoProgress(time);
        if (time >= this.autoResolveAt) this.resolveAutoCatch();
      } else {
        const precisionBonus = 1 - this.progress.precision * .055;
        this.timingValue += this.timingDirection * dt * (1.12 + this.progress.rodLevel * .04) * precisionBonus;
        if (this.timingValue >= 1) { this.timingValue = 1; this.timingDirection = -1; }
        if (this.timingValue <= 0) { this.timingValue = 0; this.timingDirection = 1; }
        this.positionTimingPieces();
      }
    } else if (this.hookState === 'reeling') {
      this.reelElapsed += dt;
      const p = Math.min(1, this.reelElapsed / .9);
      this.rod.setAngle(-10 * Math.sin(p * Math.PI));
      const tip = this.rodTip();
      this.hook.setPosition(Phaser.Math.Linear(this.reelFrom.x, tip.x, p),
        Phaser.Math.Linear(this.reelFrom.y, tip.y, p) - Math.sin(p * Math.PI) * 12);
      this.landedFish.setPosition(this.hook.x, this.hook.y + 10).setAngle(Math.sin(p * 22) * 18);
      this.castButtonText.setText(`REEL ${Math.round(p * 100)}%`);
      if (p === 1) this.finishReel();
    }
  }

  private beginTiming(time: number): void {
    this.hookState = 'timing';
    this.timingValue = Math.random() * .35;
    this.timingDirection = 1;
    this.timingPanel.setVisible(true);
    if (this.automaticCast) {
      this.autoStartedAt = time;
      this.autoResolveAt = time + AUTO_FISHING_DURATION;
      this.timingMarker.setVisible(false);
      this.castButtonText.setText('AUTO  10.0s');
      this.updateAutoProgress(time);
    } else {
      this.zoneSize = Phaser.Math.Clamp(.17 + this.progress.focus * .035 + this.progress.rodLevel * .01, .17, .36);
      this.zoneStart = Phaser.Math.FloatBetween(.07, .93 - this.zoneSize);
      this.timingMarker.setVisible(true);
      this.timingLabel.setText('HIT SPACE IN THE GREEN ZONE');
      this.castButtonText.setText('REEL NOW');
      this.positionTimingPieces();
    }
  }

  private updateAutoProgress(time: number): void {
    const progress = Phaser.Math.Clamp((time - this.autoStartedAt) / AUTO_FISHING_DURATION, 0, 1);
    const panelWidth = Math.min(500, W - 28);
    const railWidth = panelWidth - 52;
    const left = W / 2 - railWidth / 2;
    const remaining = Math.max(0, (this.autoResolveAt - time) / 1000);
    this.timingZone.setPosition(left, this.timingZone.y).setFillStyle(0x60d394, .9);
    this.timingZone.width = railWidth * progress;
    this.timingLabel.setText(`AUTO FISHING  ${Math.round(progress * 100)}%`);
    this.castButtonText.setText(`AUTO  ${remaining.toFixed(1)}s`);
  }

  private positionTimingPieces(): void {
    const panelWidth = Math.min(500, W - 28);
    const railWidth = panelWidth - 52;
    const left = W / 2 - railWidth / 2;
    this.timingZone.setPosition(left + railWidth * this.zoneStart, this.timingZone.y);
    this.timingZone.width = railWidth * this.zoneSize;
    this.timingMarker.setX(left + railWidth * this.timingValue);
  }

  private resolveManualCatch(): void {
    const success = this.timingValue >= this.zoneStart && this.timingValue <= this.zoneStart + this.zoneSize;
    this.resolveCatch(success, false);
  }

  private resolveAutoCatch(): void {
    this.resolveCatch(true, true);
  }

  private resolveCatch(success: boolean, automatic: boolean): void {
    if (this.hookState !== 'timing') return;
    this.timingPanel.setVisible(false);
    this.hookState = 'reeling';
    this.reelElapsed = 0;
    this.reelFrom.set(this.hook.x, this.hook.y);
    this.castButtonText.setText('REELING…');
    if (success) {
      this.lastCatch = this.rollCatch(automatic);
      this.landedFish.setPosition(this.hook.x, this.hook.y + 10)
        .setTint(Phaser.Display.Color.HexStringToColor(this.lastCatch.color).color).setVisible(true);
      this.streak++;
      this.progress.bestStreak = Math.max(this.progress.bestStreak, this.streak);
      this.flashStatus(`${automatic ? 'AUTO • ' : ''}${this.lastCatch.name} ON THE LINE!`, this.lastCatch.color);
    } else {
      this.lastCatch = undefined;
      this.streak = 0;
      this.flashStatus(automatic ? 'AUTO CAST CAME UP EMPTY' : 'MISSED THE ZONE — TRY AGAIN', '#ff8c72');
    }
  }

  private finishReel(): void {
    this.hookState = 'idle';
    this.automaticCast = false;
    this.hook.setVisible(false);
    this.landedFish.setVisible(false);
    this.rod.setAngle(0);
    this.castButtonText.setText('CAST / REEL [SPACE]');
    if (this.lastCatch) {
      const result = this.lastCatch;
      this.progress.coins += result.value;
      this.progress.xp += result.xp;
      this.progress.catches++;
      this.progress.fishInventory[result.id] = (this.progress.fishInventory[result.id] ?? 0) + 1;
      this.applyLevelUps();
      this.flashStatus(`+${result.value} COINS • ${result.name}`, result.color);
      this.lastCatch = undefined;
      saveProgress(this.progress);
    }
    const boat = BOATS[Math.min(this.progress.hullLevel, BOATS.length) - 1];
    this.nextAutoCastAt = this.time.now + Math.max(1200, 3500 - this.progress.automation * 350 - (boat.autoDelay ?? 0));
    this.updateHud();
  }

  private rollCatch(automatic: boolean): CatchResult {
    const baitTier = this.progress.selectedBait + 1;
    const boat = BOATS[Math.min(this.progress.hullLevel, BOATS.length) - 1];
    const eligible = FISH.filter(fish => fish.minRod <= this.progress.rodLevel
      && fish.minBoat <= this.progress.hullLevel && fish.minBait <= baitTier);
    const weighted = eligible.map(fish => {
      const rarityIndex = FISH.indexOf(fish);
      const rareBoost = 1 + rarityIndex * (this.progress.luck * .022 + (boat.rareBonus ?? 0));
      return { fish, weight: fish.weight * rareBoost };
    });
    let roll = Math.random() * weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let caught = weighted[0].fish;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) { caught = entry.fish; break; }
    }
    const valueMultiplier = 1 + this.progress.treasure * .07 + (boat.valueBonus ?? 0);
    const autoMultiplier = automatic ? Math.min(1, .8 + this.progress.efficiency * .04) : 1;
    return {
      id: caught.id,
      name: caught.name.toUpperCase(),
      rarity: caught.rarity,
      value: Math.round(caught.value * valueMultiplier * autoMultiplier),
      xp: Math.round(caught.xp * (1 + this.progress.endurance * .08)),
      color: caught.color,
    };
  }

  private applyLevelUps(): void {
    let needed = this.progress.level * 100;
    while (this.progress.xp >= needed) {
      this.progress.xp -= needed;
      this.progress.level++;
      this.progress.skillPoints++;
      needed = this.progress.level * 100;
      this.flashStatus(`LEVEL ${this.progress.level}! +1 SKILL POINT`, '#ffd15c');
    }
  }

  private toggleAutoFishing(): void {
    this.autoFishing = !this.autoFishing;
    this.autoIndicator.setVisible(this.autoFishing);
    if (this.autoFishing) {
      this.nextAutoCastAt = this.time.now + 350;
      this.flashStatus('AUTO FISHING ENABLED', '#60d394');
    } else {
      this.flashStatus('MANUAL FISHING READY', '#fff1be');
    }
  }

  private rodTip(): Phaser.Math.Vector2 {
    // Transform the actual visible tip, including grip rotation and boat scaling.
    const point = new Phaser.Math.Vector2();
    this.rod.getWorldTransformMatrix().transformPoint(
      (.95 - .27) * this.rod.width, (.02 - .83) * this.rod.height, point,
    );
    return point;
  }

  private updateLine(): void {
    this.line.clear();
    if (this.hookState !== 'idle') {
      const tip = this.rodTip();
      this.line.lineStyle(1.4, 0xeef1cc, .9).lineBetween(tip.x, tip.y, this.hook.x, this.hook.y);
      if (this.hookState === 'timing') {
        const pulse = (this.bobTime * .8) % 1;
        this.line.lineStyle(1.5, 0xc1eee4, 1 - pulse)
          .strokeEllipse(this.hook.x, WATER_Y + 5, 12 + pulse * 30, 3 + pulse * 8);
      }
    }
  }

  private updateFish(dt: number): void {
    this.fish.children.each(object => {
      const fish = object as Phaser.GameObjects.Sprite;
      const data = fish.getData('data') as AmbientFishData;

      if (this.bobTime >= data.nextTurnAt) {
        data.targetY = Phaser.Math.Between(data.depthMin, data.depthMax);
        data.speed = Phaser.Math.Between(18, 52);
        data.nextTurnAt = this.bobTime + Phaser.Math.FloatBetween(3.5, 8.5);
        if (data.worldX > 80 && data.worldX < OCEAN_CONTENT_WIDTH - 80 && Math.random() < .28) {
          data.direction = data.direction === 1 ? -1 : 1;
          fish.setFlipX(data.direction === -1);
        }
      }

      data.worldX += data.speed * data.direction * dt;
      fish.x = data.worldX - this.oceanXOffset;
      data.baseY = Phaser.Math.Linear(data.baseY, data.targetY, 1 - Math.exp(-dt * .72));
      const swimPhase = this.bobTime * (1.45 + data.speed / 90) + data.waveOffset;
      fish.y = data.baseY - this.oceanDepthOffset + Math.sin(swimPhase) * 2.4
        + Math.sin(fish.x * .018 + data.waveOffset) * .8;
      fish.setAngle(Math.sin(swimPhase + .7) * 2.2 * data.direction);
      if (data.direction === 1 && data.worldX > OCEAN_CONTENT_WIDTH + 50) {
        data.worldX = OCEAN_CONTENT_WIDTH + 50;
        data.direction = -1;
        fish.setFlipX(true);
      } else if (data.direction === -1 && data.worldX < -50) {
        data.worldX = -50;
        data.direction = 1;
        fish.setFlipX(false);
      }
      return true;
    });
  }

  private spawnSchool(): void {
    const distribution: Array<[FishDepthZone, number]> = [
      ['top', 3], ['middle', 4], ['bottom', 5],
    ];
    distribution.forEach(([zone, count]) => {
      for (let i = 0; i < count; i++) this.spawnFish(true, zone);
    });
  }

  private fishDepthBounds(zone: FishDepthZone): { min: number; max: number } {
    const top = WATER_Y + 42;
    const usableDepth = OCEAN_CONTENT_HEIGHT - 70;
    if (zone === 'top') return { min: top, max: top + usableDepth * .28 };
    if (zone === 'middle') return { min: top + usableDepth * .25, max: top + usableDepth * .62 };
    return { min: top + usableDepth * .58, max: top + usableDepth * .96 };
  }

  private spawnFish(initial = false, requestedZone?: FishDepthZone): void {
    const roll = Math.random();
    const zone = requestedZone ?? (roll < .2 ? 'top' : roll < .52 ? 'middle' : 'bottom');
    const bounds = this.fishDepthBounds(zone);
    const direction: 1 | -1 = Math.random() > .5 ? 1 : -1;
    const y = Phaser.Math.Between(bounds.min, bounds.max);
    const worldX = initial
      ? Phaser.Math.Between(20, OCEAN_CONTENT_WIDTH - 20)
      : (direction === 1 ? -50 : OCEAN_CONTENT_WIDTH + 50);
    const frame = Phaser.Math.Between(0, 2);
    const frameNames = ['round', 'classic', 'long'] as const;
    const fish = this.add.sprite(
      worldX - this.oceanXOffset,
      y,
      'ambient-fish-sprites',
      frameNames[frame],
    );
    const data: AmbientFishData = {
      speed: Phaser.Math.Between(20, 48), direction, waveOffset: Math.random() * Math.PI * 2,
      worldX,
      baseY: y,
      targetY: Phaser.Math.Between(bounds.min, bounds.max),
      depthMin: bounds.min,
      depthMax: bounds.max,
      nextTurnAt: this.bobTime + Phaser.Math.FloatBetween(2.5, 7),
    };
    const spriteWidth = [27, 36, 44][frame];
    const spriteHeight = [22, 21, 16][frame];
    const spriteScale = Phaser.Math.FloatBetween(.88, 1.05);
    fish.setData('data', data).setFlipX(direction === -1)
      .setDisplaySize(spriteWidth * spriteScale, spriteHeight * spriteScale)
      .setDepth(Phaser.Math.Between(2, 3)).setAlpha(Phaser.Math.FloatBetween(.48, .68))
      .setMask(this.oceanMask);
    // A compact blue blur pushes ambient sprites into the scenery without
    // affecting the caught fish, HUD, or foreground artwork.
    fish.postFX.addBlur(0, .5, .5, Phaser.Math.FloatBetween(.38, .52), 0xd5efff, 2);
    this.fish.add(fish);
  }

  private openPanel(name: PanelName): void {
    this.closePanel();
    if (this.panelUI) {
      // Keep a lightweight Phaser marker so fishing and sailing pause while
      // the accessible HTML dialog is open.
      this.activePanel = this.add.container(0, 0).setVisible(false);
      this.panelUI.show(name, {
        progress: this.progress,
        fish: FISH,
        rods: RODS,
        baits: BAITS,
        boats: BOATS,
        autoFishing: this.autoFishing,
        streak: this.streak,
      }, this.shopCategory);
      return;
    }

    // Canvas fallback for hosts where the HTML panel cannot be initialized.
    const largePanel = name === 'character' || name === 'skills' || name === 'shop' || name === 'inventory' || name === 'codex';
    const panelWidth = Math.min(largePanel ? 760 : 620, W - 24);
    const panelHeight = Math.min(largePanel ? 410 : 330, HUD_Y - 16);
    const cx = W / 2;
    const cy = (HUD_Y + 8) / 2;
    const shade = this.add.rectangle(W / 2, HUD_Y / 2, W, HUD_Y, 0x021019, .72).setInteractive();
    const card = this.add.rectangle(cx, cy, panelWidth, panelHeight, 0x082b3b, .98).setStrokeStyle(3, 0xffdf9d);
    const title = this.add.text(cx - panelWidth / 2 + 22, cy - panelHeight / 2 + 18, name === 'character' ? 'PROFILE' : name.toUpperCase(), {
      fontFamily: 'Rubik Mono One', fontSize: SIDEBAR_MODE ? '15px' : '22px', color: '#ffdf9d',
    });
    const close = this.makeButton(cx + panelWidth / 2 - 34, cy - panelHeight / 2 + 28, 42, 30, 'X', () => this.closePanel());
    this.activePanel = this.add.container(0, 0, [shade, card, title, ...close]).setDepth(60);
    if (name === 'skills') this.populateSkillsPanel(cx, cy, panelWidth, panelHeight);
    if (name === 'shop') this.populateShopPanel(cx, cy, panelWidth, panelHeight);
    if (name === 'inventory') this.populateInventoryPanel(cx, cy, panelWidth, panelHeight);
    if (name === 'character') this.populateCharacterPanel(cx, cy, panelWidth, panelHeight);
    if (name === 'boat') this.populateBoatPanel(cx, cy, panelWidth, panelHeight);
    if (name === 'codex') this.populateCodexPanel(cx, cy, panelWidth, panelHeight);
  }

  private populateSkillsPanel(cx: number, cy: number, width: number, height: number): void {
    const compact = SIDEBAR_MODE || width < 500;
    const innerX = compact ? width * .23 : 125;
    const outerX = compact ? width * .42 : 255;
    const innerY = compact ? height * .17 : 64;
    const outerY = compact ? Math.min(height * .34, height / 2 - 62) : 125;
    const nodeWidth = compact ? Math.max(46, width * .2) : 104;
    const nodeHeight = compact ? 42 : 58;

    interface SkillNode {
      key: SkillKey;
      label: string;
      detail: string;
      x: number;
      y: number;
      parent?: SkillKey;
    }

    const skills: SkillNode[] = [
      { key: 'luck', label: 'SEA SENSE', detail: 'Rarer catches', x: cx, y: cy - innerY },
      { key: 'treasure', label: 'TREASURE', detail: 'More coins', x: cx, y: cy - outerY, parent: 'luck' },
      { key: 'automation', label: 'DECKHAND', detail: 'Faster auto', x: cx + innerX, y: cy },
      { key: 'efficiency', label: 'MACHINE', detail: 'Higher auto value', x: cx + outerX, y: cy, parent: 'automation' },
      { key: 'endurance', label: 'ENDURANCE', detail: 'More XP', x: cx, y: cy + innerY },
      { key: 'frugality', label: 'PACKING', detail: 'Extra shop bait', x: cx, y: cy + outerY, parent: 'endurance' },
      { key: 'focus', label: 'STEADY HAND', detail: 'Wider catch zone', x: cx - innerX, y: cy },
      { key: 'precision', label: 'PRECISION', detail: 'Slower marker', x: cx - outerX, y: cy, parent: 'focus' },
    ];

    const nodeByKey = new Map(skills.map(skill => [skill.key, skill]));
    const connectors = this.add.graphics();
    skills.forEach(skill => {
      const parent = skill.parent ? nodeByKey.get(skill.parent) : undefined;
      const fromX = parent?.x ?? cx;
      const fromY = parent?.y ?? cy;
      const active = this.progress[skill.key] > 0 || (skill.parent ? this.progress[skill.parent] > 0 : true);
      connectors.lineStyle(skill.parent ? 3 : 4, active ? 0x60a98d : 0x315b63, active ? .95 : .65);
      connectors.lineBetween(fromX, fromY, skill.x, skill.y);
    });
    this.activePanel!.add(connectors);

    const root = this.add.rectangle(cx, cy, compact ? 72 : 118, compact ? 48 : 64, 0x123f4c)
      .setStrokeStyle(3, 0xffdf9d);
    const rootTitle = this.add.text(cx, cy - (compact ? 8 : 11), 'CAPTAIN', {
      fontFamily: 'Rubik Mono One', fontSize: compact ? '7px' : '11px', color: '#fff1be',
    }).setOrigin(.5);
    const points = this.add.text(cx, cy + (compact ? 9 : 14), `${this.progress.skillPoints} PT${this.progress.skillPoints === 1 ? '' : 'S'}`, {
      fontFamily: 'DM Mono', fontSize: compact ? '7px' : '10px', color: '#87cbd0',
    }).setOrigin(.5);
    this.activePanel!.add([root, rootTitle, points]);

    skills.forEach(skill => {
      const value = this.progress[skill.key];
      const maxed = value >= 5;
      const unlocked = !skill.parent || this.progress[skill.parent] > 0;
      const canUpgrade = unlocked && this.progress.skillPoints > 0 && !maxed;
      const node = this.add.rectangle(skill.x, skill.y, nodeWidth, nodeHeight, canUpgrade ? 0x124755 : 0x0c303d)
        .setStrokeStyle(3, maxed ? 0x60d394 : canUpgrade ? 0xffdf9d : 0x4d7a83)
        .setInteractive({ useHandCursor: true });
      const name = this.add.text(skill.x, skill.y - (compact ? 7 : 12), skill.label, {
        fontFamily: 'Rubik Mono One', fontSize: compact ? '5px' : '8px',
        color: unlocked ? '#fff1be' : '#607d82', align: 'center',
        wordWrap: { width: nodeWidth - 6 },
      }).setOrigin(.5);
      const level = this.add.text(skill.x, skill.y + (compact ? 8 : 5), unlocked ? `LV.${value}/5` : 'LOCKED', {
        fontFamily: 'DM Mono', fontSize: compact ? '6px' : '8px', color: maxed ? '#79dfa4' : '#87cbd0',
      }).setOrigin(.5);
      const detail = this.add.text(skill.x, skill.y + 20, maxed ? 'MAXED' : skill.detail, {
        fontFamily: 'DM Mono', fontSize: '6px', color: maxed ? '#79dfa4' : '#a8c8c9',
      }).setOrigin(.5).setVisible(!compact);
      node.on('pointerdown', () => {
        if (!unlocked) {
          this.flashStatus(`UNLOCK ${skill.parent!.toUpperCase()} FIRST`, '#ff8c72');
          return;
        }
        if (this.progress.skillPoints <= 0 || value >= 5) {
          this.flashStatus(value >= 5 ? 'SKILL MAXED' : 'NO SKILL POINTS', '#ff8c72');
          return;
        }
        this.progress.skillPoints--;
        this.progress[skill.key]++;
        saveProgress(this.progress);
        this.updateHud();
        this.openPanel('skills');
      });
      node.on('pointerover', () => {
        node.setFillStyle(canUpgrade ? 0x1a5c68 : 0x123846);
        this.flashStatus(skill.detail.toUpperCase(), unlocked ? '#87cbd0' : '#ff8c72');
      });
      node.on('pointerout', () => node.setFillStyle(canUpgrade ? 0x124755 : 0x0c303d));
      this.activePanel!.add([node, name, level, detail]);
    });
  }

  private populateShopPanel(cx: number, cy: number, width: number, height: number): void {
    const compact = SIDEBAR_MODE || width < 500;
    const left = cx - width / 2;
    const top = cy - height / 2;
    this.addPanelText(cx + width / 2 - (compact ? 118 : 180), top + 24, `WALLET  ${this.progress.coins}`, '#87cbd0', compact ? 9 : 11);
    this.activePanel!.add(this.makeButton(cx - 66, top + 70, 116, 32, 'RODS', () => {
      this.shopCategory = 'rods'; this.shopPage = 0; this.openPanel('shop');
    }));
    this.activePanel!.add(this.makeButton(cx + 66, top + 70, 116, 32, 'BAIT', () => {
      this.shopCategory = 'bait'; this.shopPage = 0; this.openPanel('shop');
    }));

    const source = this.shopCategory === 'rods' ? RODS : BAITS;
    const pageSize = compact ? 3 : 4;
    const maxPage = Math.max(0, Math.ceil(source.length / pageSize) - 1);
    this.shopPage = Phaser.Math.Clamp(this.shopPage, 0, maxPage);
    const rows = source.slice(this.shopPage * pageSize, this.shopPage * pageSize + pageSize);
    const rowHeight = compact ? 72 : 64;
    const startY = top + 118;

    rows.forEach((item, index) => {
      const y = startY + index * rowHeight;
      const selected = this.shopCategory === 'bait' && this.progress.selectedBait === item.tier - 1;
      const row = this.add.rectangle(cx, y + rowHeight / 2 - 4, width - 30, rowHeight - 7, selected ? 0x174b50 : 0x0b3444, .95)
        .setStrokeStyle(2, selected ? 0x60d394 : 0x315b63);
      this.activePanel!.add(row);
      this.addPanelText(left + 24, y + 8, `${item.tier}. ${item.name.toUpperCase()}`, item.color, compact ? 8 : 11);
      if (this.shopCategory === 'rods') {
        const rod = item as RodDefinition;
        const owned = rod.tier <= this.progress.rodLevel;
        const next = rod.tier === this.progress.rodLevel + 1;
        this.addPanelText(left + 24, y + 29, `${rod.rarity}  •  UNLOCKS FISH TIER ${rod.tier}`, '#82afb2', compact ? 7 : 9);
        const label = owned ? 'OWNED' : next ? `BUY ${rod.cost}` : 'LOCKED';
        this.activePanel!.add(this.makeButton(cx + width / 2 - 72, y + rowHeight / 2 - 4, compact ? 82 : 108, 32, label, () => {
          if (owned) return;
          if (!next) { this.flashStatus('BUY THE PREVIOUS ROD FIRST', '#ff8c72'); return; }
          if (!this.spendCoins(rod.cost)) return;
          this.progress.rodLevel = rod.tier;
          saveProgress(this.progress); this.updateHud(); this.openPanel('shop');
        }));
      } else {
        const bait = item as BaitDefinition;
        const stock = this.progress.baitStock[bait.tier - 1] ?? 0;
        const bundle = 3 + this.progress.frugality;
        this.addPanelText(left + 24, y + 29, `${bait.rarity}  •  STOCK ${stock}  •  +${bundle} PER TIN`, '#82afb2', compact ? 7 : 9);
        row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          if (stock <= 0) { this.flashStatus('BUY THIS BAIT BEFORE EQUIPPING IT', '#ff8c72'); return; }
          this.progress.selectedBait = bait.tier - 1;
          this.progress.bait = stock;
          saveProgress(this.progress); this.updateHud(); this.openPanel('shop');
        });
        this.activePanel!.add(this.makeButton(cx + width / 2 - 72, y + rowHeight / 2 - 4, compact ? 82 : 108, 32, `BUY ${bait.cost}`, () => {
          if (!this.spendCoins(bait.cost)) return;
          this.progress.baitStock[bait.tier - 1] = stock + bundle;
          if (stock === 0) this.progress.selectedBait = bait.tier - 1;
          this.progress.bait = this.progress.baitStock[this.progress.selectedBait];
          saveProgress(this.progress); this.updateHud(); this.openPanel('shop');
        }));
      }
    });
    this.addPager(cx, cy + height / 2 - 24, this.shopPage, maxPage, page => {
      this.shopPage = page; this.openPanel('shop');
    });
  }

  private populateInventoryPanel(cx: number, cy: number, width: number, height: number): void {
    const caught = FISH.filter(fish => (this.progress.fishInventory[fish.id] ?? 0) > 0);
    const totalFish = Object.values(this.progress.fishInventory).reduce((sum, count) => sum + count, 0);
    const top = cy - height / 2;
    this.addPanelText(cx - width / 2 + 22, top + 58, `${caught.length}/20 SPECIES  •  ${totalFish} FISH STORED`, '#87cbd0', SIDEBAR_MODE ? 8 : 11);
    const pageSize = SIDEBAR_MODE ? 4 : 5;
    const maxPage = Math.max(0, Math.ceil(Math.max(1, caught.length) / pageSize) - 1);
    this.inventoryPage = Phaser.Math.Clamp(this.inventoryPage, 0, maxPage);
    if (!caught.length) {
      this.addPanelText(cx - 112, cy, 'NO FISH YET — CAST A LINE!', '#a8c8c9', 11);
    }
    caught.slice(this.inventoryPage * pageSize, this.inventoryPage * pageSize + pageSize).forEach((fish, index) => {
      const y = top + 96 + index * (SIDEBAR_MODE ? 58 : 54);
      const icon = this.add.sprite(cx - width / 2 + 45, y + 18, 'fish').setTint(fish.tint).setScale(.8);
      this.activePanel!.add(icon);
      this.addPanelText(cx - width / 2 + 74, y + 4, fish.name.toUpperCase(), fish.color, SIDEBAR_MODE ? 8 : 11);
      this.addPanelText(cx - width / 2 + 74, y + 24, `${fish.rarity}  •  OWNED ${this.progress.fishInventory[fish.id]}  •  BASE ${fish.value}c`, '#82afb2', SIDEBAR_MODE ? 7 : 9);
    });
    this.addPager(cx, cy + height / 2 - 24, this.inventoryPage, maxPage, page => {
      this.inventoryPage = page; this.openPanel('inventory');
    });
  }

  private populateCodexPanel(cx: number, cy: number, width: number, height: number): void {
    const top = cy - height / 2;
    const pageSize = SIDEBAR_MODE ? 4 : 5;
    const maxPage = Math.ceil(FISH.length / pageSize) - 1;
    this.codexPage = Phaser.Math.Clamp(this.codexPage, 0, maxPage);
    this.addPanelText(cx - width / 2 + 22, top + 58, 'DARK SILHOUETTES ARE STILL UNDISCOVERED', '#87cbd0', SIDEBAR_MODE ? 7 : 10);
    FISH.slice(this.codexPage * pageSize, this.codexPage * pageSize + pageSize).forEach((fish, index) => {
      const discovered = (this.progress.fishInventory[fish.id] ?? 0) > 0;
      const y = top + 92 + index * (SIDEBAR_MODE ? 62 : 56);
      const icon = this.add.sprite(cx - width / 2 + 45, y + 19, 'fish')
        .setTint(discovered ? fish.tint : 0x02080b).setScale(.85);
      this.activePanel!.add(icon);
      this.addPanelText(cx - width / 2 + 76, y + 2, discovered ? fish.name.toUpperCase() : '???', discovered ? fish.color : '#4e6669', SIDEBAR_MODE ? 8 : 11);
      const requirements = `ROD ${fish.minRod}  •  BOAT ${fish.minBoat}  •  BAIT ${fish.minBait}${fish.requirement ? `  •  ${fish.requirement.toUpperCase()}` : ''}`;
      this.addPanelText(cx - width / 2 + 76, y + 23, discovered ? `${fish.rarity}  •  ${requirements}` : `UNKNOWN  •  ${requirements}`, '#82afb2', SIDEBAR_MODE ? 6 : 8);
    });
    this.addPager(cx, cy + height / 2 - 24, this.codexPage, maxPage, page => {
      this.codexPage = page; this.openPanel('codex');
    });
  }

  private populateCharacterPanel(cx: number, cy: number, width: number, height: number): void {
    const left = cx - width / 2 + 22;
    const top = cy - height / 2;
    this.profileStats = this.add.text(left, top + 60, '', {
      fontFamily: 'DM Mono', fontSize: SIDEBAR_MODE ? '10px' : '12px', color: '#dce2dd',
      lineSpacing: SIDEBAR_MODE ? 7 : 9, wordWrap: { width: width - 44 },
    });
    this.activePanel!.add(this.profileStats);
    this.activePanel!.add(this.makeButton(cx, top + height - 30, Math.min(220, width - 44), 34,
      this.autoFishing ? 'AUTO FISHING: ON' : 'AUTO FISHING: OFF', () => {
        this.toggleAutoFishing();
        this.openPanel('character');
      }));
    this.updateHud();
  }

  private populateBoatPanel(cx: number, cy: number, width: number, height: number): void {
    const left = cx - width / 2 + 25;
    const current = BOATS[Math.min(this.progress.hullLevel, BOATS.length) - 1];
    const next = BOATS[this.progress.hullLevel];
    this.addPanelText(left, cy - height / 2 + 68, `CURRENT  ${current.name.toUpperCase()}`, '#fff1be', 14);
    this.addPanelText(left, cy - height / 2 + 96, `TIER ${current.tier}/7  •  ${current.bonus}`, '#82afb2', SIDEBAR_MODE ? 8 : 10);
    const hullSwatch = this.add.rectangle(left + 40, cy - 18, 80, 38, current.hull).setStrokeStyle(4, current.trim);
    this.activePanel!.add(hullSwatch);
    this.addPanelText(left + 96, cy - 29, 'Each upgrade changes the hull style', '#a8c8c9', SIDEBAR_MODE ? 7 : 9);
    this.addPanelText(left + 96, cy - 9, 'and adds a unique permanent bonus.', '#a8c8c9', SIDEBAR_MODE ? 7 : 9);
    if (next) {
      this.addPanelText(left, cy + 43, `NEXT  ${next.name.toUpperCase()}`, next.tier >= 5 ? '#ffd86a' : '#fff1be', 13);
      this.addPanelText(left, cy + 69, next.bonus, '#82afb2', SIDEBAR_MODE ? 8 : 10);
      this.activePanel!.add(this.makeButton(cx + width / 2 - 88, cy + 58, 128, 40, `UPGRADE ${next.cost}`, () => {
        if (!this.spendCoins(next.cost)) return;
        this.progress.hullLevel = next.tier;
        saveProgress(this.progress); this.paintBoat(); this.updateHud(); this.openPanel('boat');
      }));
    } else {
      this.addPanelText(left, cy + 56, 'MAXIMUM BOAT TIER — CELESTIAL NET ACTIVE', '#79dfa4', 11);
    }
    this.addPanelText(left, cy + height / 2 - 48, 'TIER 5: REEF FISH  •  TIER 6: ABYSS FISH  •  TIER 7: DIVINE FISH', '#d5b67b', SIDEBAR_MODE ? 6 : 9);
  }

  private addPanelText(x: number, y: number, text: string, color: string, size: number): void {
    const label = this.add.text(x, y, text, { fontFamily: 'DM Mono', fontSize: `${size}px`, color });
    this.activePanel!.add(label);
  }

  private addPager(x: number, y: number, page: number, maxPage: number, onPage: (page: number) => void): void {
    if (maxPage <= 0) return;
    this.activePanel!.add(this.makeButton(x - 70, y, 54, 28, '<', () => onPage(Math.max(0, page - 1))));
    this.addPanelText(x - 22, y - 7, `${page + 1} / ${maxPage + 1}`, '#87cbd0', 9);
    this.activePanel!.add(this.makeButton(x + 70, y, 54, 28, '>', () => onPage(Math.min(maxPage, page + 1))));
  }

  private makeButton(
    x: number, y: number, width: number, height: number, label: string, onClick: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const bg = this.add.rectangle(x, y, width, height, 0xd4513f)
      .setStrokeStyle(2, 0xffdf9d).setInteractive({ useHandCursor: true });
    const text = this.add.text(x, y, label, {
      fontFamily: 'DM Mono', fontStyle: 'bold', fontSize: SIDEBAR_MODE ? '9px' : '11px', color: '#fff1be',
    }).setOrigin(.5);
    bg.on('pointerdown', onClick);
    bg.on('pointerover', () => bg.setFillStyle(0xe7674f));
    bg.on('pointerout', () => bg.setFillStyle(0xd4513f));
    return [bg, text];
  }

  private closePanel(): void {
    this.panelUI?.hide();
    this.activePanel?.destroy(true);
    this.activePanel = undefined;
    this.profileStats = undefined;
  }

  private handlePanelAction(action: PanelAction): string | void {
    if (action.type === 'skill') {
      const skill = SKILLS.find(item => item.key === action.key);
      if (!skill) return;
      if (skill.parent && this.progress[skill.parent] <= 0) return 'Learn the previous talent first.';
      if (this.progress[action.key] >= 5) return 'That talent is already mastered.';
      if (this.progress.skillPoints <= 0) return 'No talent points available.';
      this.progress[action.key]++;
      this.progress.skillPoints--;
    }

    if (action.type === 'rod') {
      const rod = RODS[action.tier - 1];
      if (!rod || action.tier !== this.progress.rodLevel + 1) return 'Upgrade rods in order.';
      if (!this.spendCoins(rod.cost)) return 'Not enough coins for that rod.';
      this.progress.rodLevel = action.tier;
    }

    if (action.type === 'bait') {
      const bait = BAITS[action.tier - 1];
      if (!bait) return;
      if (!this.spendCoins(bait.cost)) return 'Not enough coins for that bait tin.';
      const index = action.tier - 1;
      this.progress.baitStock[index] = (this.progress.baitStock[index] ?? 0) + 3 + this.progress.frugality;
      if ((this.progress.baitStock[this.progress.selectedBait] ?? 0) === 0) this.progress.selectedBait = index;
    }

    if (action.type === 'equip') {
      const index = action.tier - 1;
      if ((this.progress.baitStock[index] ?? 0) <= 0) return 'That bait is out of stock.';
      this.progress.selectedBait = index;
    }

    if (action.type === 'boat') {
      const tier = this.progress.hullLevel + 1;
      const boat = BOATS[tier - 1];
      if (!boat) return 'Your fleet is already complete.';
      if (!this.spendCoins(boat.cost)) return 'Not enough coins for that vessel.';
      this.progress.hullLevel = tier;
      this.paintBoat();
    }

    if (action.type === 'auto') this.toggleAutoFishing();

    this.progress.bait = this.progress.baitStock[this.progress.selectedBait] ?? 0;
    saveProgress(this.progress);
    this.updateHud();
  }

  private spendCoins(amount: number): boolean {
    if (this.progress.coins < amount) {
      this.flashStatus('NOT ENOUGH COINS', '#ff8c72');
      return false;
    }
    this.progress.coins -= amount;
    return true;
  }

  private updateHud(): void {
    const bait = BAITS[this.progress.selectedBait];
    const stock = this.progress.baitStock[this.progress.selectedBait] ?? 0;
    this.progress.bait = stock;
    const discovered = FISH.filter(fish => (this.progress.fishInventory[fish.id] ?? 0) > 0).length;
    this.profileStats?.setText([
      `${(this.progress.captainName || 'CAPTAIN').toUpperCase()}  /  LV.${this.progress.level}`,
      `XP ${this.progress.xp}/${this.progress.level * 100}   COINS ${this.progress.coins}`,
      `CATCHES ${this.progress.catches}   FISH ${discovered}/${FISH.length}`,
      `STREAK ${this.streak}   BEST ${this.progress.bestStreak}`,
      `SKILL POINTS ${this.progress.skillPoints}`,
      `ROD  ${RODS[this.progress.rodLevel - 1].name}`,
      `BAIT ${bait.name} (${stock})`,
      `BOAT ${BOATS[this.progress.hullLevel - 1].name}`,
    ].join('\n'));

  }

  private flashStatus(message: string, color: string): void {
    this.statusText.setText(message).setColor(color).setAlpha(1).setY(HUD_Y - 22);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({ targets: this.statusText, alpha: 0, y: HUD_Y - 34, delay: 1500, duration: 500 });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#498df6',
  pixelArt: true,
  antialias: false,
  // Preserve nearest-neighbor artwork while allowing the boat's fractional
  // bob/rock positions to render smoothly instead of snapping each frame.
  render: { roundPixels: false },
  // Direct image loads respect the webview's existing img-src policy.
  loader: { imageLoadType: 'HTMLImageElement' },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: ReelScene,
});

let resizeTimer: number | undefined;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const nextWidth = Math.max(SIDEBAR_MODE ? 280 : 320, Math.round(window.innerWidth));
    const nextHeight = Math.max(SIDEBAR_MODE ? 440 : 360, Math.round(window.innerHeight));
    if (nextWidth === W && nextHeight === H) return;

    updateViewportMetrics();
    game.scale.resize(W, H);
    const reel = game.scene.getScene('reel');
    if (reel?.scene.isActive()) reel.scene.restart();
  }, 140);
});

// Keep movement hotkeys from consuming letters while the captain is being named.
if (game.input.keyboard) game.input.keyboard.enabled = false;

const setup = document.querySelector<HTMLElement>('#captain-setup');
const form = document.querySelector<HTMLFormElement>('#captain-form');
const input = document.querySelector<HTMLInputElement>('#captain-name');
const error = document.querySelector<HTMLElement>('#setup-error');
const setupTitle = document.querySelector<HTMLElement>('#setup-title');
const submit = document.querySelector<HTMLButtonElement>('#captain-submit');
const storedProfile = readProgress();

if (storedProfile.captainName && input && setupTitle && submit) {
  input.value = storedProfile.captainName;
  setupTitle.textContent = 'WELCOME BACK';
  submit.textContent = 'BOARD THE BOAT';
}

(['keydown', 'keyup', 'keypress'] as const).forEach(type => {
  input?.addEventListener(type, event => event.stopPropagation());
});

form?.addEventListener('submit', event => {
  event.preventDefault();
  const name = input?.value.trim().replace(/\s+/g, ' ') ?? '';
  if (name.length < 2) {
    if (error) error.textContent = 'Use at least 2 characters.';
    input?.focus();
    return;
  }
  const progress = readProgress();
  const firstCaptain = !progress.captainName;
  progress.captainName = name.slice(0, 16);
  if (firstCaptain && progress.catches === 0 && progress.coins === 0) progress.coins = 50;
  saveProgress(progress);
  if (game.input.keyboard) game.input.keyboard.enabled = true;
  game.events.emit('captain-ready', progress.captainName);
  if (setup) setup.hidden = true;
  game.canvas.focus();
});

queueMicrotask(() => input?.focus());
