
import { Wall } from './types';

export const WORLD_SIZE = 2000;
export const PLAYER_SPEED = 1.8; 
export const SPRINT_SPEED = 3.2; 
export const STAMINA_MAX = 5.0; 
export const STAMINA_DEPLETION_RATE = 2.5; // Deplete 2.5x faster
export const STAMINA_RECOVERY_RATE = 0.4;  // Recover at 40% speed
export const PLAYER_HEALTH_MAX = 100;
export const PLAYER_SHIELD_MAX = 100;
export const PLAYER_RADIUS = 20;
export const ORB_RADIUS = 15;
export const SHIELD_DECAY_INTERVAL = 3.0; // Seconds
export const SHIELD_DECAY_AMOUNT = 5.0; // Percent
export const COLLISION_PADDING = 1;

// Horde System
export const ZOMBIES_PER_ROUND_MULTIPLIER = 5;
export const ROUND_INTERMISSION_TIME = 4.0; // Seconds between rounds

// Combat Economy
export const INITIAL_CREDITS = 500;
export const POINTS_PER_HIT = 10;

// Zombie Constants
export const ZOMBIE_SPEED = 0.8;
export const ZOMBIE_RADIUS = 20;
export const ZOMBIE_HEALTH_MAX = 30;
export const ZOMBIE_SPAWN_INTERVAL = 2.5;
export const MAX_ZOMBIES = 40;
export const MAX_AMMO_DROP_CHANCE = 0.03; // 3% chance to drop from a zombie

// Gun Constants
export const GUN_NAME = "NEUTRON VANGUARD";
export const MAG_SIZE = 8;
export const INITIAL_RESERVE = 96;
export const FIRE_RATE = 0.12; // Seconds between shots
export const RELOAD_TIME = 1.2; // Seconds (faster reload)
export const PROJECTILE_SPEED = 18;
export const PROJECTILE_MAX_RANGE = 1000;
export const PROJECTILE_RADIUS = 4;

const WALL_COLOR = '#374151';
// Exporting THICK to resolve "Cannot find name 'THICK'" errors in GameCanvas.tsx
export const THICK = 40;

