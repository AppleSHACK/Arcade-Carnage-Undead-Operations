import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';

import { PlayerState, InputMap, Vector2D, OrbState, GunState, Projectile, Wall, Zombie } from '../types';
import { 
  WORLD_SIZE, 
  PLAYER_SPEED, 
  SPRINT_SPEED, 
  STAMINA_MAX, 
  STAMINA_DEPLETION_RATE,
  STAMINA_RECOVERY_RATE,
  PLAYER_RADIUS, 
  INITIAL_WALLS, 
  PLAYER_HEALTH_MAX,
  ORB_RADIUS,
  PLAYER_SHIELD_MAX,
  SHIELD_DECAY_INTERVAL,
  SHIELD_DECAY_AMOUNT,
  GUN_NAME,
  MAG_SIZE,
  INITIAL_RESERVE,
  FIRE_RATE,
  RELOAD_TIME,
  PROJECTILE_SPEED,
  PROJECTILE_MAX_RANGE,
  PROJECTILE_RADIUS,
  ZOMBIE_SPEED,
  ZOMBIE_RADIUS,
  ZOMBIE_HEALTH_MAX,
  ZOMBIE_SPAWN_INTERVAL,
  MAX_ZOMBIES,
  INITIAL_CREDITS,
  POINTS_PER_HIT,
  ZOMBIES_PER_ROUND_MULTIPLIER,
  ROUND_INTERMISSION_TIME,
  THICK,
  MAX_AMMO_DROP_CHANCE
} from '../constants';
import { isCollidingWithAnyWall, checkCircleRectCollision } from '../utils/collision';

// --- Shotgun Constants ---
const SHOTGUN_NAME = "FLARE BREAKER";
const SHOTGUN_COST = 700;
const SHOTGUN_FIRE_RATE = 1.1; // Very slow
const SHOTGUN_RELOAD_TIME = 2.8; // Very slow
const SHOTGUN_MAG_SIZE = 4;
const SHOTGUN_RESERVE = 32;
const SHOTGUN_DAMAGE = 220; // One-shots through round 5 (210 HP)
const SHOTGUN_MUZZLE_OFFSET = 38;

// --- SMG Constants ---
const SMG_NAME = "VOLT RIPPER";
const SMG_COST = 1200;
const SMG_FIRE_RATE = 0.07; // Rapid fire
const SMG_RELOAD_TIME = 1.8;
const SMG_MAG_SIZE = 45;
const SMG_RESERVE = 180;
const SMG_DAMAGE = 10; // Weaker per bullet
const SMG_MUZZLE_OFFSET = 16;

// --- Upgrade System Constants ---
const UPGRADE_COST = 5000;
const UPGRADE_MACHINE_POS = { x: WORLD_SIZE / 2 + 100, y: WORLD_SIZE / 2 - 100 };

// --- Default Vanguard Constants ---
const NV_MUZZLE_OFFSET = 23;

// --- Pathfinding Utilities ---
const GRID_CELL_SIZE = 40;
const GRID_DIM = WORLD_SIZE / GRID_CELL_SIZE;

interface NavNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: NavNode | null;
}

interface ImpactParticle {
  id: string;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface GameCanvasProps {
  isPaused?: boolean;
}

interface PowerUpDrop {
  id: string;
  pos: Vector2D;
  type: 'MAX_AMMO';
  spawnTime: number;
}

const ROOM_COLORS: Record<string, number> = {
  HUB: 0x22d3ee,
  ENGINEERING: 0xf59e0b,
  HANGAR: 0xea580c,
  CARGO: 0x10b981,
  MEDBAY: 0x0ea5e9,
  HYDRO: 0x84cc16,
  SECURITY: 0xef4444,
  LIFE: 0x06b6d4,
  CRYO: 0x8b5cf6
};

const GameCanvas: React.FC<GameCanvasProps> = ({ isPaused = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(performance.now());
  const lastFootstepTimeRef = useRef<number>(0);
  const lastMeleeTimeRef = useRef<number>(0);
  const lastDamageTimeRef = useRef<number>(0);
  
  const gameTimeRef = useRef<number>(0);
  const lastShieldDecayTimeRef = useRef<number>(0);
  const shieldPickupTimeRef = useRef<number>(0);
  const orbRespawnTimerRef = useRef<number>(0);
  const zombieSpawnTimerRef = useRef<number>(0);
  const cameraShakeRef = useRef<number>(0);
  const damageFlashRef = useRef<number>(0);
  const criticalPulseIntensityRef = useRef<number>(0);
  const isCriticalRef = useRef<boolean>(false);

  // Pause Ref for Three.js stability
  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Horde System Refs
  const roundNumberRef = useRef<number>(1);
  const zombiesSpawnedInRoundRef = useRef<number>(0);
  const zombiesRemainingInRoundRef = useRef<number>(ZOMBIES_PER_ROUND_MULTIPLIER);
  const intermissionTimerRef = useRef<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  const playerMeshRef = useRef<THREE.Group>(null);
  const shieldGlowRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const muzzleFlashMeshRef = useRef<THREE.Mesh>(null);
  const muzzleFlashLightRef = useRef<THREE.PointLight>(null);
  const muzzleFlashTimerRef = useRef<number>(0);

  // Weapon Refs
  const neutronVanguardModelRef = useRef<THREE.Group>(null);
  const flareBreakerModelRef = useRef<THREE.Group>(null);
  const voltRipperModelRef = useRef<THREE.Group>(null);
  const wallBuyFlareBreakerRef = useRef<THREE.Group>(null);
  const wallBuyVoltRipperRef = useRef<THREE.Group>(null);
  const upgradeMachineModelRef = useRef<THREE.Group>(null);

  const orbMeshRef = useRef<THREE.Group | null>(null);
  const projectileGroupRef = useRef<THREE.Group | null>(null);
  const particleGroupRef = useRef<THREE.Group | null>(null);
  const zombieGroupRef = useRef<THREE.Group | null>(null);
  const powerUpGroupRef = useRef<THREE.Group | null>(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2(0, 0));
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const frustum = useRef(new THREE.Frustum());
  const projScreenMatrix = useRef(new THREE.Matrix4());
  const lastMouseWorldPos = useRef<THREE.Vector3>(new THREE.Vector3());

  const playerStateRef = useRef<PlayerState>({
    pos: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 },
    velocity: { x: 0, y: 0 },
    rotation: 0,
    radius: PLAYER_RADIUS,
    health: PLAYER_HEALTH_MAX,
    shield: 0,
    credits: INITIAL_CREDITS
  });

  // Physical colliders for movement and projectiles
  const ALL_COLLIDERS = useMemo<Wall[]>(() => [
    ...INITIAL_WALLS,
    { 
      x: UPGRADE_MACHINE_POS.x - 20, 
      y: UPGRADE_MACHINE_POS.y - 20, 
      width: 40, 
      height: 40, 
      color: '', 
      roomType: 'HUB' as const 
    }
  ], []);

  // --- Inventory System ---
  const weaponsRef = useRef<GunState[]>([
    {
      name: GUN_NAME,
      magAmmo: MAG_SIZE,
      magSize: MAG_SIZE,
      reserveAmmo: INITIAL_RESERVE,
      backupReserve: 0,
      isReloading: false,
      reloadTimer: 0,
      lastFireTime: 0,
      isUpgraded: false
    }
  ]);
  const activeWeaponIdxRef = useRef<number>(0);

  const projectilesRef = useRef<Projectile[]>([]);
  const projectileMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const zombiesRef = useRef<Zombie[]>([]);
  const zombieMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const impactParticlesRef = useRef<ImpactParticle[]>([]);
  const powerUpDropsRef = useRef<PowerUpDrop[]>([]);
  const powerUpMeshesRef = useRef<Map<string, THREE.Group>>(new Map());

  // Local state for pathfinding
  const zombiePathsRef = useRef<Map<string, Vector2D[]>>(new Map());
  const zombiePathTimersRef = useRef<Map<string, number>>(new Map());

  // Pre-calculate navigation grid
  const navGrid = useMemo(() => {
    const grid: boolean[][] = [];
    for (let y = 0; y < GRID_DIM; y++) {
      grid[y] = [];
      for (let x = 0; x < GRID_DIM; x++) {
        const worldX = x * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
        const worldY = y * GRID_CELL_SIZE + GRID_CELL_SIZE / 2;
        // Use a buffer radius to keep zombies from hugging walls too tightly
        grid[y][x] = isCollidingWithAnyWall({ x: worldX, y: worldY }, ZOMBIE_RADIUS + 10, ALL_COLLIDERS);
      }
    }
    return grid;
  }, [ALL_COLLIDERS]);

  // --- Pathfinding Implementation (A*) ---
  const findPath = useCallback((start: Vector2D, end: Vector2D): Vector2D[] | null => {
    const startX = Math.max(0, Math.min(GRID_DIM - 1, Math.floor(start.x / GRID_CELL_SIZE)));
    const startY = Math.max(0, Math.min(GRID_DIM - 1, Math.floor(start.y / GRID_CELL_SIZE)));
    const endX = Math.max(0, Math.min(GRID_DIM - 1, Math.floor(end.x / GRID_CELL_SIZE)));
    const endY = Math.max(0, Math.min(GRID_DIM - 1, Math.floor(end.y / GRID_CELL_SIZE)));

    const openList: NavNode[] = [];
    const closedList = new Set<string>();
    
    const startNode: NavNode = { 
      x: startX, 
      y: startY, 
      g: 0, 
      h: Math.abs(endX - startX) + Math.abs(endY - startY), 
      f: 0, 
      parent: null 
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    while (openList.length > 0) {
      // Find lowest F score
      let lowestIdx = 0;
      for (let i = 1; i < openList.length; i++) {
        if (openList[i].f < openList[lowestIdx].f) lowestIdx = i;
      }
      const current = openList.splice(lowestIdx, 1)[0];
      
      if (current.x === endX && current.y === endY) {
        const path: Vector2D[] = [];
        let curr: NavNode | null = current;
        while (curr) {
          path.unshift({ x: curr.x * GRID_CELL_SIZE + GRID_CELL_SIZE / 2, y: curr.y * GRID_CELL_SIZE + GRID_CELL_SIZE / 2 });
          curr = curr.parent;
        }
        return path;
      }

      closedList.add(`${current.x},${current.y}`);

      const neighbors = [
        { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 },
        { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
      ];

      for (const offset of neighbors) {
        const nx = current.x + offset.x;
        const ny = current.y + offset.y;

        if (nx < 0 || nx >= GRID_DIM || ny < 0 || ny >= GRID_DIM) continue;
        if (navGrid[ny][nx] || closedList.has(`${nx},${ny}`)) continue;

        const moveCost = (offset.x !== 0 && offset.y !== 0) ? 1.4 : 1;
        const gScore = current.g + moveCost;
        
        let neighborNode = openList.find(n => n.x === nx && n.y === ny);
        if (!neighborNode) {
          neighborNode = {
            x: nx,
            y: ny,
            g: gScore,
            h: Math.abs(endX - nx) + Math.abs(endY - ny),
            f: 0,
            parent: current
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openList.push(neighborNode);
        } else if (gScore < neighborNode.g) {
          neighborNode.g = gScore;
          neighborNode.f = neighborNode.g + neighborNode.h;
          neighborNode.parent = current;
        }
      }
    }
    return null;
  }, [navGrid]);

  const orbStateRef = useRef<OrbState>({
    pos: { x: 0, y: 0 },
    radius: ORB_RADIUS,
    isActive: false
  });

  const staminaRef = useRef<number>(STAMINA_MAX);
  const isExhaustedRef = useRef<boolean>(false);
  const inputsRef = useRef<InputMap>({});
  const isMouseDownRef = useRef<boolean>(false);
  const recoilRef = useRef<number>(0);

  const [hud, setHud] = useState({
    stamina: STAMINA_MAX,
    health: PLAYER_HEALTH_MAX,
    shield: 0,
    credits: INITIAL_CREDITS,
    round: 1,
    isExhausted: false,
    ammoMag: MAG_SIZE,
    ammoReserve: INITIAL_RESERVE,
    ammoBackup: 0,
    isReloading: false,
    reloadProgress: 0,
    isIntermission: false,
    lastZombieScreenPos: null as { x: number, y: number } | null,
    isGameOver: false,
    reticleScreenPos: null as { x: number, y: number } | null,
    recoil: 0,
    damageOverlayOpacity: 0,
    isNearShotgun: false,
    isNearSmg: false,
    isNearUpgrade: false,
    activeWeaponName: GUN_NAME
  });

  const createEnvMap = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = '#22d3ee';
    for(let i=0; i<8; i++) {
        ctx.lineWidth = Math.random() * 4;
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.random()*256, 0);
        ctx.lineTo(Math.random()*256, 256);
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  };

  const createFloorTexture = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, 512, 512);
    
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    for(let i=0; i<10; i++) {
        ctx.moveTo(i*20, 0);
        ctx.lineTo(i*20 + 40, 0);
        ctx.lineTo(0, i*20 + 40);
        ctx.lineTo(0, i*20);
        ctx.fill();
    }

    ctx.strokeStyle = '#0e7490';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 512);
      ctx.lineTo(Math.random() * 512, Math.random() * 512);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(WORLD_SIZE / 256, WORLD_SIZE / 256);
    return texture;
  };

