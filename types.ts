export interface Vector2D {
  x: number;
  y: number;
}

export interface PlayerState {
  pos: Vector2D;
  velocity: Vector2D;
  rotation: number;
  radius: number;
  health: number;
  shield: number;
  credits: number;
}

export interface Zombie {
  id: string;
  pos: Vector2D;
  health: number;
  rotation: number;
  radius: number;
  isDying?: boolean;
  deathTimer?: number;
  lastGroanTime?: number;
}

export interface GunState {
  name: string;
  magAmmo: number;
  magSize: number;
  reserveAmmo: number;
  backupReserve: number;
  isReloading: boolean;
  reloadTimer: number;
  lastFireTime: number;
  isUpgraded?: boolean;
}

export interface Projectile {
  id: string;
  pos: Vector2D;
  velocity: Vector2D;
  distanceTraveled: number;
}

export interface OrbState {
  pos: Vector2D;
  radius: number;
  isActive: boolean;
}

export interface Wall {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  roomType?: 'HUB' | 'ENGINEERING' | 'HANGAR' | 'CARGO' | 'MEDBAY' | 'HYDRO' | 'SECURITY' | 'LIFE' | 'CRYO';
}

export interface GameState {
  player: PlayerState;
  walls: Wall[];
  camera: Vector2D;
}

export type InputMap = Record<string, boolean>;