export const INITIAL_WALLS: Wall[] = [
  // --- Outer Perimeter ---
  { x: 0, y: 0, width: WORLD_SIZE, height: THICK, color: WALL_COLOR, roomType: 'HUB' }, 
  { x: 0, y: WORLD_SIZE - THICK, width: WORLD_SIZE, height: THICK, color: WALL_COLOR, roomType: 'HUB' }, 
  { x: 0, y: THICK, width: THICK, height: WORLD_SIZE - THICK * 2, color: WALL_COLOR, roomType: 'HUB' }, 
  { x: WORLD_SIZE - THICK, y: THICK, width: THICK, height: WORLD_SIZE - THICK * 2, color: WALL_COLOR, roomType: 'HUB' }, 
  
  // --- Central Hub (700-1300 block) ---
  { x: 700, y: 700, width: 200, height: THICK, color: WALL_COLOR, roomType: 'HUB' }, 
  { x: 1100, y: 700, width: 200, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 700, y: 1260, width: 200, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1100, y: 1260, width: 200, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 700, y: 740, width: THICK, height: 160, color: WALL_COLOR, roomType: 'HUB' },
  { x: 700, y: 1100, width: THICK, height: 160, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1260, y: 740, width: THICK, height: 160, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1260, y: 1100, width: THICK, height: 160, color: WALL_COLOR, roomType: 'HUB' },

  // --- Axial Corridors with Lateral Doorways ---
  
  // North Corridor (Opened to NW and NE Quadrants)
  { x: 900, y: 400, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HUB' },
  { x: 900, y: 620, width: THICK, height: 80, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1060, y: 400, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1060, y: 620, width: THICK, height: 80, color: WALL_COLOR, roomType: 'HUB' },

  // South Corridor (Opened to SW and SE Quadrants)
  { x: 900, y: 1260, width: THICK, height: 80, color: WALL_COLOR, roomType: 'HUB' },
  { x: 900, y: 1460, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1060, y: 1260, width: THICK, height: 80, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1060, y: 1460, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HUB' },

  // West Corridor (Opened to NW and SW Quadrants)
  { x: 400, y: 900, width: 100, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 620, y: 900, width: 80, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 400, y: 1060, width: 100, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 620, y: 1060, width: 80, height: THICK, color: WALL_COLOR, roomType: 'HUB' },

  // East Corridor (Opened to NE and SE Quadrants)
  { x: 1260, y: 900, width: 80, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1460, y: 900, width: 100, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1260, y: 1060, width: 80, height: THICK, color: WALL_COLOR, roomType: 'HUB' },
  { x: 1460, y: 1060, width: 100, height: THICK, color: WALL_COLOR, roomType: 'HUB' },

  // --- Engineering (North Sector) ---
  { x: 400, y: 40, width: THICK, height: 100, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 400, y: 300, width: THICK, height: 100, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 1560, y: 40, width: THICK, height: 100, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 1560, y: 300, width: THICK, height: 100, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 400, y: 400, width: 500, height: THICK, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 1100, y: 400, width: 500, height: THICK, color: WALL_COLOR, roomType: 'ENGINEERING' },
  { x: 800, y: 120, width: 400, height: 80, color: WALL_COLOR, roomType: 'ENGINEERING' },

  // --- Hangar (South Sector) ---
  { x: 400, y: 1600, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 400, y: 1860, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 1560, y: 1600, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 1560, y: 1860, width: THICK, height: 100, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 400, y: 1560, width: 500, height: THICK, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 1100, y: 1560, width: 500, height: THICK, color: WALL_COLOR, roomType: 'HANGAR' },
  { x: 600, y: 1750, width: 100, height: 100, color: WALL_COLOR, roomType: 'HANGAR' },

  // --- Cargo (West Sector) ---
  { x: 40, y: 400, width: 100, height: THICK, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 300, y: 400, width: 100, height: THICK, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 40, y: 1560, width: 100, height: THICK, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 300, y: 1560, width: 100, height: THICK, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 400, y: 400, width: THICK, height: 500, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 400, y: 1100, width: THICK, height: 500, color: WALL_COLOR, roomType: 'CARGO' },
  { x: 200, y: 850, width: 80, height: 300, color: WALL_COLOR, roomType: 'CARGO' },

  // --- Medbay (East Sector) ---
  { x: 1600, y: 400, width: 100, height: THICK, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1860, y: 400, width: 100, height: THICK, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1600, y: 1560, width: 100, height: THICK, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1860, y: 1560, width: 100, height: THICK, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1560, y: 400, width: THICK, height: 500, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1560, y: 1100, width: THICK, height: 500, color: WALL_COLOR, roomType: 'MEDBAY' },
  { x: 1700, y: 950, width: 100, height: 100, color: WALL_COLOR, roomType: 'MEDBAY' },

  // --- Corner Rooms ---
  { x: 40, y: 40, width: 360, height: THICK, color: WALL_COLOR, roomType: 'HYDRO' },
  { x: 40, y: 80, width: THICK, height: 320, color: WALL_COLOR, roomType: 'HYDRO' },
  { x: 1600, y: 40, width: 360, height: THICK, color: WALL_COLOR, roomType: 'SECURITY' },
  { x: 1920, y: 80, width: THICK, height: 320, color: WALL_COLOR, roomType: 'SECURITY' },
  { x: 40, y: 1920, width: 360, height: THICK, color: WALL_COLOR, roomType: 'LIFE' },
  { x: 40, y: 1560, width: THICK, height: 360, color: WALL_COLOR, roomType: 'LIFE' },
  { x: 1600, y: 1920, width: 360, height: THICK, color: WALL_COLOR, roomType: 'CRYO' },
  { x: 1920, y: 1560, width: THICK, height: 360, color: WALL_COLOR, roomType: 'CRYO' },
];