  const createWallTexture = (width: number, height: number, roomType: string = 'HUB') => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    const baseColors: Record<string, string> = {
      HUB: '#1f2937',
      ENGINEERING: '#3f2b1d',
      HANGAR: '#27272a',
      CARGO: '#14532d',
      MEDBAY: '#f0f9ff',
      HYDRO: '#064e3b',
      SECURITY: '#450a0a',
      LIFE: '#0c4a6e',
      CRYO: '#2e1065'
    };
    
    ctx.fillStyle = baseColors[roomType] || '#1f2937';
    ctx.fillRect(0, 0, 256, 256);

    ctx.lineWidth = 4;
    if (roomType === 'HANGAR') {
        ctx.strokeStyle = '#facc15';
        for(let i=0; i<10; i++) {
            ctx.beginPath();
            ctx.moveTo(0, i*40);
            ctx.lineTo(256, i*40 + 40);
            ctx.stroke();
        }
    } else if (roomType === 'MEDBAY') {
        ctx.strokeStyle = '#bae6fd';
        ctx.strokeRect(20, 20, 216, 216);
        ctx.beginPath();
        ctx.moveTo(128, 40); ctx.lineTo(128, 216);
        ctx.moveTo(40, 128); ctx.lineTo(216, 128);
        ctx.stroke();
    } else if (roomType === 'ENGINEERING') {
        ctx.strokeStyle = '#d97706';
        for(let i=0; i<5; i++) {
            ctx.strokeRect(20 + i*10, 20 + i*10, 216 - i*20, 216 - i*20);
        }
    } else {
        ctx.strokeStyle = '#111827';
        ctx.strokeRect(4, 4, 248, 248);
        ctx.strokeRect(10, 10, 236, 120);
    }

    ctx.fillStyle = '#0f172a';
    [15, 241].forEach(x => {
        [15, 125, 241].forEach(y => {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI*2);
            ctx.fill();
        });
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(width / 128, height / 128);
    return texture;
  };

  const playSfx = useCallback((freq: number, gainVal: number, duration: number, waveform: OscillatorType = 'square') => {
    if (isPausedRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = waveform;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }, []);

  const playZombieSfx = useCallback((type: 'groan' | 'death' | 'idle') => {
    if (isPausedRef.current) return;
    if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(1.8, ctx.currentTime); // High audibility
    masterGain.connect(ctx.destination);

    if (type === 'groan') {
        const variants = [
            () => { // Variant 1: Deep sweep
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(80 + Math.random() * 20, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.8);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.15, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
                osc.connect(g); g.connect(masterGain);
                osc.start(); osc.stop(ctx.currentTime + 0.8);
            },
            () => { // Variant 2: Gurgle
                const osc = ctx.createOscillator();
                osc.type = 'square';
                osc.frequency.setValueAtTime(100, ctx.currentTime);
                const lfo = ctx.createOscillator();
                lfo.frequency.setValueAtTime(25, ctx.currentTime);
                const lfoGain = ctx.createGain();
                lfoGain.gain.setValueAtTime(50, ctx.currentTime);
                lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.1, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
                osc.connect(g); g.connect(masterGain);
                osc.start(); lfo.start();
                osc.stop(ctx.currentTime + 0.6); lfo.stop(ctx.currentTime + 0.6);
            }
        ];
        variants[Math.floor(Math.random() * variants.length)]();
    } else if (type === 'death') {
        const variants = [
            () => { // Variant 1: Falling scream
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.4);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.3, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                osc.connect(g); g.connect(masterGain);
                osc.start(); osc.stop(ctx.currentTime + 0.5);
            },
            () => { // Variant 2: Wet crunch
                const noise = ctx.createBufferSource();
                const bufferSize = ctx.sampleRate * 0.3;
                const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for(let i=0; i<bufferSize; i++) data[i] = Math.random() * 2 - 1;
                noise.buffer = buffer;
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(800, ctx.currentTime);
                filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.4, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                noise.connect(filter); filter.connect(g); g.connect(masterGain);
                noise.start(); noise.stop(ctx.currentTime + 0.3);
            }
        ];
        variants[Math.floor(Math.random() * variants.length)]();
    } else if (type === 'idle') {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.5);
        g.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 1.0);
        osc.connect(g); g.connect(masterGain);
        osc.start(); osc.stop(ctx.currentTime + 1.0);
    }
  }, []);

  const playImpactSfx = useCallback(() => {
    if (isPausedRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const gain = ctx.createGain();
    
    const bufferSize = ctx.sampleRate * 0.1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(900 + Math.random() * 200, ctx.currentTime);
    
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.connect(gain);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    noise.start();
    osc.stop(ctx.currentTime + 0.1);
    noise.stop(ctx.currentTime + 0.1);
  }, []);

  const spawnImpactEffects = useCallback((x: number, y: number) => {
    if (!sceneRef.current || !particleGroupRef.current) return;
    
    playImpactSfx();

    const count = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({ 
          color: 0xffa500, 
          emissive: 0xff4500, 
          emissiveIntensity: 5,
          transparent: true 
        })
      );
      mesh.position.set(x, 30, y);
      
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        Math.random() * 6 + 2,
        (Math.random() - 0.5) * 8
      );
      
      particleGroupRef.current.add(mesh);
      impactParticlesRef.current.push({
        id: Math.random().toString(36).substr(2, 9),
        mesh,
        velocity,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.2
      });
    }
  }, [playImpactSfx]);

  const createZombieMesh = () => {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8, transparent: true });
    const clothesMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9, transparent: true });
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 2, transparent: true });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 10), clothesMat);
    torso.position.y = 30;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 14), bodyMat);
    head.position.y = 48;
    head.castShadow = true;
    group.add(head);

    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2), eyeMat);
    leftEye.position.set(-4, 2, 7.5);
    head.add(leftEye);

    const rightEye = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 2), eyeMat);
    rightEye.position.set(4, 2, 7.5);
    head.add(rightEye);

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), bodyMat);
    leftArm.position.set(-12, 38, 5);
    leftArm.rotation.x = -Math.PI / 3;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(6, 18, 6), bodyMat);
    rightArm.position.set(12, 38, 5);
    rightArm.rotation.x = -Math.PI / 3;
    group.add(rightArm);

    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(7, 20, 7), bodyMat);
    leftLeg.position.set(-5, 10, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(7, 20, 7), bodyMat);
    rightLeg.position.set(5, 10, 0);
    group.add(rightLeg);

    return group;
  };

  const createUpgradeMachineModel = () => {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.2 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 10 });
    
    const base = new THREE.Mesh(new THREE.BoxGeometry(40, 60, 40), metalMat);
    base.position.y = 30;
    group.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(50, 10, 50), metalMat);
    top.position.y = 65;
    group.add(top);

    const core = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 30, 16), glowMat);
    core.position.y = 45;
    group.add(core);

    const light = new THREE.PointLight(0xef4444, 20000, 150);
    light.position.y = 45;
    group.add(light);

    return group;
  };

  const createMaxAmmoModel = () => {
    const group = new THREE.Group();
    const chipBase = new THREE.Mesh(
      new THREE.BoxGeometry(22, 4, 22),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
    );
    group.add(chipBase);
    
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 1.0 });
    for(let i=0; i<4; i++) {
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), pinMat);
        p1.position.set(-13, 0, -7.5 + i*5);
        group.add(p1);
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), pinMat);
        p2.position.set(13, 0, -7.5 + i*5);
        group.add(p2);
    }
    
    const core = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.5, 14),
        new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 15 })
    );
    core.position.y = 2.1;
    group.add(core);

    const orbLight = new THREE.PointLight(0x22c55e, 15000, 200);
    group.add(orbLight);
    
    return group;
  };

  const createShotgunModel = (isHolding: boolean) => {
    const group = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 1.0, roughness: 0.2 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 10 });

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 20), metalMat);
    group.add(receiver);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 35), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 20;
    group.add(barrel);

    const magazineTube = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 30), metalMat);
    magazineTube.rotation.x = Math.PI / 2;
    magazineTube.position.set(0, -3, 18);
    group.add(magazineTube);

    const pump = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 10), woodMat);
    pump.position.set(0, -3, 15);
    group.add(pump);

    const stock = new THREE.Mesh(new THREE.BoxGeometry(4.5, 8, 15), woodMat);
    stock.position.set(0, -2, -15);
    stock.rotation.x = -0.1;
    group.add(stock);

    const flareCore = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3, 6), glowMat);
    flareCore.position.set(0, 1.5, 0);
    group.add(flareCore);

    if (isHolding) {
        group.scale.set(1.2, 1.2, 1.2);
    } else {
        group.scale.set(1.5, 1.5, 1.5);
    }
    
    return group;
  };

  const createSmgModel = (isHolding: boolean) => {
    const group = new THREE.Group();
    const polyMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
    const neonMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x8b5cf6, emissiveIntensity: 15 });
    
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 16), polyMat);
    group.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 10), polyMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 1.5, 10);
    group.add(barrel);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 4), polyMat);
    grip.position.set(0, -5, -2);
    grip.rotation.x = 0.3;
    group.add(grip);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(2.5, 11, 3.5), polyMat);
    magazine.position.set(0, -6, 4);
    group.add(magazine);

    const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.5, 1.5), neonMat);
    neonStrip.position.set(0, 1.5, 14);
    group.add(neonStrip);

    if (isHolding) {
        group.scale.set(1.1, 1.1, 1.1);
    } else {
        group.scale.set(1.4, 1.4, 1.4);
    }
    return group;
  };

  const isPointInView = (x: number, y: number) => {
    if (!cameraRef.current) return false;
    const pos = new THREE.Vector3(x, 0, y);
    projScreenMatrix.current.multiplyMatrices(cameraRef.current.projectionMatrix, cameraRef.current.matrixWorldInverse);
    frustum.current.setFromProjectionMatrix(projScreenMatrix.current);
    return frustum.current.containsPoint(pos);
  };

  const hasLineOfSight = (p1: Vector2D, p2: Vector2D) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return true;
    
    const step = 20;
    const steps = Math.floor(dist / step);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const testPoint = { x: p1.x + dx * t, y: p1.y + dy * t };
      if (isCollidingWithAnyWall(testPoint, 5, ALL_COLLIDERS)) return false;
    }
    return true;
  };

  const spawnZombie = useCallback(() => {
    // Check Round Quota
    const roundTotal = roundNumberRef.current * ZOMBIES_PER_ROUND_MULTIPLIER;
    if (zombiesSpawnedInRoundRef.current >= roundTotal) return;
    
    // Check Active Field Limit
    if (zombiesRef.current.length >= MAX_ZOMBIES) return;

    let valid = false;
    let x = 0, y = 0;
    let attempts = 0;
    const player = playerStateRef.current;

    while (!valid && attempts < 50) {
      x = Math.random() * WORLD_SIZE;
      y = Math.random() * WORLD_SIZE;
      
      const inView = isPointInView(x, y);
      const colliding = isCollidingWithAnyWall({ x, y }, ZOMBIE_RADIUS, ALL_COLLIDERS);

      if (!inView && !colliding) {
        // Just ensuring it's not too close to player on spawn
        const distToPlayer = Math.sqrt(Math.pow(x - player.pos.x, 2) + Math.pow(y - player.pos.y, 2));
        if (distToPlayer > 300) valid = true;
      }
      attempts++;
    }

    if (valid) {
      const id = Math.random().toString(36).substr(2, 9);
      const shotsNeeded = 2 + (roundNumberRef.current - 1) * 3;
      const z: Zombie = {
        id,
        pos: { x, y },
        health: shotsNeeded * 15,
        rotation: 0,
        radius: ZOMBIE_RADIUS,
        lastGroanTime: 0
      };
      zombiesRef.current.push(z);
      zombiesSpawnedInRoundRef.current++;
      
      const mesh = createZombieMesh();
      zombieGroupRef.current?.add(mesh);
      zombieMeshesRef.current.set(id, mesh);
    }
  }, [ALL_COLLIDERS]);

  const spawnOrb = useCallback(() => {
    let valid = false;
    let attempts = 0;
    let x = 0, y = 0;
    while (!valid && attempts < 100) {
      x = Math.random() * (WORLD_SIZE - 200) + 100;
      y = Math.random() * (WORLD_SIZE - 200) + 100;
      if (!isCollidingWithAnyWall({ x, y }, ORB_RADIUS + 5, ALL_COLLIDERS)) {
        valid = true;
      }
      attempts++;
    }
    orbStateRef.current = { pos: { x, y }, radius: ORB_RADIUS, isActive: true };
    if (orbMeshRef.current) {
      orbMeshRef.current.position.set(x, 20, y);
      orbMeshRef.current.visible = true;
    }
  }, [ALL_COLLIDERS]);

  const dropMaxAmmo = useCallback((pos: Vector2D) => {
    if (!powerUpGroupRef.current) return;
    const id = Math.random().toString(36).substr(2, 9);
    const drop: PowerUpDrop = { id, pos, type: 'MAX_AMMO', spawnTime: gameTimeRef.current };
    powerUpDropsRef.current.push(drop);

    const mesh = createMaxAmmoModel();
    mesh.position.set(pos.x, 20, pos.y);
    powerUpGroupRef.current.add(mesh);
    powerUpMeshesRef.current.set(id, mesh);
  }, []);

  const triggerMaxAmmo = useCallback(() => {
    playSfx(1200, 0.4, 0.6, 'triangle');
    playSfx(800, 0.3, 0.8, 'sine');
    
    weaponsRef.current.forEach(w => {
      // Immediate reload of active clip
      w.magAmmo = w.magSize;
      
      // Determine refill capacity based on weapon type
      let refillReserve = INITIAL_RESERVE;
      if (w.name.includes(SHOTGUN_NAME) || w.name.includes("SOLAR")) refillReserve = SHOTGUN_RESERVE;
      else if (w.name.includes(SMG_NAME) || w.name.includes("TESLA")) refillReserve = SMG_RESERVE;
      
      // Adjust for upgraded weapons
      if (w.isUpgraded) {
          refillReserve = Math.max(refillReserve, INITIAL_RESERVE * 2);
      }
      
      w.reserveAmmo = refillReserve;
      w.backupReserve = 0; // Reset backup if any
    });
  }, [playSfx]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    scene.fog = new THREE.Fog(0x020617, 300, 1200);
    const envMap = createEnvMap();
    scene.environment = envMap;
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 4000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        logarithmicDepthBuffer: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.5;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x4f46e5, 0.8);
    dirLight.position.set(150, 600, 150);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 100;
    dirLight.shadow.camera.far = 2000;
    dirLight.shadow.bias = -0.0005; 
    dirLight.shadow.normalBias = 0.05;
    scene.add(dirLight);

    INITIAL_WALLS.forEach((wall, i) => {
      const roomType = wall.roomType || 'HUB';
      const roomColor = ROOM_COLORS[roomType];
      const wallHeightIn3D = 80;
      const sideTexLong = createWallTexture(wall.width, wallHeightIn3D, roomType);
      const sideTexShort = createWallTexture(wall.height, wallHeightIn3D, roomType);
      const topTex = createWallTexture(wall.width, wall.height, roomType);

      const matConfig = { 
        roughness: 0.4, 
        metalness: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      };

      const materials = [
        new THREE.MeshStandardMaterial({ map: sideTexShort, ...matConfig }),
        new THREE.MeshStandardMaterial({ map: sideTexShort, ...matConfig }),
        new THREE.MeshStandardMaterial({ map: topTex, ...matConfig }),
        new THREE.MeshStandardMaterial({ map: topTex, ...matConfig }),
        new THREE.MeshStandardMaterial({ map: sideTexLong, ...matConfig }),
        new THREE.MeshStandardMaterial({ map: sideTexLong, ...matConfig }),
      ];

      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(wall.width + 2.0, wallHeightIn3D, wall.height + 2.0),
        materials
      );
      
      const tierOffset = i * 0.001;
      mesh.position.set(
        wall.x + wall.width / 2, 
        (wallHeightIn3D / 2) + tierOffset, 
        wall.y + wall.height / 2
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      
      if(i % 3 === 0) {
          const light = new THREE.PointLight(roomColor, 80000, 450);
          light.position.set(wall.x + wall.width/2, 65, wall.y + wall.height/2);
          scene.add(light);
          
          const lampMat = new THREE.MeshStandardMaterial({ color: roomColor, emissive: roomColor, emissiveIntensity: 15 });
          const lampMesh = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2, 8), lampMat);
          lampMesh.position.set(wall.x + wall.width/2, wallHeightIn3D - 2, wall.y + wall.height/2);
          scene.add(lampMesh);
      }

      const pipeGeo = new THREE.CylinderGeometry(2, 2, wall.width, 8);
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 1, roughness: 0.2 });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.rotation.z = Math.PI/2;
      pipe.position.set(wall.x + wall.width/2, 5, wall.y + wall.height/2 + (wall.height/2 + 3));
      scene.add(pipe);
    });

    const floorTexture = createFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE),
      new THREE.MeshStandardMaterial({ 
        map: floorTexture,
        roughness: 0.22, 
        metalness: 0.85,
        envMapIntensity: 1.2
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD_SIZE / 2, -0.1, WORLD_SIZE / 2);
    floor.receiveShadow = true;
    scene.add(floor);

    const player = new THREE.Group();
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.9 });
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 10 });
    
    // Shield energy aura
    const sGlow = new THREE.Mesh(
      new THREE.SphereGeometry(32, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x22d3ee,
        emissiveIntensity: 3,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      })
    );
    sGlow.position.y = 35;
    sGlow.visible = false;
    player.add(sGlow);
    (shieldGlowRef as any).current = sGlow;

    const torsoGroup = new THREE.Group();
    const torsoChest = new THREE.Mesh(new THREE.BoxGeometry(22, 24, 14), armorMat);
    torsoChest.position.y = 32;
    torsoChest.castShadow = true;
    torsoGroup.add(torsoChest);

    const backPlate = new THREE.Mesh(new THREE.BoxGeometry(16, 18, 4), armorMat);
    backPlate.position.set(0, 32, -8);
    torsoGroup.add(backPlate);
    player.add(torsoGroup);

    const headGroup = new THREE.Group();
    const helmetMain = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 16), armorMat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 2), glowMat);
    visor.position.set(0, 1, 7.5);
    headGroup.add(helmetMain);
    headGroup.add(visor);
    headGroup.position.y = 48;
    player.add(headGroup);
    (headRef as any).current = headGroup;

    const createLimb = (isArm: boolean) => {
      const group = new THREE.Group();
      const upper = new THREE.Mesh(isArm ? new THREE.CylinderGeometry(3, 2.5, 12) : new THREE.BoxGeometry(7, 14, 7), armorMat);
      upper.position.y = isArm ? -6 : -7;
      upper.castShadow = true;
      group.add(upper);
      return group;
    };

    const leftArm = createLimb(true);
    leftArm.position.set(-14, 42, 0);
    player.add(leftArm);
    (leftArmRef as any).current = leftArm;

    const rightArm = createLimb(true);
    rightArm.position.set(14, 42, 0);
    
    // Weapon Models
    const neutronVanguard = new THREE.Group();
    const nvBody = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 25), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 1.0, roughness: 0.1 }));
    const nvBarrel = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 15), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 1.0 }));
    nvBarrel.rotation.x = Math.PI / 2;
    nvBarrel.position.z = 15;
    const nvGlow = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2, 8), glowMat);
    nvGlow.position.set(0, 1, 8);
    neutronVanguard.add(nvBody, nvBarrel, nvGlow);
    neutronVanguard.position.set(0, -12, 10);
    rightArm.add(neutronVanguard);
    (neutronVanguardModelRef as any).current = neutronVanguard;

    const flareBreaker = createShotgunModel(true);
    flareBreaker.position.set(0, -10, 15);
    flareBreaker.visible = false;
    rightArm.add(flareBreaker);
    (flareBreakerModelRef as any).current = flareBreaker;

    const voltRipper = createSmgModel(true);
    voltRipper.position.set(0, -12, 12);
    voltRipper.visible = false;
    rightArm.add(voltRipper);
    (voltRipperModelRef as any).current = voltRipper;

    // Revised Muzzle Flash with 12-pointed intense star geometry
    const flashMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 8, 6, 12, 1, false),
      new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 25, transparent: true, side: THREE.DoubleSide })
    );
    flashMesh.rotation.x = Math.PI / 2;
    flashMesh.visible = false;
    rightArm.add(flashMesh); 
    (muzzleFlashMeshRef as any).current = flashMesh;

    const flashLight = new THREE.PointLight(0xffaa00, 10000, 100);
    flashLight.visible = false;
    rightArm.add(flashLight);
    (muzzleFlashLightRef as any).current = flashLight;

    player.add(rightArm);
    (rightArmRef as any).current = rightArm;

    const leftLeg = createLimb(false);
    leftLeg.position.set(-7, 20, 0);
    player.add(leftLeg);
    (leftLegRef as any).current = leftLeg;

    const rightLeg = createLimb(false);
    rightLeg.position.set(7, 20, 0);
    player.add(rightLeg);
    (rightLegRef as any).current = rightLeg;

    scene.add(player);
    (playerMeshRef as any).current = player;

    // Upgrade Machine
    const upgradeMachine = createUpgradeMachineModel();
    upgradeMachine.position.set(UPGRADE_MACHINE_POS.x, 0, UPGRADE_MACHINE_POS.y);
    scene.add(upgradeMachine);
    (upgradeMachineModelRef as any).current = upgradeMachine;

    // Wall Buys
    const shotgunWallBuy = createShotgunModel(false);
    shotgunWallBuy.position.set(1780, 50, 45 + THICK);
    shotgunWallBuy.rotation.set(0, -Math.PI / 2, 0.4);
    scene.add(shotgunWallBuy);
    (wallBuyFlareBreakerRef as any).current = shotgunWallBuy;
    const wallBuyLight = new THREE.PointLight(0xef4444, 12000, 120);
    wallBuyLight.position.set(1780, 70, 60 + THICK);
    scene.add(wallBuyLight);

    const smgWallBuy = createSmgModel(false);
    // Adjusted to be flat against the wall and not phasing
    smgWallBuy.position.set(800, 50, 742); 
    smgWallBuy.rotation.set(0, 0, 0);
    scene.add(smgWallBuy);
    (wallBuyVoltRipperRef as any).current = smgWallBuy;
    const smgLight = new THREE.PointLight(0x8b5cf6, 12000, 120);
    smgLight.position.set(800, 70, 745);
    scene.add(smgLight);

    // Circuitry Chip Shield Model
    const orbGroup = new THREE.Group();
    const chipBase = new THREE.Mesh(
      new THREE.BoxGeometry(22, 4, 22),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 })
    );
    orbGroup.add(chipBase);
    
    // Add silver pins
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 1.0 });
    for(let i=0; i<4; i++) {
        const p1 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), pinMat);
        p1.position.set(-13, 0, -7.5 + i*5);
        orbGroup.add(p1);
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(4, 1.5, 2), pinMat);
        p2.position.set(13, 0, -7.5 + i*5);
        orbGroup.add(p2);
    }
    
    // Central glowing processing unit
    const core = new THREE.Mesh(
        new THREE.BoxGeometry(14, 1.5, 14),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 12 })
    );
    core.position.y = 2.1;
    orbGroup.add(core);

    const orbLight = new THREE.PointLight(0x22d3ee, 15000, 200);
    orbGroup.add(orbLight);
    
    orbGroup.position.y = 20;
    scene.add(orbGroup);
    orbMeshRef.current = orbGroup;
    spawnOrb();

    const projGroup = new THREE.Group();
    scene.add(projGroup);
    projectileGroupRef.current = projGroup;

    const partGroup = new THREE.Group();
    scene.add(partGroup);
    particleGroupRef.current = partGroup;

    const zGroup = new THREE.Group();
    scene.add(zGroup);
    zombieGroupRef.current = zGroup;

    const puGroup = new THREE.Group();
    scene.add(puGroup);
    powerUpGroupRef.current = puGroup;

    const handleKeyDown = (e: KeyboardEvent) => { 
        if(!isPausedRef.current) {
            const key = e.key.toLowerCase();
            inputsRef.current[key] = true; 
            
            // Cycle weapon with 'Q'
            if (key === 'q' && weaponsRef.current.length > 1) {
                // Cancel current reload when switching
                weaponsRef.current[activeWeaponIdxRef.current].isReloading = false;
                weaponsRef.current[activeWeaponIdxRef.current].reloadTimer = 0;
                
                activeWeaponIdxRef.current = (activeWeaponIdxRef.current + 1) % weaponsRef.current.length;
                playSfx(600, 0.2, 0.05, 'sine');
            }
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if(!isPausedRef.current) inputsRef.current[e.key.toLowerCase()] = false; };
    const handleMouseDown = (e: MouseEvent) => { if(!isPausedRef.current && e.button === 0) isMouseDownRef.current = true; };
    const handleMouseUp = (e: MouseEvent) => { if(!isPausedRef.current && e.button === 0) isMouseDownRef.current = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if(isPausedRef.current) return;
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
    };
  }, [spawnOrb, playSfx, ALL_COLLIDERS]);

  const update = useCallback(() => {
    const now = performance.now();
    const dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;

    if (!isPausedRef.current && !hud.isGameOver) {
      gameTimeRef.current += dt;
      const gameTime = gameTimeRef.current;
      const inputs = inputsRef.current;
      const player = playerStateRef.current;
      const orb = orbStateRef.current;
      
      // Get current weapon reference
      const gun = weaponsRef.current[activeWeaponIdxRef.current];

      recoilRef.current = THREE.MathUtils.lerp(recoilRef.current, 0, 0.15);
      cameraShakeRef.current = Math.max(0, cameraShakeRef.current - dt * 20);
      damageFlashRef.current = Math.max(0, damageFlashRef.current - dt * 3);

      // Robust weapon identifier checks for cool names
      const isShotgun = gun.name.includes(SHOTGUN_NAME) || gun.name === "SOLAR ERUPTION";
      const isSMG = gun.name.includes(SMG_NAME) || gun.name === "TESLA STORM";
      const isVanguard = gun.name === GUN_NAME || gun.name === "NEUTRON QUASAR";

      const muzzleOffsetZ = (isShotgun ? SHOTGUN_MUZZLE_OFFSET : (isSMG ? SMG_MUZZLE_OFFSET : NV_MUZZLE_OFFSET));

      // Weapon Model Visibility Sync
      if (neutronVanguardModelRef.current) neutronVanguardModelRef.current.visible = isVanguard;
      if (flareBreakerModelRef.current) flareBreakerModelRef.current.visible = isShotgun;
      if (voltRipperModelRef.current) voltRipperModelRef.current.visible = isSMG;

      if (muzzleFlashMeshRef.current) {
          muzzleFlashMeshRef.current.position.set(0, 0, muzzleOffsetZ);
      }
      if (muzzleFlashLightRef.current) {
          muzzleFlashLightRef.current.position.set(0, 0, muzzleOffsetZ + 2);
      }

      // --- Round / Horde Management ---
      if (zombiesRemainingInRoundRef.current <= 0 && zombiesRef.current.length === 0) {
        intermissionTimerRef.current += dt;
        if (intermissionTimerRef.current >= ROUND_INTERMISSION_TIME) {
          roundNumberRef.current++;
          zombiesSpawnedInRoundRef.current = 0;
          zombiesRemainingInRoundRef.current = roundNumberRef.current * ZOMBIES_PER_ROUND_MULTIPLIER;
          intermissionTimerRef.current = 0;
          playSfx(880, 0.2, 0.5, 'triangle');
          playSfx(110, 0.3, 0.8, 'sine');
        }
      }

      let currentReticleScreenPos = null;
      if (cameraRef.current) {
        raycaster.current.setFromCamera(mouse.current, cameraRef.current);
        const intersect = new THREE.Vector3();
        raycaster.current.ray.intersectPlane(floorPlane.current, intersect);
        lastMouseWorldPos.current.copy(intersect);
        player.rotation = Math.atan2(intersect.x - player.pos.x, intersect.z - player.pos.y);

        const reticleWorld = intersect.clone();
        reticleWorld.project(cameraRef.current);
        currentReticleScreenPos = {
            x: (reticleWorld.x * 0.5 + 0.5) * window.innerWidth,
            y: (-(reticleWorld.y * 0.5) + 0.5) * window.innerHeight
        };
      }

      if (muzzleFlashTimerRef.current > 0) {
        muzzleFlashTimerRef.current -= dt;
        if (muzzleFlashTimerRef.current <= 0) {
          if (muzzleFlashMeshRef.current) muzzleFlashMeshRef.current.visible = false;
          if (muzzleFlashLightRef.current) muzzleFlashLightRef.current.visible = false;
        }
      }

      zombieSpawnTimerRef.current += dt;
      if (zombieSpawnTimerRef.current >= ZOMBIE_SPAWN_INTERVAL) {
        spawnZombie();
        zombieSpawnTimerRef.current = 0;
      }

      // --- Interaction Check ---
      const shotgunWallPos = { x: 1780, y: 45 + THICK };
      const distToShotgun = Math.sqrt(Math.pow(player.pos.x - shotgunWallPos.x, 2) + Math.pow(player.pos.y - shotgunWallPos.y, 2));
      const isNearShotgun = distToShotgun < 100;

      const smgWallPos = { x: 800, y: 742 };
      const distToSmg = Math.sqrt(Math.pow(player.pos.x - smgWallPos.x, 2) + Math.pow(player.pos.y - smgWallPos.y, 2));
      const isNearSmg = distToSmg < 100;

      const distToUpgrade = Math.sqrt(Math.pow(player.pos.x - UPGRADE_MACHINE_POS.x, 2) + Math.pow(player.pos.y - UPGRADE_MACHINE_POS.y, 2));
      const isNearUpgrade = distToUpgrade < 120;
      
      const handlePurchase = (name: string, cost: number, magSize: number, reserveSize: number) => {
          // Robust lookup for upgraded weapons to allow ammo refills
          const existingIndex = weaponsRef.current.findIndex(w => 
              w.name === name || 
              (name === GUN_NAME && w.name === "NEUTRON QUASAR") ||
              (name === SHOTGUN_NAME && w.name === "SOLAR ERUPTION") ||
              (name === SMG_NAME && w.name === "TESLA STORM")
          );
          if (existingIndex === -1) {
              if (player.credits >= cost) {
                  player.credits -= cost;
                  const newWeapon: GunState = {
                      name, magSize, magAmmo: magSize, reserveAmmo: reserveSize, backupReserve: 0,
                      isReloading: false, reloadTimer: 0, lastFireTime: 0, isUpgraded: false
                  };
                  if (weaponsRef.current.length < 2) {
                      weaponsRef.current.push(newWeapon);
                      activeWeaponIdxRef.current = weaponsRef.current.length - 1;
                  } else {
                      weaponsRef.current[activeWeaponIdxRef.current] = newWeapon;
                  }
                  playSfx(110, 0.4, 0.6, 'sawtooth');
              }
          } else {
              const weaponRef = weaponsRef.current[existingIndex];
              if ((weaponRef.reserveAmmo < reserveSize || weaponRef.magAmmo < magSize) && player.credits >= cost) {
                  player.credits -= cost;
                  weaponRef.magAmmo = magSize;
                  weaponRef.reserveAmmo = reserveSize;
                  playSfx(880, 0.2, 0.2, 'sine');
              }
          }
      };

      if (inputs['e']) {
          if (isNearShotgun) { handlePurchase(SHOTGUN_NAME, SHOTGUN_COST, SHOTGUN_MAG_SIZE, SHOTGUN_RESERVE); inputs['e'] = false; }
          else if (isNearSmg) { handlePurchase(SMG_NAME, SMG_COST, SMG_MAG_SIZE, SMG_RESERVE); inputs['e'] = false; }
          else if (isNearUpgrade && !gun.isUpgraded && player.credits >= UPGRADE_COST) {
              player.credits -= UPGRADE_COST;
              gun.isUpgraded = true;
              
              // New Cool Upgraded Names
              if (gun.name === GUN_NAME) gun.name = "NEUTRON QUASAR";
              else if (gun.name === SHOTGUN_NAME) gun.name = "SOLAR ERUPTION";
              else if (gun.name === SMG_NAME) gun.name = "TESLA STORM";
              else gun.name = gun.name + " MK II";

              gun.magSize *= 2;
              gun.magAmmo = gun.magSize;
              gun.reserveAmmo = Math.max(gun.reserveAmmo, INITIAL_RESERVE * 2);
              playSfx(50, 0.8, 1.5, 'sawtooth');
              playSfx(880, 0.2, 0.5, 'triangle');
              inputs['e'] = false;
          }
      }

      // --- Melee Attack ---
      if (inputs['v'] && staminaRef.current >= 0.5 && gameTime - lastMeleeTimeRef.current > 0.6) {
        staminaRef.current -= 0.5;
        lastMeleeTimeRef.current = gameTime;
        playSfx(80, 0.5, 0.2, 'sawtooth');
        
        const meleeDamage = 30;
        const meleeRange = 60;
        const meleeAngleLimit = 1.0;
        
        zombiesRef.current.forEach(z => {
          if (z.isDying) return;
          const dx = z.pos.x - player.pos.x;
          const dy = z.pos.y - player.pos.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < meleeRange) {
            const angleToZombie = Math.atan2(dx, dy);
            let angleDiff = Math.abs(angleToZombie - player.rotation);
            if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
            
            if (angleDiff < meleeAngleLimit) {
              z.health -= meleeDamage;
              player.credits += POINTS_PER_HIT;
              spawnImpactEffects(z.pos.x, z.pos.y);
              if (z.health <= 0 && !z.isDying) {
                z.isDying = true;
                z.deathTimer = 0.5;
                player.credits += 100; // Bonus for melee execution
                playZombieSfx('death');
                zombiesRemainingInRoundRef.current = Math.max(0, zombiesRemainingInRoundRef.current - 1);
                
                // Drop Max Ammo powerup with low chance
                if (Math.random() < MAX_AMMO_DROP_CHANCE) {
                  dropMaxAmmo(z.pos);
                }
              }
            }
          }
        });
      }

      const activeFireRate = (isShotgun ? SHOTGUN_FIRE_RATE : (isSMG ? SMG_FIRE_RATE : FIRE_RATE));

      if (isMouseDownRef.current && !gun.isReloading && gameTime - gun.lastFireTime > activeFireRate) {
        if (gun.magAmmo > 0) {
          const bulletId = Math.random().toString(36).substr(2, 9);
          const angle = player.rotation;
          const offX = 14; 
          
          const muzzleX = player.pos.x + offX * Math.cos(angle) + muzzleOffsetZ * Math.sin(angle);
          const muzzleY = player.pos.y - offX * Math.sin(angle) + muzzleOffsetZ * Math.cos(angle);
          
          const targetDirX = lastMouseWorldPos.current.x - muzzleX;
          const targetDirY = lastMouseWorldPos.current.z - muzzleY;
          const targetDist = Math.sqrt(targetDirX * targetDirX + targetDirY * targetDirY);
          
          const velX = targetDist > 0.1 ? (targetDirX / targetDist) * PROJECTILE_SPEED : 0;
          const velY = targetDist > 0.1 ? (targetDirY / targetDist) * PROJECTILE_SPEED : 0;

          projectilesRef.current.push({
            id: bulletId,
            pos: { x: muzzleX, y: muzzleY },
            velocity: { x: velX, y: velY },
            distanceTraveled: 0
          });

          gun.magAmmo--;
          gun.lastFireTime = gameTime;
          recoilRef.current = (isShotgun ? 2.5 : (isSMG ? 0.3 : 1.0));
          muzzleFlashTimerRef.current = 0.05;
          if (muzzleFlashMeshRef.current) {
              muzzleFlashMeshRef.current.visible = true;
              muzzleFlashMeshRef.current.rotation.z = Math.random() * Math.PI;
          }
          if (muzzleFlashLightRef.current) muzzleFlashLightRef.current.visible = false;

          if (isShotgun) {
            playSfx(60, 0.7, 0.4, 'sawtooth');
            playSfx(40, 0.8, 0.5, 'sine');
            cameraShakeRef.current = 15;
          } else if (isSMG) {
            playSfx(220 + Math.random() * 50, 0.25, 0.05, 'square');
          } else {
            playSfx(150 + Math.random() * 50, 0.4, 0.08, 'sawtooth');
          }

          if (gun.magAmmo < (isShotgun ? 2 : 5) && gun.magAmmo >= 0) playSfx(1200, 0.4, 0.05, 'triangle');
        } else {
          if (gameTime - gun.lastFireTime > activeFireRate) {
            playSfx(400, 0.1, 0.05, 'square');
            gun.lastFireTime = gameTime;
          }
        }
      }

      if (inputs['r'] && !gun.isReloading && gun.magAmmo < gun.magSize && (gun.reserveAmmo > 0 || gun.backupReserve > 0)) {
        gun.isReloading = true;
        gun.reloadTimer = 0;
        playSfx(440, 0.1, 0.5, 'triangle');
      }

      const activeReloadTime = (isShotgun ? SHOTGUN_RELOAD_TIME : (isSMG ? SMG_RELOAD_TIME : RELOAD_TIME));

      if (gun.isReloading) {
        gun.reloadTimer += dt;
        if (gun.reloadTimer >= activeReloadTime) {
          gun.backupReserve += gun.magAmmo;
          gun.magAmmo = 0;
          const fromReserve = Math.min(gun.magSize, gun.reserveAmmo);
          gun.magAmmo += fromReserve;
          gun.reserveAmmo -= fromReserve;
          if (gun.magAmmo < gun.magSize && gun.reserveAmmo <= 0) {
            const needed = gun.magSize - gun.magAmmo;
            const fromBackup = Math.min(needed, gun.backupReserve);
            gun.magAmmo += fromBackup;
            gun.backupReserve -= fromBackup;
          }
          gun.isReloading = false;
          gun.reloadTimer = 0;
          playSfx(880, 0.1, 0.2, 'sine');
        }
      }

      let moveDirX = 0, moveDirY = 0;
      if (inputs['w'] || inputs['arrowup']) moveDirY -= 1;
      if (inputs['s'] || inputs['arrowdown']) moveDirY += 1;
      if (inputs['a'] || inputs['arrowleft']) moveDirX -= 1;
      if (inputs['d'] || inputs['arrowright']) moveDirX += 1;

      const inputLen = Math.sqrt(moveDirX * moveDirX + moveDirY * moveDirY);
      if (inputLen > 1) {
        moveDirX /= inputLen;
        moveDirY /= inputLen;
      }

      const isSprintingInput = inputs['shift'] && inputLen > 0 && !isExhaustedRef.current;
      const targetMaxSpeed = isSprintingInput ? SPRINT_SPEED : PLAYER_SPEED;
      player.velocity.x += moveDirX * 40 * dt;
      player.velocity.y += moveDirY * 40 * dt;
      player.velocity.x -= player.velocity.x * 8 * dt;
      player.velocity.y -= player.velocity.y * 8 * dt;

      const velMag = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
      if (velMag > targetMaxSpeed) {
        const ratio = targetMaxSpeed / velMag;
        player.velocity.x *= ratio;
        player.velocity.y *= ratio;
      }

      const nextX = { x: player.pos.x + player.velocity.x, y: player.pos.y };
      if (!isCollidingWithAnyWall(nextX, player.radius, ALL_COLLIDERS)) {
        player.pos.x = nextX.x;
      } else {
        player.velocity.x = 0;
      }

      const nextY = { x: player.pos.x, y: player.pos.y + player.velocity.y };
      if (!isCollidingWithAnyWall(nextY, player.radius, ALL_COLLIDERS)) {
        player.pos.y = nextY.y;
      } else {
        player.velocity.y = 0;
      }

      const currentSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
      const didActuallyMove = currentSpeed > 0.1;

      if (isSprintingInput && didActuallyMove) {
        staminaRef.current = Math.max(0, staminaRef.current - dt * STAMINA_DEPLETION_RATE);
      } else {
        staminaRef.current = Math.min(STAMINA_MAX, staminaRef.current + dt * STAMINA_RECOVERY_RATE);
      }

      if (staminaRef.current <= 0) isExhaustedRef.current = true;
      else if (staminaRef.current >= STAMINA_MAX * 0.5) isExhaustedRef.current = false;

      if (didActuallyMove && gameTime - lastFootstepTimeRef.current > (isSprintingInput ? 0.22 : 0.4)) {
        playSfx(55 + Math.random() * 20, 2.0, 0.1, 'sine');
        lastFootstepTimeRef.current = gameTime;
      }

      const swingSpeed = isSprintingInput ? 16 : 10;
      const swingAmplitude = isSprintingInput ? 0.5 : 0.3;
      const swing = didActuallyMove ? Math.sin(gameTime * swingSpeed) * swingAmplitude : 0;

      if (leftLegRef.current && rightLegRef.current && leftArmRef.current && rightArmRef.current) {
        leftLegRef.current.rotation.x = THREE.MathUtils.lerp(leftLegRef.current.rotation.x, swing, 0.2);
        rightLegRef.current.rotation.x = THREE.MathUtils.lerp(rightLegRef.current.rotation.x, -swing, 0.2);
        leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, -swing, 0.2);
        
        const isMeleeing = gameTime - lastMeleeTimeRef.current < 0.3;
        const meleeSwing = isMeleeing ? Math.sin((gameTime - lastMeleeTimeRef.current) * 10) * 1.5 : 0;
        
        const isFiringStance = isMouseDownRef.current && gun.magAmmo > 0 && !gun.isReloading;
        const targetRotX = (isFiringStance ? -0.4 : -0.2) + (swing * 0.5) - recoilRef.current * 0.3 - meleeSwing;
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRotX, 0.2);
        
        if (isMeleeing) {
            rightArmRef.current.position.z = THREE.MathUtils.lerp(rightArmRef.current.position.z, 15, 0.3);
        } else {
            rightArmRef.current.position.z = THREE.MathUtils.lerp(rightArmRef.current.position.z, 0, 0.1);
        }
      }
      
      if (headRef.current && playerMeshRef.current) {
        const bob = didActuallyMove ? Math.abs(Math.abs(Math.cos(gameTime * swingSpeed))) * 1.5 : 0;
        headRef.current.position.y = THREE.MathUtils.lerp(headRef.current.position.y, 48 + bob, 0.2);
      }

      if (player.shield > 0 && gameTime - shieldPickupTimeRef.current > 10) {
        if (gameTime - lastShieldDecayTimeRef.current > SHIELD_DECAY_INTERVAL) {
          player.shield = Math.max(0, player.shield - SHIELD_DECAY_AMOUNT);
          lastShieldDecayTimeRef.current = gameTime;
        }
      }

      // --- Health Regeneration ---
      if (gameTime - lastDamageTimeRef.current > 4.0 && player.health < PLAYER_HEALTH_MAX) {
        const REGEN_RATE = 10; 
        player.health = Math.min(PLAYER_HEALTH_MAX, player.health + REGEN_RATE * dt);
      }

      // --- Critical Pulse System ---
      if (player.health <= PLAYER_HEALTH_MAX * 0.3) isCriticalRef.current = true;
      if (player.health >= PLAYER_HEALTH_MAX * 0.6) isCriticalRef.current = false;

      const targetPulseIntensity = isCriticalRef.current ? 1.0 : 0.0;
      criticalPulseIntensityRef.current = THREE.MathUtils.lerp(criticalPulseIntensityRef.current, targetPulseIntensity, dt * 2.0);

      // --- Shield Glow Logic ---
      if (shieldGlowRef.current) {
          const isShieldActive = player.shield > 0;
          shieldGlowRef.current.visible = isShieldActive;
          if (isShieldActive) {
              (shieldGlowRef.current.material as THREE.MeshStandardMaterial).opacity = 0.15 + Math.sin(gameTime * 8) * 0.05;
              shieldGlowRef.current.scale.setScalar(1 + Math.sin(gameTime * 4) * 0.02);
          }
      }

      if (player.shield <= 0 && !orb.isActive) {
        orbRespawnTimerRef.current += dt;
        if (orbRespawnTimerRef.current >= 5.0) { spawnOrb(); orbRespawnTimerRef.current = 0; }
      }

      if (orb.isActive) {
        const dist = Math.sqrt(Math.pow(player.pos.x - orb.pos.x, 2) + Math.pow(player.pos.y - orb.pos.y, 2));
        if (dist < player.radius + orb.radius) {
          player.shield = PLAYER_SHIELD_MAX;
          shieldPickupTimeRef.current = gameTime;
          lastShieldDecayTimeRef.current = gameTime;
          orb.isActive = false;
          if (orbMeshRef.current) orbMeshRef.current.visible = false;
          playSfx(880, 0.3, 0.4, 'sine');
        }
      }

      // Update Power-Ups
      const consumedPowerUps: string[] = [];
      powerUpDropsRef.current.forEach(pu => {
          const dist = Math.sqrt(Math.pow(player.pos.x - pu.pos.x, 2) + Math.pow(player.pos.y - pu.pos.y, 2));
          if (dist < player.radius + ORB_RADIUS) {
              if (pu.type === 'MAX_AMMO') {
                  triggerMaxAmmo();
              }
              consumedPowerUps.push(pu.id);
          }
          
          // Despawn after 30 seconds
          if (gameTime - pu.spawnTime > 30) {
              consumedPowerUps.push(pu.id);
          }
          
          const mesh = powerUpMeshesRef.current.get(pu.id);
          if (mesh) {
              mesh.position.y = 20 + Math.sin(gameTime * 5) * 5;
              mesh.rotation.y += dt * 1.5;
          }
      });

      if (consumedPowerUps.length > 0) {
          powerUpDropsRef.current = powerUpDropsRef.current.filter(pu => {
              if (consumedPowerUps.includes(pu.id)) {
                  const mesh = powerUpMeshesRef.current.get(pu.id);
                  if (mesh) {
                      powerUpGroupRef.current?.remove(mesh);
                      powerUpMeshesRef.current.delete(pu.id);
                  }
                  return false;
              }
              return true;
          });
      }

      // Update Zombies
      const deadZombies: string[] = [];
      const zombies = zombiesRef.current;
      
      zombies.forEach((z, zIdx) => {
        const mesh = zombieMeshesRef.current.get(z.id);
        
        if (z.isDying) {
          z.deathTimer = (z.deathTimer || 0) - dt;
          if (mesh) {
            const t = 1.0 - Math.max(0, z.deathTimer / 0.5);
            mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, Math.PI * 0.45, 0.1);
            mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, -15, 0.1);
            mesh.traverse(child => {
              if (child instanceof THREE.Mesh) {
                child.material.opacity = Math.max(0, 1.0 - t);
              }
            });
          }
          if (z.deathTimer <= 0) deadZombies.push(z.id);
          return;
        }

        const dx = player.pos.x - z.pos.x;
        const dy = player.pos.y - z.pos.y;
        const distToPlayer = Math.sqrt(dx * dx + dy * dy);
        
        z.rotation = Math.atan2(dx, dy);

        // --- Zombie Audio Variety ---
        if (!z.lastGroanTime) z.lastGroanTime = gameTime + Math.random() * 5;
        if (gameTime > z.lastGroanTime) {
            // Play audible groaned variant
            if (distToPlayer < 500) {
                playZombieSfx(Math.random() > 0.7 ? 'groan' : 'idle');
            }
            z.lastGroanTime = gameTime + 2.0 + Math.random() * 8.0;
        }

        // --- Damage Logic ---
        const minDistance = player.radius + z.radius;
        if (distToPlayer < minDistance + 10 && !z.isDying) {
            if (gameTime - lastDamageTimeRef.current > 0.6) {
                const damage = 10;
                if (player.shield > 0) {
                    player.shield = Math.max(0, player.shield - damage);
                } else {
                    player.health = Math.max(0, player.health - damage);
                }
                lastDamageTimeRef.current = gameTime;
                cameraShakeRef.current = 10;
                damageFlashRef.current = 1;
                playSfx(60, 0.8, 0.3, 'sine');

                if (player.health <= 0) {
                    setHud(h => ({ ...h, isGameOver: true }));
                    setTimeout(() => window.location.reload(), 4000); 
                }
            }
        }

        // Pathfinding Logic
        let currentPath = zombiePathsRef.current.get(z.id) || [];
        let pathTimer = zombiePathTimersRef.current.get(z.id) || 0;
        const hasLOS = hasLineOfSight(z.pos, player.pos);

        if ((!hasLOS || currentPath.length === 0) && gameTime > pathTimer) {
          const newPath = findPath(z.pos, player.pos);
          if (newPath) {
            zombiePathsRef.current.set(z.id, newPath);
            zombiePathTimersRef.current.set(z.id, gameTime + 0.5 + Math.random() * 0.5);
            currentPath = newPath;
          }
        }

        let moveTarget: Vector2D = player.pos;
        if (!hasLOS && currentPath.length > 0) {
          while (currentPath.length > 0) {
            const nextNode = currentPath[0];
            const distToNode = Math.sqrt(Math.pow(z.pos.x - nextNode.x, 2) + Math.pow(z.pos.y - nextNode.y, 2));
            if (distToNode < 25) {
              currentPath.shift();
            } else {
              moveTarget = nextNode;
              break;
            }
          }
        }

        const mdx = moveTarget.x - z.pos.x;
        const mdy = moveTarget.y - z.pos.y;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        
        const vx = mdist > 0.1 ? (mdx / mdist) * ZOMBIE_SPEED : 0;
        const vy = mdist > 0.1 ? (mdy / mdist) * ZOMBIE_SPEED : 0;

        if (distToPlayer < minDistance && distToPlayer > 0.1) {
          const overlap = minDistance - distToPlayer;
          z.pos.x -= (dx / distToPlayer) * overlap;
          z.pos.y -= (dy / distToPlayer) * overlap;
        }

        for (let i = 0; i < zombies.length; i++) {
          if (i === zIdx) continue;
          const other = zombies[i];
          if (other.isDying) continue;
          const sepDx = z.pos.x - other.pos.x;
          const sepDy = z.pos.y - other.pos.y;
          const sepDist = Math.sqrt(sepDx * sepDx + sepDy * sepDy);
          const minSep = z.radius + other.radius;
          if (sepDist < minSep && sepDist > 0.1) {
            const sepOverlap = (minSep - sepDist) * 0.5;
            const pushX = (sepDx / sepDist) * sepOverlap;
            const pushY = (sepDy / sepDist) * sepOverlap;
            z.pos.x += pushX;
            z.pos.y += pushY;
          }
        }

        if (distToPlayer > minDistance + 1) {
          const nextZx = { x: z.pos.x + vx, y: z.pos.y };
          if (!isCollidingWithAnyWall(nextZx, z.radius, ALL_COLLIDERS)) z.pos.x = nextZx.x;
          
          const nextZy = { x: z.pos.x, y: z.pos.y + vy };
          if (!isCollidingWithAnyWall(nextZy, z.radius, ALL_COLLIDERS)) z.pos.y = nextZy.y;
        }

        if (mesh) {
          mesh.position.set(z.pos.x, 0, z.pos.y);
          mesh.rotation.y = z.rotation;
          const limp = Math.sin(gameTime * 4) * 0.1;
          mesh.rotation.z = limp;
        }
      });

      const aliveProjectiles: Projectile[] = [];
      projectilesRef.current.forEach(proj => {
        proj.pos.x += proj.velocity.x;
        proj.pos.y += proj.velocity.y;
        proj.distanceTraveled += PROJECTILE_SPEED;
        let alive = true;
        if (proj.distanceTraveled > PROJECTILE_MAX_RANGE) alive = false;
        
        let activeDamage = (isShotgun ? SHOTGUN_DAMAGE : (isSMG ? SMG_DAMAGE : 15));
        if (gun.isUpgraded) activeDamage *= 2.5;

        zombiesRef.current.forEach(z => {
          if (z.isDying) return;
          const zd = Math.sqrt(Math.pow(proj.pos.x - z.pos.x, 2) + Math.pow(proj.pos.y - z.pos.y, 2));
          if (zd < z.radius + PROJECTILE_RADIUS) {
            z.health -= activeDamage;
            player.credits += POINTS_PER_HIT;
            spawnImpactEffects(proj.pos.x, proj.pos.y);
            alive = false;
            if (z.health <= 0 && !z.isDying) {
              z.isDying = true;
              z.deathTimer = 0.5;
              player.credits += 100; // Bonus for melee execution
              playZombieSfx('death');
              zombiesRemainingInRoundRef.current = Math.max(0, zombiesRemainingInRoundRef.current - 1);
              
              // Drop Max Ammo powerup with low chance
              if (Math.random() < MAX_AMMO_DROP_CHANCE) {
                dropMaxAmmo(z.pos);
              }
            }
          }
        });

        if (isCollidingWithAnyWall(proj.pos, PROJECTILE_RADIUS, ALL_COLLIDERS)) {
          spawnImpactEffects(proj.pos.x, proj.pos.y);
          alive = false;
        }
        if (alive) aliveProjectiles.push(proj);
        else {
          const mesh = projectileMeshesRef.current.get(proj.id);
          if (mesh && projectileGroupRef.current) {
            projectileGroupRef.current.remove(mesh);
            projectileMeshesRef.current.delete(proj.id);
          }
        }
      });
      projectilesRef.current = aliveProjectiles;

      if (deadZombies.length > 0) {
        zombiesRef.current = zombiesRef.current.filter(z => {
          if (deadZombies.includes(z.id)) {
            const mesh = zombieMeshesRef.current.get(z.id);
            if (mesh) {
              zombieGroupRef.current?.remove(mesh);
              zombieMeshesRef.current.delete(z.id);
            }
            zombiePathsRef.current.delete(z.id);
            zombiePathTimersRef.current.delete(z.id);
            return false;
          }
          return true;
        });
      }

      projectilesRef.current.forEach(proj => {
        let mesh = projectileMeshesRef.current.get(proj.id);
        if (!mesh && projectileGroupRef.current) {
          mesh = new THREE.Mesh(
            new THREE.SphereGeometry(PROJECTILE_RADIUS, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 10 })
          );
          mesh.add(new THREE.PointLight(0x22d3ee, 5000, 50));
          projectileGroupRef.current.add(mesh);
          projectileMeshesRef.current.set(proj.id, mesh);
        }
        if (mesh) mesh.position.set(proj.pos.x, 30, proj.pos.y);
      });

      const aliveParticles: ImpactParticle[] = [];
      impactParticlesRef.current.forEach(p => {
        p.life += dt;
        p.velocity.y -= 25 * dt; 
        p.mesh.position.add(p.velocity.clone().multiplyScalar(dt * 10));
        const opacity = Math.max(0, 1 - (p.life / p.maxLife));
        const mat = p.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = opacity;
        p.mesh.scale.setScalar(opacity);
        if (p.life < p.maxLife) aliveParticles.push(p);
        else {
          particleGroupRef.current?.remove(p.mesh);
          p.mesh.geometry.dispose();
          mat.dispose();
        }
      });
      impactParticlesRef.current = aliveParticles;

      let lastZombieScreenPos = null;
      if (zombiesRemainingInRoundRef.current === 1 && zombiesRef.current.length === 1 && cameraRef.current) {
        const z = zombiesRef.current[0];
        const vector = new THREE.Vector3(z.pos.x, 60, z.pos.y); 
        vector.project(cameraRef.current);
        let x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        let y = (-(vector.y * 0.5) + 0.5) * window.innerHeight;
        const margin = 50;
        const isOffScreen = vector.z > 1 || vector.x < -1 || vector.x > 1 || vector.y < -1 || vector.y > 1;
        if (isOffScreen) {
          if (vector.z > 1) { x = window.innerWidth - x; y = window.innerHeight - y; }
          x = Math.min(Math.max(x, margin), window.innerWidth - margin);
          y = Math.min(Math.max(y, margin), window.innerHeight - margin);
        }
        lastZombieScreenPos = { x, y };
      }

      const pulse = (Math.sin(gameTime * 8) + 1) / 2;
      const finalDamageOpacity = Math.max(damageFlashRef.current, pulse * 0.5 * criticalPulseIntensityRef.current);

      setHud({
        stamina: staminaRef.current,
        shield: player.shield,
        health: player.health,
        credits: player.credits,
        round: roundNumberRef.current,
        isExhausted: isExhaustedRef.current,
        ammoMag: gun.magAmmo,
        ammoReserve: gun.reserveAmmo,
        ammoBackup: gun.backupReserve,
        isReloading: gun.isReloading,
        reloadProgress: gun.reloadTimer / activeReloadTime,
        isIntermission: zombiesRemainingInRoundRef.current <= 0 && zombiesRef.current.length === 0,
        lastZombieScreenPos,
        isGameOver: player.health <= 0,
        reticleScreenPos: currentReticleScreenPos,
        recoil: recoilRef.current,
        damageOverlayOpacity: finalDamageOpacity,
        isNearShotgun,
        isNearSmg,
        isNearUpgrade,
        activeWeaponName: gun.name
      });
    }

    if (hud.isGameOver && playerMeshRef.current) {
        playerMeshRef.current.rotation.x = THREE.MathUtils.lerp(playerMeshRef.current.rotation.x, Math.PI * 0.45, 0.05);
        playerMeshRef.current.position.y = THREE.MathUtils.lerp(playerMeshRef.current.position.y, -15, 0.05);
    }

    if (playerMeshRef.current && !hud.isGameOver) {
      playerMeshRef.current.position.set(playerStateRef.current.pos.x, 0, playerStateRef.current.pos.y);
      playerMeshRef.current.rotation.y = playerStateRef.current.rotation;
    }
    if (orbMeshRef.current && orbStateRef.current.isActive) {
      orbMeshRef.current.position.y = 20 + Math.sin(gameTimeRef.current * 5) * 5;
      orbMeshRef.current.rotation.y += dt * 1.5;
    }
    if (cameraRef.current && playerMeshRef.current) {
      const shakeX = (Math.random() - 0.5) * cameraShakeRef.current;
      const shakeY = (Math.random() - 0.5) * cameraShakeRef.current;
      const shakeZ = (Math.random() - 0.5) * cameraShakeRef.current;
      const offset = new THREE.Vector3(280 + shakeX, 280 + shakeY, 280 + shakeZ);
      cameraRef.current.position.copy(playerMeshRef.current.position).add(offset);
      cameraRef.current.lookAt(playerMeshRef.current.position);
    }
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
    requestRef.current = requestAnimationFrame(update);
  }, [hud.isGameOver, ALL_COLLIDERS, dropMaxAmmo, triggerMaxAmmo]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  // Fix: Define weapon type flags in the render scope so they are available in the JSX below.
  const isShotgunHUD = hud.activeWeaponName.includes(SHOTGUN_NAME) || hud.activeWeaponName === "SOLAR ERUPTION";
  const isSMGHUD = hud.activeWeaponName.includes(SMG_NAME) || hud.activeWeaponName === "TESLA STORM";

  const staminaPercent = (hud.stamina / STAMINA_MAX) * 100;
  const healthPercent = (hud.health / PLAYER_HEALTH_MAX) * 100;
  const shieldPercent = (hud.shield / PLAYER_SHIELD_MAX) * 100;
  const staminaColor = hud.isExhausted ? 'rgba(127,29,29,0.5)' : `hsl(${staminaPercent * 1.2}, 80%, 50%)`;

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 cursor-none">
      <div 
        ref={containerRef} 
        className="w-full h-full" 
        style={{ filter: 'contrast(1.1) brightness(1.0) saturate(1.1) hue-rotate(-2deg)', pointerEvents: 'auto' }} 
      />
      
      {/* Dynamic Reticle */}
      {!hud.isGameOver && !isPaused && hud.reticleScreenPos && (
        <div 
          className="absolute pointer-events-none z-[150]"
          style={{ 
            left: hud.reticleScreenPos.x, 
            top: hud.reticleScreenPos.y,
            transform: `translate(-50%, -50%) scale(${1 + hud.recoil})`
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="24" y1="8" x2="24" y2="16" stroke={hud.ammoMag < 5 ? "#ef4444" : "#22d3ee"} strokeWidth="2" strokeLinecap="round" className={hud.ammoMag < 5 ? "animate-pulse" : ""} />
            <line x1="24" y1="32" x2="24" y2="40" stroke={hud.ammoMag < 5 ? "#ef4444" : "#22d3ee"} strokeWidth="2" strokeLinecap="round" className={hud.ammoMag < 5 ? "animate-pulse" : ""} />
            <line x1="8" y1="24" x2="16" y2="24" stroke={hud.ammoMag < 5 ? "#ef4444" : "#22d3ee"} strokeWidth="2" strokeLinecap="round" className={hud.ammoMag < 5 ? "animate-pulse" : ""} />
            <line x1="32" y1="24" x2="40" y2="24" stroke={hud.ammoMag < 5 ? "#ef4444" : "#22d3ee"} strokeWidth="2" strokeLinecap="round" className={hud.ammoMag < 5 ? "animate-pulse" : ""} />
            <circle cx="24" cy="24" r="2" fill={hud.isReloading ? "#94a3b8" : (hud.ammoMag === 0 ? "#ef4444" : "#22d3ee")} />
            {hud.isReloading && (
                <circle cx="24" cy="24" r="18" stroke="#ffffff20" strokeWidth="2" fill="none" />
            )}
            {hud.isReloading && (
                <circle cx="24" cy="24" r="18" stroke="#22d3ee" strokeWidth="2" fill="none" strokeDasharray={`${hud.reloadProgress * 113} 113`} transform="rotate(-90 24 24)" />
            )}
            {hud.ammoMag < 5 && !hud.isReloading && (
                <text x="24" y="56" textAnchor="middle" fill="#ef4444" fontSize="8" fontWeight="bold" className="uppercase font-mono tracking-tighter animate-pulse">
                    {hud.ammoMag === 0 ? "AMMO_DEPLETED" : "LOW_RESERVE"}
                </text>
            )}
          </svg>
        </div>
      )}

      {/* Wall Buy Interaction Overlays */}
      {(hud.isNearShotgun || hud.isNearSmg || hud.isNearUpgrade) && !hud.isGameOver && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-32 z-[160] text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className={`bg-slate-900/90 backdrop-blur-md border ${hud.isNearUpgrade ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : (hud.isNearSmg ? 'border-purple-500/50' : 'border-red-500/50')} p-4 rounded shadow-2xl`}>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    {hud.isNearUpgrade ? 'Augmentation Terminal' : 'Combat Terminal'}
                  </div>
                  <div className="text-xl font-black italic text-white mb-2 uppercase tracking-tighter">
                      {hud.isNearUpgrade ? 'Upgrade Weapon' : (hud.isNearSmg ? SMG_NAME : SHOTGUN_NAME)} 
                      <span className={`${(hud.isNearSmg && !hud.isNearUpgrade) ? 'text-purple-500' : 'text-red-500'} ml-2`}>
                        {hud.isNearUpgrade ? UPGRADE_COST : (hud.isNearSmg ? SMG_COST : SHOTGUN_COST)}₵
                      </span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                      <span className="bg-white text-black text-xs font-black px-2 py-0.5 rounded leading-none">E</span>
                      <span className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Authorize Action</span>
                  </div>
              </div>
          </div>
      )}

      {/* Damage & Critical Health Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none z-[100]"
        style={{ 
          backgroundColor: 'rgba(239, 68, 68, 0.4)', 
          opacity: hud.damageOverlayOpacity, 
          mixBlendMode: 'overlay',
          transition: 'opacity 0.05s ease-out'
        }} 
      />

      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.5) 100%)', mixBlendMode: 'multiply' }} />

      {/* Floating Skull Indicator */}
      {hud.lastZombieScreenPos && (
        <div className="absolute pointer-events-none z-[60] flex flex-col items-center justify-center animate-bounce" style={{ left: hud.lastZombieScreenPos.x, top: hud.lastZombieScreenPos.y, transform: 'translate(-50%, -100%)' }}>
          <div className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M12 2.25c-4.142 0-7.5 3.358-7.5 7.5 0 2.227.967 4.228 2.5 5.601v3.399c0 .828.672 1.5 1.5 1.5h7c.828 0 1.5-.672 1.5-1.5v-3.399c1.533-1.373 2.5-3.374 2.5-5.601 0-4.142-3.358-7.5-7.5-7.5ZM9 9.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM12 14.25a3.75 3.75 0 0 0-3.75-3.75.75.75 0 0 1 0-1.5 5.25 5.25 0 0 1 5.25 5.25.75.75 0 1 1-1.5 0Z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="bg-red-900/80 text-[8px] font-black px-1 rounded border border-red-500 text-white mt-1 uppercase tracking-tighter">TARGET_LOCKED</div>
        </div>
      )}

      {/* Game Over Screen */}
      {hud.isGameOver && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-1000">
            <div className="text-center">
                <h1 className="text-7xl font-black italic tracking-tighter text-red-600 mb-2 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]">MISSION_FAILURE</h1>
                <p className="text-xl font-mono tracking-[0.4em] text-white/50 uppercase">Vanguard Assets Lost</p>
                <div className="mt-8 h-1 w-64 bg-red-600 mx-auto animate-pulse" />
            </div>
        </div>
      )}

      {!isPaused && (
        <>
          <div className="absolute top-6 left-6 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md p-4 rounded-lg border border-slate-700 text-white shadow-2xl w-64">
              <h1 className="text-xl font-black italic tracking-tighter mb-1 bg-gradient-to-r from-indigo-400 to-blue-500 bg-clip-text text-transparent uppercase">VANGUARD_INTEL</h1>
              <div className="mt-4 space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Vital Integrity</span>
                    <span className="text-[10px] font-mono text-blue-400">{Math.ceil(hud.health)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${healthPercent}%` }} />
                  </div>
                </div>
                <div className={`space-y-1 transition-all duration-500 ${hud.shield > 0 ? 'opacity-100' : 'opacity-30'}`}>
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Aegis Layer</span>
                    <span className="text-[10px] font-mono text-cyan-400">{Math.ceil(hud.shield)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-300 ease-out" style={{ width: `${shieldPercent}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Biometric Stamina</span>
                    <span className={`text-[10px] font-mono ${hud.isExhausted ? 'text-red-500' : 'text-blue-400'}`}>{Math.ceil(staminaPercent)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full transition-all duration-300 ease-out" style={{ width: `${staminaPercent}%`, backgroundColor: staminaColor }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 left-6 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md px-6 py-4 rounded-lg border border-slate-700 text-white shadow-2xl flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Encounter Wave</span>
                <span className="text-5xl font-black italic text-red-500 tabular-nums leading-none">{hud.round.toString().padStart(2, '0')}</span>
              </div>
              <div className="h-10 w-px bg-slate-800" />
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Sector Status</span>
                <span className={`text-[10px] font-black uppercase transition-all duration-300 ${hud.isIntermission ? 'text-amber-400' : 'text-emerald-400 animate-pulse'}`}>
                  {hud.isIntermission ? 'Intermission' : 'Wave Active'}
                </span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-lg border border-slate-700 text-white shadow-2xl flex flex-col items-end min-w-[240px]">
              <div className="w-full mb-6 pb-4 border-b border-slate-800 flex flex-col items-end">
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Combat Credits</div>
                <div className="text-3xl font-black tabular-nums text-emerald-400 tracking-tight">
                  <span className="text-sm mr-1 opacity-50">₵</span>{hud.credits.toLocaleString()}
                </div>
              </div>
              
              <div className="w-full flex justify-between items-end mb-1">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Active Weapon</div>
                  <div className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">[Q] SWAP</div>
              </div>
              
              <div className={`text-2xl font-black italic tracking-tighter uppercase leading-none mb-4 ${isShotgunHUD ? 'text-red-500' : (isSMGHUD ? 'text-purple-400' : 'text-blue-400')}`}>
                  {hud.activeWeaponName}
              </div>
              
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl font-black tabular-nums transition-colors ${hud.ammoMag < (isShotgunHUD ? 2 : 5) ? 'text-red-500 animate-pulse' : 'text-white'}`}>{hud.isReloading ? '--' : hud.ammoMag}</span>
                <span className="text-xl font-bold text-slate-500">/</span>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-2xl font-bold text-slate-400 tabular-nums">{hud.ammoReserve}</span>
                  {hud.ammoBackup > 0 && (
                    <span className="text-[10px] font-black text-indigo-400 mt-1 uppercase tracking-wider">Backup: {hud.ammoBackup}</span>
                  )}
                </div>
              </div>
              
              {hud.isReloading && (
                <div className="w-full mt-4 space-y-1">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-blue-400">
                    <span>SYNCHRONIZING...</span>
                    <span>{Math.floor(hud.reloadProgress * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-blue-500" style={{ width: `${hud.reloadProgress * 100}%` }} />
                  </div>
                </div>
              )}
              
              {weaponsRef.current.length > 1 && (
                  <div className="w-full mt-4 pt-4 border-t border-slate-800/50">
                      <div className="flex items-center gap-2 opacity-40">
                          <div className={`w-1.5 h-1.5 rounded-full ${activeWeaponIdxRef.current === 0 ? 'bg-blue-500 scale-125' : 'bg-slate-700'}`} />
                          <div className={`w-1.5 h-1.5 rounded-full ${activeWeaponIdxRef.current === 1 ? 'bg-red-500 scale-125' : 'bg-slate-700'}`} />
                          <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest ml-1">Holstered: {weaponsRef.current[activeWeaponIdxRef.current === 0 ? 1 : 0].name}</span>
                      </div>
                  </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GameCanvas;