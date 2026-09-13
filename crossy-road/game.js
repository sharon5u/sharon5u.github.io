// ─────────────────────────────────────────────
//  PENGUIN HOP! — Cute + slightly-3D edition
// ─────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');

// ── Canvas & grid ─────────────────────────────
const TILE = 64;
const COLS = 13;
const ROWS = 9;
const W    = TILE * COLS;  // 832
const H    = TILE * ROWS;  // 576
canvas.width  = W;
canvas.height = H;

// ── "Slightly 3D" constants ───────────────────
const BLOCK_FACE  = 14;

// ─────────────────────────────────────────────
//  THEMES
// ─────────────────────────────────────────────
const THEMES = {
  default: {
    key        : 'default',
    name       : 'Classic Meadow',
    // sky gradient stops
    sky        : ['#aed6f5', '#dff0fd'],
    // safe ground (normal / alt row)
    safeA      : '#6abf4b',
    safeB      : '#5cb040',
    // water
    waterA     : '#3a9fc0',
    waterB     : '#3390b0',
    // road
    roadA      : '#555f6e',
    roadB      : '#4a5363',
    roadLine   : '#f4c430',
    // floating platform on water
    floatColor : '#b8dff0',  // ice floe / lily pad
    floatPatch : 'rgba(255,255,255,0.65)',
    // decorations on safe tiles
    decType    : 'tree',     // 'tree' | 'snowblock' | 'cactus' | 'umbrella' | 'rock' | 'snowman'
    decType2   : 'rock',      // secondary decoration mixed in for variety
    treeLeaf   : ['#4CAF50','#388E3C','#2E7D32'],
    treeTrunk  : '#795548',
    // no blocking/lethal obstacle in this theme
    obstacleType: null,
    // hop particle colors
    particles  : ['#fff','#a8e6a0','#c8f0b8','#ffe4b8'],
  },

  winter: {
    key        : 'winter',
    name       : 'Winter Snow',
    sky        : ['#c8e0f4', '#eaf4fd'],
    safeA      : '#d5eef8',
    safeB      : '#c0e4f3',
    waterA     : '#5ba8cc',
    waterB     : '#4f99bc',
    roadA      : '#7a8fa0',
    roadB      : '#6a7f8e',
    roadLine   : '#ffffffcc',
    floatColor : '#daeef8',
    floatPatch : 'rgba(255,255,255,0.8)',
    decType    : 'snowblock',
    decType2   : 'snowman',
    treeLeaf   : ['#d5eef8','#c0e4f3','#aad8ef'],  // snowy fir tones
    treeTrunk  : '#8d6e63',
    obstacleType: 'snowball',
    obstacleChance: 0.6,   // appears more often than the other themes
    particles  : ['#fff','#d5eef8','#b0d8f0','#e8f8ff'],
  },

  beach: {
    key        : 'beach',
    name       : 'The Beach',
    sky        : ['#87ceeb', '#ffe4a0'],
    safeA      : '#f0d080',
    safeB      : '#e8c870',
    waterA     : '#29b6d4',
    waterB     : '#1ea8c5',
    roadA      : '#c4a96a',
    roadB      : '#b89858',
    roadLine   : '#fffde0cc',
    floatColor : '#ffe0a0',  // driftwood / raft color
    floatPatch : 'rgba(255,255,255,0.5)',
    decType    : 'umbrella',
    decType2   : 'tree',      // palm tree, using the palette below
    treeLeaf   : ['#5dbf5d','#4aab4a','#3d9e3d'],  // palm frond greens
    treeTrunk  : '#a0785a',
    // no blocking/lethal obstacle in this theme
    obstacleType: null,
    particles  : ['#fff','#ffe4a0','#ffd580','#b2ebf2'],
  },

  desert: {
    key        : 'desert',
    name       : 'Rocky Desert',
    sky        : ['#f5c97a', '#ffe0a0'],
    safeA      : '#c8956a',
    safeB      : '#b8845c',
    waterA     : '#3a9fc0',  // kept blue, like the other themes' water
    waterB     : '#3390b0',
    roadA      : '#8c6a4a',
    roadB      : '#7a5c3e',
    roadLine   : '#ffe0a0cc',
    floatColor : '#c8a070',  // stepping stones
    floatPatch : 'rgba(255,220,160,0.6)',
    decType    : 'cactus',
    decType2   : 'rock',
    treeLeaf   : ['#6aaa50','#5a9a42','#4e8a38'],  // cactus greens
    treeTrunk  : '#8c6a4a',
    // tumbleweed is a hazard here, not a wall — touching it kills the
    // penguin instead of just blocking the hop.
    obstacleType: 'tumbleweed',
    obstacleLethal: true,
    particles  : ['#fff','#ffe0a0','#f5c97a','#d4956a'],
  },

  space: {
    key        : 'space',
    name       : 'Jumpy Space',
    sky        : ['#0a0e2e', '#241b4d'],
    safeA      : '#8f8ab0',  // moon regolith
    safeB      : '#7f7aa0',
    // "water" here is the open void between platforms
    waterA     : '#150f35',
    waterB     : '#100b29',
    roadA      : '#2e2a52',  // flight corridor
    roadB      : '#262247',
    roadLine   : '#7de8ffcc',
    floatColor : '#9a97a8',  // drifting asteroid chunk
    floatPatch : 'rgba(255,255,255,0.35)',
    decType    : 'satellite',
    decType2   : 'crater',
    treeLeaf   : ['#b8b4ff','#9d97e8','#8177d0'],
    treeTrunk  : '#4a4470',
    // no per-lane wall/hazard obstacle — the asteroid-bomb system (see
    // ASTEROID BOMBS below) is this theme's dedicated hazard instead.
    obstacleType: null,
    // weightless hop feel: a higher, slower arc than every other theme
    hopDuration : 620,
    hopArcHeight: 72,
    hopFloaty   : true,   // shapes the arc for extra hang-time at the peak
    hopFloatPow : 0.4,    // lower = flatter top = longer hang (see drawPlayer)
    particles  : ['#fff','#bcd4ff','#8fd8ff','#d9c2ff'],
  },
};

let activeTheme = THEMES.default;

// ── Game state ────────────────────────────────
let gameState   = 'start';
let score       = 0;
let highScore   = 0;
let coins       = 0;
let highCoins   = 0;
let deathReason = '';

// ── World ─────────────────────────────────────
let lanes         = [];
let cameraY       = 0;       // world-space Y of top of screen (pixels)
let targetCameraY = 0;

// ── Asteroid bombs (space theme only) ─────────
// Each: { row, col, state:'warning'|'impact', spawnTime, warnDuration,
//         impactDuration, seed, killChecked }. A warning shadow telegraphs
// the target tile, then the rock actually falls and impact is checked once
// against the player's current tile — instant death on contact.
let asteroids          = [];
let nextAsteroidSpawn  = 0;

// ── Player ────────────────────────────────────
const PLAYER_START_ROW = 2;

const player = {
  gridX      : Math.floor(COLS / 2),
  worldRow   : 0,
  px         : 0,
  py         : 0,
  targetPx   : 0,
  targetPy   : 0,
  hopping    : false,
  hopProgress: 0,
  hopDuration: 130,
  hopStartTime: 0,
  facingDir  : 'up',
  squished   : false,
  drowned    : false,
  onLog      : null,
  liftFrom   : 0,   // stand-height offset at the start of the current hop
  liftTo     : 0,   // stand-height offset at the end of the current hop
  bumping    : false, // true briefly when a hop is blocked by an obstacle
  bumpDir    : null,
  bumpStartTime: 0,
};

// ── Input ─────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  if (keys[e.code]) return;
  keys[e.code] = true;
  handleKey(e.code);
});
document.addEventListener('keyup', e => { keys[e.code] = false; });

let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) > Math.abs(dy)) handleKey(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
  else                             handleKey(dy < 0 ? 'ArrowUp'    : 'ArrowDown');
  e.preventDefault();
}, { passive: false });

function handleKey(code) {
  if (gameState === 'start') { startGame(); return; }
  if (gameState === 'dead')  return;
  if (player.hopping)        return;
  const map = {
    ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
    ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
  };
  const dir = map[code];
  if (dir) movePlayer(dir);
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// ─────────────────────────────────────────────
//  LANE GENERATION
// ─────────────────────────────────────────────
// Each lane gets its own visual "chunkiness" and a gentle wobble along its
// near edge, so lanes read as thick 3D blocks instead of thin flat strips,
// and no two lanes look perfectly identical or perfectly straight.
// frontH must stay >= (TILE - ISO_DY) so adjacent lanes always overlap with
// zero gap between them (TILE=64, ISO_DY=20 -> minimum 44).
function randomLaneGeometry() {
  return {
    frontH   : 44 + Math.random() * 18,        // 44–62px thick front face
    waveAmp  : 3 + Math.random() * 5,          // 3–8px wobble on the near edge
    waveFreq : 0.010 + Math.random() * 0.012,  // wobble wavelength across the lane
    waveSeed : Math.random() * 1000,
  };
}

function createLane(row) {
  if (row <= 1)      return makeSafeLane(row);
  if (row % 5 === 0) return makeSafeLane(row);
  const r = Math.random();
  if (r < 0.38) return makeRoadLane(row);
  if (r < 0.65) return makeWaterLane(row);
  return makeSafeLane(row);
}

function makeSafeLane(row) {
  const isIcy = row > 10;
  const decorations = generateDecorations(isIcy);
  const avoidCols = new Set(decorations.map(d => d.col));
  const coinsHere = generateCoins(avoidCols);
  for (const c of coinsHere) avoidCols.add(c.col);
  // No obstacle on the very first row — the tile the penguin starts on.
  const obstacles = row > 0 ? generateObstacles(avoidCols) : [];
  return { type:'safe', row, isIcy, decorations, coins: coinsHere, obstacles, vehicles:[], logs:[], ...randomLaneGeometry() };
}

function makeRoadLane(row) {
  const speed   = (0.028 + Math.random() * 0.037) * (Math.random() < 0.5 ? 1 : -1);
  const gap     = 3.5 + Math.random() * 2;
  const carType = Math.random() < 0.5 ? 'car' : 'truck';
  const vehicles = [];
  let x = Math.random() * COLS;
  while (x < COLS + 6) {
    vehicles.push({ x, speed, type: carType, color: randomCarColor(), hubColor: randomHubColor() });
    x += gap + (carType === 'truck' ? 2.8 : 2.0);
  }
  return { type:'road', row, speed, vehicles, logs:[], decorations:[], coins: generateCoins(), obstacles:[], ...randomLaneGeometry() };
}

// A coin, sometimes, on a safe or road tile — never on water. Kept sparse
// (well under half of lanes) so finding one still feels like a pickup, and
// steered away from any column a decoration already occupies.
function generateCoins(avoidCols) {
  const coinsHere = [];
  if (Math.random() < 0.35) {
    let col, tries = 0;
    do { col = Math.floor(Math.random() * COLS); tries++; }
    while (avoidCols && avoidCols.has(col) && tries < 10);
    coinsHere.push({ col, taken: false, seed: Math.random() * 1000 });
  }
  return coinsHere;
}

// A theme-specific obstacle on safe tiles. Most themes make it a wall the
// penguin has to go around rather than a hazard that kills it; a theme can
// opt into `obstacleLethal` instead (see desert's tumbleweed) so touching it
// kills the penguin like any other hazard. Not every theme has one at all.
// One per lane at most, and only sometimes, so there's always a way through.
// Tumbleweed rolls across the lane instead of sitting still, like the
// theme's other moving hazards.
function generateObstacles(avoidCols) {
  const obstacles = [];
  const obType = activeTheme.obstacleType;
  if (!obType) return obstacles;
  const chance = activeTheme.obstacleChance != null ? activeTheme.obstacleChance : 0.4;
  if (Math.random() < chance) {
    const lethal = !!activeTheme.obstacleLethal;
    if (obType === 'tumbleweed') {
      const speed = (0.014 + Math.random() * 0.012) * (Math.random() < 0.5 ? 1 : -1);
      obstacles.push({ type: obType, moving: true, x: Math.random() * COLS, speed, seed: Math.random() * 1000, lethal });
    } else {
      let col, tries = 0;
      do { col = Math.floor(Math.random() * COLS); tries++; }
      while (avoidCols && avoidCols.has(col) && tries < 10);
      obstacles.push({ type: obType, moving: false, col, variant: Math.floor(Math.random() * 3), lethal });
    }
  }
  return obstacles;
}

// Builds one row of floating ice/logs. Each block gets its own length and
// speed (varying around a per-row base) instead of every block in a lane
// moving identically, and the whole layer starts at a randomized phase.
function generateIceLayer() {
  const dirSign   = Math.random() < 0.5 ? 1 : -1;
  const baseSpeed = 0.018 + Math.random() * 0.034;
  const logs = [];
  let x = Math.random() * COLS + Math.random() * 3;
  while (x < COLS + 6) {
    const len      = 1.1 + Math.random() * 2.6;             // small chips to big floes
    const speedMag = baseSpeed * (0.65 + Math.random() * 0.7); // per-block speed variety
    logs.push({ x, len, speed: dirSign * speedMag });
    x += len + 0.7 + Math.random() * 1.1;
  }
  return logs;
}

function makeWaterLane(row) {
  const logs = generateIceLayer();
  return { type:'water', row, logs, sunken: generateSunkenIce(), vehicles:[], decorations:[], obstacles:[], ...randomLaneGeometry() };
}

// Static, non-interactive ice chunks resting at the bottom of the lake,
// glimpsed dimly through the water's front face. Purely decorative — just
// depth and detail, nothing to land on.
function generateSunkenIce() {
  const chunks = [];
  const count = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    chunks.push({
      x      : Math.random() * COLS,
      w      : 0.5 + Math.random() * 0.8,
      depthT : 0.55 + Math.random() * 0.4,
    });
  }
  return chunks;
}

function generateDecorations(isIcy) {
  const decs = [];
  const count = 2 + Math.floor(Math.random() * 3);
  const usedX = new Set();
  // Mostly the theme's primary decoration, with its secondary type mixed
  // in for variety so a row of safe ground isn't just one repeated prop.
  // isIcy is kept for winter compat but all themes override via decType.
  const decType  = activeTheme.decType;
  const decType2 = activeTheme.decType2 || decType;
  for (let i = 0; i < count; i++) {
    let cx;
    do { cx = Math.floor(Math.random() * COLS); } while (usedX.has(cx));
    usedX.add(cx);
    const type = Math.random() < 0.7 ? decType : decType2;
    decs.push({ col: cx, type, variant: Math.floor(Math.random() * 3) });
  }
  return decs;
}

const CAR_COLORS = ['#e74c3c','#e67e22','#f1c40f','#27ae60','#2980b9','#8e44ad','#16a085','#c0392b',
                    '#e91e63','#00bcd4','#ff5722','#9c27b0','#4caf50','#ff9800','#03a9f4','#795548'];
const HUB_COLORS = ['#fffbe6','#ffd700','#fff','#f0f0f0','#ffe082','#b3e5fc','#f8bbd0','#dcedc8'];
function randomCarColor() { return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]; }
function randomHubColor() { return HUB_COLORS[Math.floor(Math.random() * HUB_COLORS.length)]; }

// ─────────────────────────────────────────────
//  WORLD MANAGEMENT
// ─────────────────────────────────────────────
function buildWorld() {
  lanes = [];
  for (let i = 0; i < 70; i++) lanes.push(createLane(i));
}

function ensureLanesAhead() {
  const maxRow = lanes[lanes.length - 1].row;
  const needed = player.worldRow + 30;
  for (let r = maxRow + 1; r <= needed; r++) lanes.push(createLane(r));
}

// ─────────────────────────────────────────────
//  COORDINATES
// ─────────────────────────────────────────────
// worldRow 0 = start. Higher row = further from camera = higher on screen.
// worldPixelY = -row * TILE  (row 0 → py=0, row 1 → py=-TILE)
function worldRowToPixelY(row) { return -row * TILE; }
function rowScreenY(row)       { return worldRowToPixelY(row) - cameraY; }

function syncPlayerPixels() {
  player.px = player.gridX * TILE;
  player.py = worldRowToPixelY(player.worldRow);
  player.targetPx = player.px;
  player.targetPy = player.py;
}

// ─────────────────────────────────────────────
//  START / RESET
// ─────────────────────────────────────────────
function startGame() {
  score = 0; coins = 0; deathReason = '';
  player.gridX    = Math.floor(COLS / 2);
  player.worldRow = 0;
  player.hopping  = false;
  player.squished = false;
  player.drowned  = false;
  player.onLog    = null;
  player.facingDir = 'up';
  player.bumping  = false;

  buildWorld();
  cameraY       = worldRowToPixelY(0) - (ROWS - 1 - PLAYER_START_ROW) * TILE;
  targetCameraY = cameraY;
  syncPlayerPixels();

  asteroids = [];
  nextAsteroidSpawn = performance.now() + 1500; // brief grace period before the first strike

  document.getElementById('score').textContent = '0';
  document.getElementById('coins').textContent = '0';
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('gameover-screen').classList.add('hidden');
  gameState = 'playing';
  initAmbientParticles();
}

// ─────────────────────────────────────────────
//  PLAYER MOVEMENT
// ─────────────────────────────────────────────
// True if a WALL-type obstacle on `lane` occupies `col` right now — a static
// one at that exact column, or a moving one currently overlapping it. Lethal
// obstacles (e.g. tumbleweed) are excluded — they never block the hop, they
// kill on contact instead (see isLethalObstacleTouching).
function isObstacleBlocking(lane, col) {
  if (!lane || !lane.obstacles) return false;
  for (const o of lane.obstacles) {
    if (o.lethal) continue;
    if (o.moving) {
      if (col + 0.2 < o.x + 1 && col + 0.8 > o.x) return true;
    } else if (o.col === col) {
      return true;
    }
  }
  return false;
}

// True if a LETHAL obstacle on `lane` is touching `col` right now — same
// overlap math as isObstacleBlocking, but for hazards the penguin can hop
// onto and must instead avoid or die.
function isLethalObstacleTouching(lane, col) {
  if (!lane || !lane.obstacles) return false;
  for (const o of lane.obstacles) {
    if (!o.lethal) continue;
    if (o.moving) {
      if (col + 0.2 < o.x + 1 && col + 0.8 > o.x) return true;
    } else if (o.col === col) {
      return true;
    }
  }
  return false;
}

function movePlayer(dir) {
  let newX   = player.gridX;
  let newRow = player.worldRow;
  if (dir === 'up')    newRow++;
  if (dir === 'down')  newRow--;
  if (dir === 'left')  newX--;
  if (dir === 'right') newX++;
  newX   = Math.max(0, Math.min(COLS - 1, newX));
  if (newRow < 0) newRow = 0;

  const fromLane = getLane(player.worldRow);
  const toLane   = getLane(newRow);

  // An obstacle blocks the hop outright — it's a wall, not a hazard. The
  // penguin just stays put (with a little bump) instead of dying.
  if (isObstacleBlocking(toLane, newX)) {
    player.facingDir     = dir;
    player.bumping       = true;
    player.bumpDir       = dir;
    player.bumpStartTime = performance.now();
    return;
  }

  player.liftFrom = floatStandLift(fromLane);
  player.liftTo   = floatStandLift(toLane);

  player.facingDir    = dir;
  player.hopping      = true;
  player.hopProgress  = 0;
  player.hopStartTime = performance.now();
  // Weightless themes (space) get a slower, floatier hop — everyone else
  // keeps the normal snappy hop.
  player.hopDuration   = activeTheme.hopDuration != null ? activeTheme.hopDuration : 130;
  player.targetPx     = newX * TILE;
  player.targetPy     = worldRowToPixelY(newRow);
  player.onLog        = null;

  const prevRow    = player.worldRow;
  player.gridX     = newX;
  player.worldRow  = newRow;

  // Collect the instant the penguin commits to the coin's tile — as soon as
  // the hop starts, not only once the jump animation finishes landing. The
  // body sweeps onto the tile well before the landing pose plays, so this
  // is when the "touch" should count, jumping or not.
  collectNearbyCoins();

  if (newRow > prevRow && newRow > score) {
    score = newRow;
    document.getElementById('score').textContent = score;
    const desiredScreenRow = ROWS - 1 - PLAYER_START_ROW - 1;
    targetCameraY = worldRowToPixelY(player.worldRow) - desiredScreenRow * TILE;
  }
  ensureLanesAhead();
}

// ─────────────────────────────────────────────
//  COLLISION
// ─────────────────────────────────────────────
function getLane(worldRow) { return lanes.find(l => l.row === worldRow) || null; }

// Collects a coin as soon as the penguin's tile matches the coin's tile —
// called right when a hop is committed (movePlayer) so it fires mid-jump,
// not just after landing, and again here as a safety net for any coin that
// ends up on the player's tile some other way. Still exact-tile only: no
// lane-wide or adjacent-tile forgiveness, just no longer gated on the jump
// animation having finished.
function collectNearbyCoins() {
  const lane = getLane(player.worldRow);
  if (!lane || !lane.coins) return;
  for (const c of lane.coins) {
    if (!c.taken && c.col === player.gridX) {
      c.taken = true;
      coins++;
      document.getElementById('coins').textContent = coins;
    }
  }
}

function checkCollisions() {
  if (player.hopping) return;
  const lane = getLane(player.worldRow);
  if (!lane) return;

  collectNearbyCoins();

  if (isLethalObstacleTouching(lane, player.gridX)) { killPlayer('tumbleweed'); return; }

  if (lane.type === 'road') {
    for (const v of lane.vehicles) {
      const vR = v.x + (v.type === 'truck' ? 2 : 1);
      if (player.gridX + 0.2 < vR && player.gridX + 0.8 > v.x) {
        killPlayer('squished'); return;
      }
    }
  }
  if (lane.type === 'water') {
    let onLog = false;
    const pCx = player.gridX + 0.5;
    for (const log of lane.logs) {
      if (pCx > log.x && pCx < log.x + log.len) { player.onLog = log; onLog = true; break; }
    }
    if (!onLog) { player.onLog = null; killPlayer('drowned'); }
  } else { player.onLog = null; }
}

function killPlayer(reason) {
  if (player.squished || player.drowned) return;
  deathReason = reason;
  // tumbleweed and asteroid strikes reuse the squished visual (flattened
  // penguin) — they're just different hazards, not new death animations.
  if (reason === 'squished' || reason === 'tumbleweed' || reason === 'asteroid') player.squished = true;
  if (reason === 'drowned')  player.drowned  = true;
  gameState = 'dead';
  if (score > highScore) highScore = score;
  if (coins > highCoins) highCoins = coins;
  setTimeout(showGameOver, 900);
}

function showGameOver() {
  document.getElementById('final-score').textContent = score;
  document.getElementById('gameover-reason').textContent =
    deathReason === 'squished'   ? (activeTheme.key === 'space' ? '🚀 The penguin got hit by a spaceship!' : '🚗 The penguin got squished!') :
    deathReason === 'tumbleweed' ? '🌵 The penguin got rolled over by a tumbleweed!' :
    deathReason === 'asteroid'   ? '☄️ The penguin got hit by a falling asteroid!' :
    activeTheme.key === 'space'  ? '🌌 The penguin drifted off into the void!' :
    '💧 The penguin fell in the water!';
  const hsEl = document.getElementById('high-score-display');
  hsEl.textContent = highScore > 0
    ? (score >= highScore ? '🏆 New High Score!' : `Best: ${highScore}`)
    : '';
  document.getElementById('final-coins').textContent = coins;
  const hcEl = document.getElementById('high-coins-display');
  hcEl.textContent = highCoins > 0
    ? (coins >= highCoins ? '🏆 New Coin Best!' : `Best: ${highCoins}`)
    : '';
  document.getElementById('gameover-screen').classList.remove('hidden');
  // Keep sidebar high-score / high-coins in sync
  if (typeof sidebarHS !== 'undefined') sidebarHS.textContent = highScore > 0 ? highScore : '—';
  if (typeof sidebarBestCoins !== 'undefined') sidebarBestCoins.textContent = highCoins > 0 ? highCoins : '—';
}

// ─────────────────────────────────────────────
//  ASTEROID BOMBS  (space theme only)
// ─────────────────────────────────────────────
// A warning shadow appears on a random on-screen tile, then shortly after,
// a rock actually drops and the impact is checked once against wherever
// the player is at that instant — instant death on contact, dodgeable by
// moving off the warned tile before it lands.
function updateAsteroids() {
  if (activeTheme.key !== 'space') { if (asteroids.length) asteroids = []; return; }

  const now = performance.now();

  if (now >= nextAsteroidSpawn) {
    nextAsteroidSpawn = now + 900 + Math.random() * 900;
    const onScreen = lanes.filter(l => {
      const sy = rowScreenY(l.row);
      return sy > -TILE && sy < H + TILE;
    });
    if (onScreen.length) {
      const lane = onScreen[Math.floor(Math.random() * onScreen.length)];
      asteroids.push({
        row: lane.row,
        col: Math.floor(Math.random() * COLS),
        state: 'warning',
        spawnTime: now,
        warnDuration: 750,
        impactDuration: 260,
        seed: Math.random() * 1000,
        killChecked: false,
      });
    }
  }

  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    const elapsed = now - a.spawnTime;
    if (a.state === 'warning' && elapsed >= a.warnDuration) {
      a.state = 'impact';
      a.impactTime = now;
    }
    if (a.state === 'impact') {
      if (!a.killChecked) {
        a.killChecked = true;
        if (player.gridX === a.col && player.worldRow === a.row) killPlayer('asteroid');
      }
      if (now - a.impactTime >= a.impactDuration) asteroids.splice(i, 1);
    }
  }
}

function drawAsteroids() {
  if (!asteroids.length) return;
  const now = performance.now();
  for (const a of asteroids) {
    const sy = rowScreenY(a.row) + TILE - ISO_DY;
    const cx = a.col * TILE + TILE / 2;
    if (a.state === 'warning') {
      const t = (now - a.spawnTime) / a.warnDuration;
      drawAsteroidWarning(cx, sy, t);
    } else {
      const t = (now - a.impactTime) / a.impactDuration;
      drawAsteroidImpact(cx, sy, Math.min(t, 1), a.seed);
    }
  }
}

function drawAsteroidWarning(cx, sy, t) {
  const baseY = sy - ISO_DY * 0.4;
  const pulse = 0.5 + Math.sin(t * Math.PI * 8) * 0.5;
  const r = 15 + t * 8;
  ctx.save();
  ctx.globalAlpha = 0.4 + pulse * 0.4;
  ctx.strokeStyle = '#ff3b3b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, baseY, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = '#ff3b3b';
  ctx.beginPath();
  ctx.ellipse(cx, baseY, r * 0.7, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAsteroidImpact(cx, sy, t, seed) {
  const baseY = sy - ISO_DY * 0.4;
  if (t < 0.5) {
    // falling rock, accelerating in from above
    const fallT = t / 0.5;
    const rockY = lerp(baseY - 240, baseY - 8, fallT * fallT);
    const r = 14;
    ctx.save();
    ctx.translate(cx, rockY);
    ctx.rotate(seed + fallT * 8);
    ctx.fillStyle = '#5c4a3a';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2;
      const rr  = r * (0.75 + 0.25 * Math.sin(seed * 3 + i * 2));
      const px  = Math.cos(ang) * rr, py = Math.sin(ang) * rr * 0.85;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // motion streak trailing above it
    ctx.strokeStyle = 'rgba(255,180,120,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, rockY - r);
    ctx.lineTo(cx, rockY - r - 20 - fallT * 14);
    ctx.stroke();
  } else {
    // impact flash + expanding dust ring, fading out
    const impT = (t - 0.5) / 0.5;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - impT);
    ctx.fillStyle = '#ffcf6b';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 20 * (0.4 + impT * 0.8), 8 * (0.4 + impT * 0.8), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,60,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 26 * (0.3 + impT), 10 * (0.3 + impT), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────
let lastTime = 0;

function update(dt) {
  if (gameState !== 'playing') return;

  if (player.hopping) {
    const elapsed = performance.now() - player.hopStartTime;
    player.hopProgress = Math.min(elapsed / player.hopDuration, 1);
    const t = easeInOut(player.hopProgress);
    player.px = lerp(player.px, player.targetPx, t);
    player.py = lerp(player.py, player.targetPy, t);
    if (player.hopProgress >= 1) {
      player.hopping = false;
      player.px = player.targetPx;
      player.py = player.targetPy;
      checkCollisions();
    }
  }

  cameraY += (targetCameraY - cameraY) * 0.12;

  for (const lane of lanes) {
    if (lane.type === 'road') {
      for (const v of lane.vehicles) {
        v.x += v.speed;
        const w = v.type === 'truck' ? 2 : 1;
        if (v.speed > 0 && v.x > COLS + 1)  v.x = -w - 1;
        if (v.speed < 0 && v.x + w < -1)    v.x = COLS + 1;
      }
    }
    if (lane.type === 'water') {
      for (const log of lane.logs) {
        log.x += log.speed;
        if (log.speed > 0 && log.x > COLS + 2)     log.x = -(log.len + 1);
        if (log.speed < 0 && log.x + log.len < -2) log.x = COLS + 1;
      }
    }
    if (lane.obstacles) {
      for (const o of lane.obstacles) {
        if (!o.moving) continue;
        o.x += o.speed;
        if (o.speed > 0 && o.x > COLS + 2)     o.x = -2;
        if (o.speed < 0 && o.x + 1 < -2)       o.x = COLS + 1;
      }
    }
  }

  updateAsteroids();

  // ── Continuous collision check every frame ──────────────────
  // checkCollisions() only fires on hop-land, so vehicles moving
  // into a stationary player would never be detected without this.
  if (!player.hopping) {
    const lane = getLane(player.worldRow);
    if (lane && lane.type === 'road') {
      for (const v of lane.vehicles) {
        const vR = v.x + (v.type === 'truck' ? 2 : 1);
        if (player.gridX + 0.2 < vR && player.gridX + 0.8 > v.x) {
          killPlayer('squished'); break;
        }
      }
    }
    // a rolling lethal obstacle (tumbleweed) can drift into a stationary
    // penguin, not just the other way around
    if (lane && isLethalObstacleTouching(lane, player.gridX)) killPlayer('tumbleweed');
  }  if (player.onLog && !player.hopping) {
    player.gridX    += player.onLog.speed;
    player.px       += player.onLog.speed * TILE;
    player.targetPx  = player.px;
    if (player.gridX < -0.5 || player.gridX > COLS - 0.5) killPlayer('drowned');
    else checkCollisions();
  }

  const bottomRow = Math.floor(-(cameraY + H) / TILE);
  if (player.worldRow < bottomRow - 1) killPlayer('drowned');
}

function lerp(a, b, t)  { return a + (b - a) * t; }
function easeInOut(t)   { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

// ─────────────────────────────────────────────
//  2.5D ISOMETRIC PROJECTION
//
//  Each row of tiles is a parallelogram top face.
//  The "depth" axis goes: right +ISO_DX, up -ISO_DY.
//  Screen Y for a lane = rowScreenY(row) — this is the Y of the
//  FRONT edge of the tile top face (the closest edge to viewer).
//  The tile top face then goes UP by ISO_DY to the back edge.
//  Below the front edge, a front face drops down FRONT_H pixels.
// ─────────────────────────────────────────────
const ISO_DX    = 0;     // horizontal shift per depth unit (0 = straight back)
const ISO_DY    = 20;    // vertical rise of top face (depth illusion)
const FRONT_H   = 18;    // height of the front-facing slab face
const TILE_FACE_H = FRONT_H; // keep alias for legacy references

// Floating logs/ice sit visibly above the water line. When the penguin is
// riding one, it should be drawn up on top of that surface (with a little
// clearance from the front edge) rather than flush with the waterline, or
// it won't read as "standing on the ice."
const FLOAT_H            = 16;  // height of floating logs/ice above the water line
const FLOAT_STAND_MARGIN = 6;   // extra clearance so the feet sit inset from the float's front edge
const FLOAT_STAND_LIFT   = FLOAT_H + FLOAT_STAND_MARGIN;
// Floats are drawn out over open water, this far down a lane's front face
// (see drawFloat) instead of hugging the near edge — the player's stand
// height has to shift by the same amount or the penguin renders back at
// the float's old position, which now reads as its top/back edge.
const FLOAT_MID_T        = 0.32;

function floatStandLift(lane) {
  if (!lane || lane.type !== 'water') return 0;
  return FLOAT_STAND_LIFT - (lane.frontH || 0) * FLOAT_MID_T;
}

// ─────────────────────────────────────────────
//  CORE BLOCK PRIMITIVE  (2.5D)
//
//  (tx, ty) = top-left of the FRONT face (front edge, left side)
//  tw       = width
//  th       = front face height
//  dz       = depth (how far back the top face goes)
//  colFront, colTop, colSide = face colours
// ─────────────────────────────────────────────
function drawBox(tx, ty, tw, th, dz, colFront, colTop, colSide) {
  const sx = ISO_DX * dz;  // back-edge X offset  (0 for straight-back)
  const sy = ISO_DY * (dz / 14); // back-edge Y offset (scales with dz)

  // ── Top face (parallelogram going up-back) ─
  ctx.fillStyle = colTop;
  ctx.beginPath();
  ctx.moveTo(tx,           ty);           // front-left
  ctx.lineTo(tx + tw,      ty);           // front-right
  ctx.lineTo(tx + tw + sx, ty - sy);      // back-right
  ctx.lineTo(tx + sx,      ty - sy);      // back-left
  ctx.closePath();
  ctx.fill();

  // ── Front face (rectangle) ────────────────
  ctx.fillStyle = colFront;
  ctx.fillRect(tx, ty, tw, th);

  // ── Right side face (parallelogram) ───────
  ctx.fillStyle = colSide;
  ctx.beginPath();
  ctx.moveTo(tx + tw,      ty);           // front-right top
  ctx.lineTo(tx + tw,      ty + th);      // front-right bottom
  ctx.lineTo(tx + tw + sx, ty + th - sy); // back-right bottom
  ctx.lineTo(tx + tw + sx, ty - sy);      // back-right top
  ctx.closePath();
  ctx.fill();

  // ── Crisp pixel-art edges ─────────────────
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx, ty, tw, th);
  ctx.beginPath();
  ctx.moveTo(tx,      ty);
  ctx.lineTo(tx + sx, ty - sy);
  ctx.lineTo(tx + tw + sx, ty - sy);
  ctx.lineTo(tx + tw, ty);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + tw + sx, ty - sy);
  ctx.lineTo(tx + tw + sx, ty + th - sy);
  ctx.stroke();
}

// Convenience helpers
function colorSet(hex, topShift, sideShift) {
  return { front: hex, top: shiftColor(hex, topShift), side: shiftColor(hex, sideShift) };
}
function shiftColor(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const c = v => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n>>16)},${c((n>>8)&0xff)},${c(n&0xff)})`;
}

// ─────────────────────────────────────────────
//  GROUND TILE  (full-width, 2.5D parallelogram)
//
//  sy = front edge Y of the tile.
//  Top face is a parallelogram going up by ISO_DY.
//  Front face drops FRONT_H below sy.
// ─────────────────────────────────────────────
function drawGroundTile(x, sy, w, topColor, sideColor, frontH, waveAmp, waveFreq, waveSeed) {
  frontH   = frontH   != null ? frontH   : FRONT_H;
  waveAmp  = waveAmp  || 0;
  waveFreq = waveFreq || 0;
  waveSeed = waveSeed || 0;

  // The near edge (shared boundary between the top face and the front face)
  // gently wobbles instead of running perfectly straight, so lanes don't
  // read as ruler-flat strips.
  const segments = waveAmp > 0 ? 24 : 1;
  const segW     = w / segments;
  const waveY    = px => waveAmp ? Math.sin((px + waveSeed) * waveFreq) * waveAmp : 0;

  function traceNearEdge() {
    ctx.moveTo(x, sy + waveY(x));
    for (let i = 1; i <= segments; i++) {
      const px = x + i * segW;
      ctx.lineTo(px, sy + waveY(px));
    }
  }

  // Top face — parallelogram, near edge follows the wobble
  ctx.fillStyle = topColor;
  ctx.beginPath();
  traceNearEdge();
  ctx.lineTo(x + w, sy - ISO_DY);     // back-right
  ctx.lineTo(x,     sy - ISO_DY);     // back-left
  ctx.closePath();
  ctx.fill();
  // Subtle top-face grid line between lanes
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, sy - ISO_DY);
  ctx.lineTo(x + w, sy - ISO_DY);
  ctx.stroke();

  // Front face — thick slab whose top edge follows the same wobble
  ctx.fillStyle = sideColor;
  ctx.beginPath();
  traceNearEdge();
  ctx.lineTo(x + w, sy + frontH);
  ctx.lineTo(x,     sy + frontH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.beginPath();
  traceNearEdge();
  ctx.lineTo(x + w, sy + frontH);
  ctx.lineTo(x,     sy + frontH);
  ctx.closePath();
  ctx.stroke();
}

// ─────────────────────────────────────────────
//  DRAW
// ─────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, W, H);

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, activeTheme.sky[0]);
  sky.addColorStop(1, activeTheme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  drawClouds();
  drawLanes();
  drawPlayer();
  drawAsteroids();
  drawParticles();
  drawAmbientParticles();
}

// ─────────────────────────────────────────────
//  DRAW LANES
// ─────────────────────────────────────────────
function drawLanes() {
  const sorted = lanes
    .filter(l => {
      const sy = rowScreenY(l.row);
      return sy < H + TILE + ISO_DY && sy > -TILE * 3;
    })
    .sort((a, b) => b.row - a.row); // back rows first (painter's algorithm)

  for (const lane of sorted) drawLane(lane);
}

function drawLane(lane) {
  // sy = Y of the front edge of this tile's top face
  const sy     = rowScreenY(lane.row) + TILE - ISO_DY;
  const isEven = lane.row % 2 === 0;
  const T      = activeTheme;

  if (lane.type === 'safe') {
    const topColor  = isEven ? T.safeA : T.safeB;
    const sideColor = shiftColor(topColor, -35);
    drawGroundTile(0, sy, W, topColor, sideColor, lane.frontH, lane.waveAmp, lane.waveFreq, lane.waveSeed);
    for (const dec of lane.decorations) {
      const dx = dec.col * TILE + TILE / 2;
      if (dec.type === 'tree')           drawTree(dx, sy, dec.variant);
      else if (dec.type === 'snowblock') drawSnowBlock(dx, sy);
      else if (dec.type === 'cactus')    drawCactus(dx, sy, dec.variant);
      else if (dec.type === 'umbrella')  drawUmbrella(dx, sy, dec.variant);
      else if (dec.type === 'rock')      drawRock(dx, sy, dec.variant);
      else if (dec.type === 'snowman')   drawSnowman(dx, sy, dec.variant);
      else if (dec.type === 'satellite') drawSatelliteDish(dx, sy, dec.variant);
      else if (dec.type === 'crater')    drawCrater(dx, sy, dec.variant);
    }
    for (const c of lane.coins) {
      if (!c.taken) drawCoin(c.col * TILE + TILE / 2, sy, c.seed);
    }
    for (const o of lane.obstacles) {
      if (o.moving) {
        if (o.type === 'tumbleweed') drawTumbleweed(o.x * TILE + TILE / 2, sy, o.seed);
      } else {
        const ox = o.col * TILE + TILE / 2;
        if (o.type === 'boulder')       drawBoulder(ox, sy, o.variant);
        else if (o.type === 'snowball') drawSnowball(ox, sy, o.variant);
        else if (o.type === 'boat')     drawBoat(ox, sy, o.variant);
      }
    }
  }
  else if (lane.type === 'road') {
    const roadColor = isEven ? T.roadA : T.roadB;
    drawGroundTile(0, sy, W, roadColor, shiftColor(roadColor, -35), lane.frontH, lane.waveAmp, lane.waveFreq, lane.waveSeed);
    // Dashed centre line on the top face
    ctx.save();
    ctx.strokeStyle = T.roadLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.moveTo(0,  sy - ISO_DY * 0.5);
    ctx.lineTo(W,  sy - ISO_DY * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    for (const c of lane.coins) {
      if (!c.taken) drawCoin(c.col * TILE + TILE / 2, sy, c.seed);
    }
    for (const v of lane.vehicles) drawVehicle(v, sy);
  }
  else if (lane.type === 'water') {
    const waterColor = isEven ? T.waterA : T.waterB;
    drawGroundTile(0, sy, W, waterColor, shiftColor(waterColor, -35), lane.frontH, lane.waveAmp, lane.waveFreq, lane.waveSeed);
    drawSunkenIce(lane.sunken, sy, lane.frontH);
    drawWaterShimmer(sy, lane.row);
    for (const log of lane.logs) drawFloat(log, sy, lane.frontH);
  }
}

function drawWaterShimmer(sy, seed) {
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  const t = Date.now() / 900 + seed * 0.5;
  for (let i = 0; i < 9; i++) {
    const wx = ((i * 80 + t * 28) % (W + 60)) - 30;
    ctx.beginPath();
    ctx.arc(wx, sy - ISO_DY * 0.5, 10, Math.PI, 0);
    ctx.stroke();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  FLOATING PLATFORM
// ─────────────────────────────────────────────
function drawFloat(log, sy, frontH) {
  const x   = log.x * TILE;
  const lw  = log.len * TILE - 4;
  const fh  = FLOAT_H;
  const dz  = 12;
  // Sit out over open water instead of hugging the near edge: drop the
  // float about a third of the way down the lane's front face so it
  // reads as floating in the middle of the lake, not glued to the bank.
  const midY = sy + (frontH || 0) * FLOAT_MID_T;
  const ty   = midY - fh;
  const T   = activeTheme;
  const cs  = colorSet(T.floatColor, 30, -20);
  ctx.save();
  drawBox(x + 2, ty, lw, fh, dz, cs.front, cs.top, cs.side);
  // Surface patches
  const patchY = ty - (ISO_DY * dz / 14) * 0.5;
  ctx.fillStyle = T.floatPatch;
  ctx.fillRect(x + 8,         patchY, lw * 0.28, 4);
  ctx.fillRect(x + lw * 0.55, patchY, lw * 0.22, 4);
  ctx.restore();
}

// Static ice chunks glimpsed at the bottom of the lake, drawn low on the
// water's front (vertical) face — pure background detail, unrelated to the
// floating platforms above.
function drawSunkenIce(chunks, sy, frontH) {
  if (!chunks) return;
  ctx.save();
  ctx.globalAlpha = 0.3;
  const T = activeTheme;
  ctx.fillStyle = T.floatColor;
  for (const c of chunks) {
    const cx = c.x * TILE + (c.w * TILE) / 2;
    const cy = sy + frontH * c.depthT;
    const rw = c.w * TILE * 0.5;
    const rh = rw * 0.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  VEHICLES
// ─────────────────────────────────────────────
function drawVehicle(v, sy) {
  const isTruck = v.type === 'truck';
  const vw      = (isTruck ? 2 : 1) * TILE;
  const vx      = v.x * TILE;
  const goLeft  = v.speed < 0;

  ctx.save();
  if (goLeft) {
    ctx.translate(vx + vw, 0);
    ctx.scale(-1, 1);
    ctx.translate(-vx, 0);
  }
  if (activeTheme.key === 'space') drawSpaceship3D(vx, sy, vw, v.color, v.hubColor);
  else if (isTruck)                drawTruck3D(vx, sy, vw, v.color, v.hubColor);
  else                             drawCar3D(vx, sy, vw, v.color, v.hubColor);
  ctx.restore();
}

// No cars in space — flight-corridor lanes carry spaceships instead. Same
// footprint/speed/collision box as a car or truck. Modeled on a classic
// cartoon rocket: white/silver body, a colored nose cone and swept-back
// fins, a round blue porthole, and a flame trail out the back.
function drawSpaceship3D(vx, sy, vw, color, hubColor) {
  const pad    = 8;
  const hullW  = vw - pad * 2;
  const bodyH  = TILE * 0.30;
  const bodyY  = sy - bodyH * 1.3; // hovers above the lane surface
  const bodyCs = colorSet('#e8e8ee', 15, -20); // white/silver body
  const midY   = bodyY + bodyH / 2;

  // flame trail out the back, flickering
  const flameX   = vx + pad + hullW * 0.16;
  const flameLen = 20 + Math.sin(Date.now() / 70 + vx) * 6;
  const flameW   = bodyH * 0.34;
  const flame = ctx.createLinearGradient(flameX, midY, flameX - flameLen, midY);
  flame.addColorStop(0,   '#fff3c4');
  flame.addColorStop(0.4, '#ffb020');
  flame.addColorStop(1,   'rgba(255,90,20,0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(flameX, midY - flameW);
  ctx.lineTo(flameX - flameLen, midY);
  ctx.lineTo(flameX, midY + flameW);
  ctx.closePath();
  ctx.fill();

  // rear fins (swept back, in the accent color)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(vx + pad + hullW * 0.32, bodyY + bodyH * 0.1);
  ctx.lineTo(vx + pad,                bodyY - bodyH * 0.45);
  ctx.lineTo(vx + pad + hullW * 0.44, bodyY + bodyH * 0.28);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(vx + pad + hullW * 0.32, bodyY + bodyH * 0.9);
  ctx.lineTo(vx + pad,                bodyY + bodyH * 1.45);
  ctx.lineTo(vx + pad + hullW * 0.44, bodyY + bodyH * 0.72);
  ctx.closePath(); ctx.fill();

  // main hull — a rounded capsule (box + round nose end, drawn as one path
  // so it doesn't read as a boxy car body)
  ctx.fillStyle = bodyCs.front;
  ctx.beginPath();
  ctx.moveTo(vx + pad + hullW * 0.18, bodyY);
  ctx.lineTo(vx + pad + hullW * 0.62, bodyY);
  ctx.arc(vx + pad + hullW * 0.62, midY, bodyH / 2, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(vx + pad + hullW * 0.18, bodyY + bodyH);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // colored stripe band near the nose
  ctx.fillStyle = color;
  ctx.fillRect(vx + pad + hullW * 0.5, bodyY, hullW * 0.05, bodyH);

  // nose cone
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(vx + pad + hullW * 0.62, bodyY);
  ctx.lineTo(vx + pad + hullW,        midY);
  ctx.lineTo(vx + pad + hullW * 0.62, bodyY + bodyH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // round blue porthole window
  const winX = vx + pad + hullW * 0.36;
  ctx.fillStyle = '#dfe6ea';
  ctx.beginPath(); ctx.arc(winX, midY, bodyH * 0.34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hubColor && hubColor !== '#fffbe6' ? hubColor : '#4fc3f7';
  ctx.beginPath(); ctx.arc(winX, midY, bodyH * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(winX - bodyH * 0.08, midY - bodyH * 0.08, bodyH * 0.07, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(winX, midY, bodyH * 0.34, 0, Math.PI * 2); ctx.stroke();

  // small dark rivet/porthole below
  ctx.fillStyle = '#2a2a2a';
  ctx.beginPath();
  ctx.arc(vx + pad + hullW * 0.2, bodyY + bodyH * 0.86, bodyH * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // hovering shadow on the lane surface below
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(vx + pad + hullW * 0.5, sy + 3, hullW * 0.4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCar3D(vx, sy, vw, color, hubColor) {
  const depth = 14;
  const pad   = 5;
  const WR    = 10;
  // Wheels sit on the ground surface (sy = front edge of tile top face)
  const axleY = sy + WR * 0.6;
  const bodyH = TILE * 0.36;
  const bodyY = axleY - bodyH + WR * 0.4;
  const cs    = colorSet(color, 30, -35);
  drawBox(vx + pad, bodyY, vw - pad * 2, bodyH, depth, cs.front, cs.top, cs.side);

  const cabW  = (vw - pad * 2) * 0.56;
  const cabH  = TILE * 0.26;
  const cabX  = vx + pad + (vw - pad * 2) * 0.20;
  const cabY  = bodyY - cabH;
  const cabCs = colorSet(shiftColor(color, 20), 25, -28);
  drawBox(cabX, cabY, cabW, cabH, depth, cabCs.front, cabCs.top, cabCs.side);

  // Windshield
  ctx.fillStyle = 'rgba(180,230,255,0.78)';
  ctx.fillRect(cabX + 2, cabY + 2, cabW * 0.44, cabH - 4);
  ctx.fillStyle = 'rgba(180,230,255,0.55)';
  ctx.fillRect(cabX + cabW * 0.57, cabY + 3, cabW * 0.37, cabH - 6);

  drawRoundWheel(vx + pad + 14,      axleY, WR, hubColor);
  drawRoundWheel(vx + vw - pad - 14, axleY, WR, hubColor);

  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.arc(vx + vw - pad, bodyY + bodyH * 0.45, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawTruck3D(vx, sy, vw, color, hubColor) {
  const depth = 14;
  const pad   = 4;
  const cabW  = vw * 0.30;
  const boxW  = vw * 0.66;
  const cabX  = vx + pad + boxW + 2;
  const WR    = 10;
  const axleY = sy + WR * 0.6;

  const boxH  = TILE * 0.44;
  const boxY  = axleY - boxH + WR * 0.4;
  const boxCs = colorSet(color, 20, -38);
  drawBox(vx + pad, boxY, boxW, boxH, depth, boxCs.front, boxCs.top, boxCs.side);

  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(vx + pad + boxW * 0.33, boxY + 3); ctx.lineTo(vx + pad + boxW * 0.33, boxY + boxH - 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vx + pad + boxW * 0.66, boxY + 3); ctx.lineTo(vx + pad + boxW * 0.66, boxY + boxH - 3); ctx.stroke();
  ctx.restore();

  const cabH  = TILE * 0.48;
  const cabY  = axleY - cabH + WR * 0.4;
  const cabCs = colorSet(shiftColor(color, 25), 30, -28);
  drawBox(cabX, cabY, cabW - pad, cabH, depth, cabCs.front, cabCs.top, cabCs.side);
  ctx.fillStyle = 'rgba(180,230,255,0.82)';
  ctx.fillRect(cabX + 2, cabY + 3, (cabW - pad) * 0.75, cabH * 0.42);

  drawRoundWheel(vx + pad + 14,             axleY, WR, hubColor);
  drawRoundWheel(vx + pad + boxW * 0.6,     axleY, WR, hubColor);
  drawRoundWheel(cabX + (cabW - pad) * 0.5, axleY, WR, hubColor);

  ctx.fillStyle = '#fffbe6';
  ctx.beginPath();
  ctx.arc(cabX + cabW - pad, cabY + cabH * 0.45, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoundWheel(cx, cy, r, hubColor) {
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(cx - r*0.2, cy - r*0.3, r*0.55, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.72, 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = hubColor;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.38, 0, Math.PI*2); ctx.stroke();
}

// ─────────────────────────────────────────────
//  DECORATIONS  (theme-aware)
// ─────────────────────────────────────────────
function drawTree(cx, sy, variant) {
  const T          = activeTheme;
  const treeColor  = T.treeLeaf[variant % T.treeLeaf.length];
  const trunkColor = T.treeTrunk;
  const depth      = 10;
  // Base of trunk sits on the top face of the tile (sy - ISO_DY/2)
  const baseY = sy - ISO_DY * 0.4;

  const trunkW = 10, trunkH = 16;
  const tCs = colorSet(trunkColor, 20, -28);
  drawBox(cx - trunkW/2, baseY - trunkH, trunkW, trunkH, depth, tCs.front, tCs.top, tCs.side);

  const lCs    = colorSet(treeColor, 28, -32);
  const leafW1 = 34, leafH1 = 18;
  drawBox(cx - leafW1/2, baseY - trunkH - leafH1, leafW1, leafH1, depth, lCs.front, lCs.top, lCs.side);
  const leafW2 = 22, leafH2 = 16;
  drawBox(cx - leafW2/2, baseY - trunkH - leafH1 - leafH2 + 5, leafW2, leafH2, depth, lCs.front, lCs.top, lCs.side);
}

function drawSnowBlock(cx, sy) {
  const depth = 10;
  const sw = 20, sh = 16;
  const baseY = sy - ISO_DY * 0.4;
  const cs = colorSet('#c9e8f5', 30, -22);
  drawBox(cx - sw/2, baseY - sh, sw, sh, depth, cs.front, cs.top, cs.side);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  const topY = baseY - sh - (ISO_DY * depth / 14) * 0.5;
  ctx.fillRect(cx - sw/2 + 3, topY, sw * 0.5, 3);
}

function drawCactus(cx, sy, variant) {
  const T     = activeTheme;
  const green = T.treeLeaf[variant % T.treeLeaf.length];
  const depth = 8;
  const baseY = sy - ISO_DY * 0.4;
  const tw = 10, th = 32;
  const tCs = colorSet(green, 22, -28);
  drawBox(cx - tw/2, baseY - th, tw, th, depth, tCs.front, tCs.top, tCs.side);
  const aw = 8, ah = 16;
  drawBox(cx - tw/2 - aw, baseY - th * 0.65 - ah*0.5, aw, ah, depth, tCs.front, tCs.top, tCs.side);
  drawBox(cx - tw/2 - aw, baseY - th * 0.65 - ah,     aw, ah*0.5, depth, tCs.front, tCs.top, tCs.side);
  drawBox(cx + tw/2,      baseY - th * 0.55 - ah*0.5, aw, ah, depth, tCs.front, tCs.top, tCs.side);
  drawBox(cx + tw/2,      baseY - th * 0.55 - ah,     aw, ah*0.5, depth, tCs.front, tCs.top, tCs.side);
}

function drawUmbrella(cx, sy, variant) {
  const depth  = 8;
  const colors = [['#ff6b6b','#ee5a24'],['#ffd93d','#f9ca24'],['#6bcb77','#4caf50'],['#4d96ff','#2196f3']];
  const [canopyColor, canopyDark] = colors[variant % colors.length];
  const baseY = sy - ISO_DY * 0.4;
  const pCs = colorSet('#bdbdbd', 20, -20);
  drawBox(cx - 3, baseY - 36, 6, 36, depth * 0.4, pCs.front, pCs.top, pCs.side);
  const cw = 40, ch = 12;
  const cCs = colorSet(canopyColor, 25, -22);
  drawBox(cx - cw/2, baseY - 36 - ch, cw, ch, depth, cCs.front, cCs.top, cCs.side);
  ctx.fillStyle = canopyDark;
  ctx.fillRect(cx - 5, baseY - 36 - ch, 10, ch);
}

function drawRock(cx, sy, variant) {
  const depth = 8;
  const baseY = sy - ISO_DY * 0.4;
  const sizes = [[22, 13], [16, 10], [27, 16]];
  const [rw, rh] = sizes[variant % sizes.length];
  const rockColor = activeTheme.key === 'desert' ? '#a17c52' : '#8f8f96';
  const cs = colorSet(rockColor, 20, -26);
  drawBox(cx - rw / 2, baseY - rh, rw, rh, depth, cs.front, cs.top, cs.side);
  // a smaller second boulder tucked beside it for a more natural cluster
  const rw2 = rw * 0.55, rh2 = rh * 0.6;
  drawBox(cx + rw / 2 - 3, baseY - rh2, rw2, rh2, depth * 0.7, cs.front, cs.top, cs.side);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(cx - rw / 2 + 2, baseY - rh - (ISO_DY * depth / 14) * 0.5, rw * 0.3, 3);
}

// A small planted comms dish — the space theme's primary decoration.
function drawSatelliteDish(cx, sy, variant) {
  const baseY = sy - ISO_DY * 0.4;
  const poleH = [22, 18, 26][variant % 3];
  ctx.fillStyle = '#c8ccd6';
  ctx.fillRect(cx - 2, baseY - poleH, 4, poleH);
  const dishCy = baseY - poleH - 2;
  ctx.save();
  ctx.translate(cx, dishCy);
  ctx.rotate(-0.5);
  ctx.fillStyle = '#e8e8ee';
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,130,150,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // blinking status light
  ctx.fillStyle = Math.sin(Date.now() / 300) > 0 ? '#ff5252' : 'rgba(255,82,82,0.3)';
  ctx.beginPath(); ctx.arc(cx, dishCy, 2, 0, Math.PI * 2); ctx.fill();
}

// A shallow moon crater — a flat ground decal, the space theme's secondary
// decoration (mirrors how the other themes mix in a second prop type).
function drawCrater(cx, sy, variant) {
  const baseY = sy - ISO_DY * 0.4;
  const sizes = [[20, 8], [16, 6], [24, 9]];
  const [rw, rh] = sizes[variant % sizes.length];
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 1, rw, rh, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 1, rw * 0.62, rh * 0.62, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, baseY - 1, rw, rh, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
}

function drawSnowman(cx, sy, variant) {
  const baseY = sy - ISO_DY * 0.4;
  const r1 = 12, r2 = 9, r3 = 6.5;
  const bottomCy = baseY - r1;
  const midCy    = baseY - r1 * 2 - r2 + 4;
  const headCy   = baseY - r1 * 2 - r2 * 2 + 2;

  ctx.fillStyle = '#fefeff';
  [[bottomCy, r1], [midCy, r2], [headCy, r3]].forEach(([cy, r]) => {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  });
  // soft shading on the sunward side
  ctx.fillStyle = 'rgba(120,150,180,0.16)';
  [[bottomCy, r1], [midCy, r2], [headCy, r3]].forEach(([cy, r]) => {
    ctx.beginPath(); ctx.arc(cx + r * 0.35, cy + r * 0.15, r * 0.8, 0, Math.PI * 2); ctx.fill();
  });
  // carrot nose + coal eyes
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(cx, headCy);
  ctx.lineTo(cx + 7, headCy + 1.4);
  ctx.lineTo(cx, headCy + 2.8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(cx - 2.2, headCy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 2.2, headCy - 2, 1.1, 0, Math.PI * 2); ctx.fill();
  // button row
  [-0.3, 0, 0.3].forEach(o => {
    ctx.beginPath(); ctx.arc(cx, midCy + o * 6, 1.2, 0, Math.PI * 2); ctx.fill();
  });
  // twig arms + a little scarf, alternating by variant for variety
  ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - r2, midCy); ctx.lineTo(cx - r2 - 8, midCy - (variant % 2 ? 8 : 4)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + r2, midCy); ctx.lineTo(cx + r2 + 8, midCy - (variant % 2 ? 4 : 8)); ctx.stroke();
  if (variant % 2 === 0) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(cx - r2 * 0.8, midCy + r2 - 2, r2 * 1.6, 3);
    ctx.fillRect(cx + r2 * 0.3, midCy + r2 - 2, 3, 8);
  }
}

// ─────────────────────────────────────────────
//  COIN PICKUP
// ─────────────────────────────────────────────
// A gently bobbing, spinning gold coin sitting on a lane. `seed` staggers
// the animation per-coin so a run of them doesn't pulse in lockstep.
function drawCoin(cx, sy, seed) {
  const baseY = sy - ISO_DY * 0.4;
  const bob   = Math.sin(Date.now() / 260 + seed) * 3;
  const r     = 11;
  const coinY = baseY - 15 + bob;

  // ground shadow, fixed at the tile surface (doesn't bob)
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 2, r * 0.75, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // squash horizontally to fake a lazy spin
  const spin = Math.abs(Math.sin(Date.now() / 500 + seed * 1.7));
  const rx   = r * (0.35 + spin * 0.65);

  ctx.save();
  ctx.fillStyle   = '#ffd54a';
  ctx.strokeStyle = '#dd9c00';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.ellipse(cx, coinY, rx, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // inner ring + glint read as a coin face even at this size
  ctx.fillStyle = '#fff1b8';
  ctx.beginPath();
  ctx.ellipse(cx, coinY, rx * 0.5, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.3, coinY - r * 0.35, Math.max(rx * 0.18, 0.6), r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─────────────────────────────────────────────
//  BLOCKING OBSTACLES  (one per theme)
// ─────────────────────────────────────────────
// A big boulder — the classic-meadow obstacle. Sized close to a full tile
// (not decoration-scale) so it unmistakably fills the lane it's blocking,
// with a wide ground shadow reinforcing that the whole tile is occupied.
function drawBoulder(cx, sy, variant) {
  const depth = 16;
  const baseY = sy - ISO_DY * 0.4;
  const sizes = [[44, 30], [40, 26], [48, 32]];
  const [rw, rh] = sizes[variant % sizes.length];
  // Deliberately a different family from the decorative rock prop
  // (drawRock, warm light gray #8f8f96) — a darker, cooler, mossy slate
  // so the two are never mistaken for one another at a glance.
  const cs = colorSet('#4f5750', 20, -24);
  // wide ground shadow signalling it occupies the whole tile, not just
  // a corner of it
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, rw * 0.78, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  drawBox(cx - rw / 2, baseY - rh, rw, rh, depth, cs.front, cs.top, cs.side);
  // a smaller second boulder tucked beside it, widening the silhouette —
  // kept inside the same tile column so it doesn't visually spill into
  // the next one and look like contact before the player is actually there
  const rw2 = rw * 0.38, rh2 = rh * 0.55;
  drawBox(cx + rw / 2 - 14, baseY - rh2, rw2, rh2, depth * 0.75, cs.front, cs.top, cs.side);
  // bold dark outline around the whole cluster's silhouette — the
  // decorative rock has no outline at all, so this alone keeps them
  // from being confused
  ctx.strokeStyle = 'rgba(20,22,18,0.55)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(cx - rw / 2, baseY - rh, rw, rh);
  ctx.strokeRect(cx + rw / 2 - 14, baseY - rh2, rw2, rh2);
  // crack detail
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - rw * 0.15, baseY - rh * 0.78);
  ctx.lineTo(cx + rw * 0.05, baseY - rh * 0.32);
  ctx.stroke();
  // moss/lichen patches — a texture the decorative rock never has
  ctx.fillStyle = 'rgba(122,168,90,0.5)';
  ctx.beginPath(); ctx.ellipse(cx - rw * 0.22, baseY - rh * 0.85, rw * 0.16, rh * 0.1, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + rw * 0.28, baseY - rh * 0.62, rw * 0.12, rh * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(cx - rw / 2 + 4, baseY - rh - (ISO_DY * depth / 14) * 0.5, rw * 0.28, 5);
}

// A big packed-snow ball — the winter obstacle. A crisp outline keeps it
// reading clearly against the theme's pale backdrop even at this size.
// Kept narrower than a full tile so it doesn't visually overlap the
// column next to it — that made blocking look like it kicked in before
// the penguin was actually touching anything.
function drawSnowball(cx, sy, variant) {
  const baseY = sy - ISO_DY * 0.4;
  const r  = [30, 26, 34][variant % 3];
  const cy = baseY - r;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150,180,210,0.22)';
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.25, r * 0.82, 0, Math.PI * 2); ctx.fill();
  // packed-snow seams
  ctx.strokeStyle = 'rgba(140,170,200,0.45)';
  ctx.lineWidth = 1.5;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, 0.3 + i * 0.55, 1.0 + i * 0.55);
    ctx.stroke();
  }
  // crisp outline
  ctx.strokeStyle = 'rgba(110,140,170,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

// A beached rowboat — the beach obstacle. A mast adds height so it reads
// as a real obstruction at a glance, not just a low shape on the sand.
function drawBoat(cx, sy, variant) {
  const baseY = sy - ISO_DY * 0.4;
  const bw = 52, bh = 26;
  const hulls = [['#c0392b', '#8f2a1c'], ['#2980b9', '#1f5f8a'], ['#e67e22', '#b3611a']];
  const [hullColor, hullDark] = hulls[variant % hulls.length];
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, bw * 0.58, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // hull
  ctx.fillStyle = hullColor;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2, baseY - bh * 0.32);
  ctx.lineTo(cx - bw / 2 + 11, baseY - bh);
  ctx.lineTo(cx + bw / 2 - 11, baseY - bh);
  ctx.lineTo(cx + bw / 2, baseY - bh * 0.32);
  ctx.closePath();
  ctx.fill();
  // interior shading
  ctx.fillStyle = hullDark;
  ctx.fillRect(cx - bw / 2 + 9, baseY - bh, bw - 18, bh * 0.34);
  // bench seat
  ctx.fillStyle = '#8d6e4a';
  ctx.fillRect(cx - 10, baseY - bh - 4, 20, 5);
  // rim trim
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - bw / 2 + 11, baseY - bh + 1);
  ctx.lineTo(cx + bw / 2 - 11, baseY - bh + 1);
  ctx.stroke();
  // mast + sail — extra silhouette height for visibility
  ctx.strokeStyle = '#6b4a2f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, baseY - bh);
  ctx.lineTo(cx, baseY - bh - 16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx, baseY - bh - 16);
  ctx.lineTo(cx + 12, baseY - bh - 8);
  ctx.lineTo(cx, baseY - bh - 4);
  ctx.closePath();
  ctx.fill();
}

// A rolling tangle of twigs — the desert hazard. Continuously spins in
// place while it drifts sideways across its lane. Sized and outlined to
// be unmistakable at a glance since touching it is lethal, not just a
// blocked hop.
function drawTumbleweed(cx, sy, seed) {
  const baseY = sy - ISO_DY * 0.4;
  const r     = 30;
  const bob   = Math.abs(Math.sin(Date.now() / 220 + seed)) * 4;
  const cy    = baseY - r - bob;
  const rot   = (Date.now() / 150 + seed) % (Math.PI * 2);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 2, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // bold silhouette outline behind the strands so it reads as one solid,
  // unmissable hazard rather than a loose sketch of twigs
  ctx.fillStyle = 'rgba(90,64,32,0.28)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,42,20,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.strokeStyle = '#6b4a20';
  ctx.lineWidth = 3.5;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.42, a, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(120,90,50,0.4)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
}

// ─────────────────────────────────────────────
//  PENGUIN  (chunky 3D block character)
// ─────────────────────────────────────────────
const BUMP_DURATION = 140; // ms
const BUMP_DIST      = 9;   // px nudge when a hop is blocked by an obstacle

function drawPlayer() {
  let sx = player.px;
  const sy = player.py - cameraY;
  let baseGroundY = sy + TILE - ISO_DY;

  if (player.squished) { drawSquished(sx, baseGroundY); return; }
  if (player.drowned)  { drawDrowned(sx, baseGroundY);  return; }

  // A quick nudge toward the blocked direction and back, so bumping into an
  // obstacle reads as "can't go that way" instead of the input silently
  // doing nothing.
  if (player.bumping) {
    const bt = (performance.now() - player.bumpStartTime) / BUMP_DURATION;
    if (bt >= 1) {
      player.bumping = false;
    } else {
      const amt = Math.sin(bt * Math.PI) * BUMP_DIST;
      if (player.bumpDir === 'left')  sx -= amt;
      if (player.bumpDir === 'right') sx += amt;
      if (player.bumpDir === 'up')    baseGroundY -= amt;
      if (player.bumpDir === 'down')  baseGroundY += amt;
    }
  }

  // Weightless themes (space) arc higher and hang longer — hopDuration is
  // already longer for them, so the same sine curve naturally takes more
  // real time to rise and fall. hopFloaty additionally flattens the curve
  // near its peak (a fractional power stays close to 1 for longer), so the
  // penguin visibly hangs at the top instead of just arcing through it —
  // low-gravity, not just a bigger normal hop.
  const hopPeak = activeTheme.hopArcHeight != null ? activeTheme.hopArcHeight : 18;
  let hopArc = 0;
  if (player.hopping) {
    const s = Math.sin(player.hopProgress * Math.PI);
    const floatPow = activeTheme.hopFloatPow != null ? activeTheme.hopFloatPow : 0.55;
    hopArc = (activeTheme.hopFloaty ? Math.pow(Math.max(s, 0), floatPow) : s) * hopPeak;
  }

  // Stand-height offset: 0 on solid ground, FLOAT_STAND_LIFT on a floating
  // log/ice so the penguin appears to rest on top of it (with clearance
  // from the front edge) instead of flush with the waterline. Animated
  // smoothly across the hop so landing on/off a float doesn't pop.
  let standLift;
  if (player.hopping) {
    standLift = lerp(player.liftFrom, player.liftTo, easeInOut(player.hopProgress));
  } else {
    standLift = player.onLog ? floatStandLift(getLane(player.worldRow)) : 0;
  }
  const groundY = baseGroundY - standLift;

  // Shadow on tile surface
  ctx.save();
  ctx.globalAlpha = 0.18 * (1 - hopArc / hopPeak * 0.5);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(sx + TILE / 2, groundY - ISO_DY * 0.5, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawPenguin(sx + TILE / 2, groundY, hopArc);
}

// cx = horizontal centre, groundY = y of the ground surface the penguin stands on
function drawPenguin(cx, groundY, hopArc) {
  const depth   = 8;
  const dir     = player.facingDir;
  const hopping = player.hopping;
  const t       = player.hopProgress;
  const wingFlap = hopping ? Math.sin(t * Math.PI * 2) * 6 : 0;
  const footBob  = hopping ? Math.abs(Math.sin(t * Math.PI * 2)) * 3 : 0;
  const lift     = hopArc;
  const theme    = activeTheme.key;

  ctx.save();
  ctx.translate(0, -lift);

  // ── Feet ──────────────────────────────────
  // Beach: flip-flop (bright), others: orange webbed feet
  if (theme === 'beach') {
    // Flip-flops — flat bright soles
    ctx.fillStyle = '#ff6b9d';
    ctx.fillRect(cx - 16, groundY - 4 + footBob,  13, 5);
    ctx.fillRect(cx + 3,  groundY - 4 - footBob,  13, 5);
    ctx.fillStyle = '#ff8fba';
    ctx.fillRect(cx - 13, groundY - 6 + footBob,   7, 2); // strap
    ctx.fillRect(cx + 6,  groundY - 6 - footBob,   7, 2);
  } else if (theme === 'space') {
    // Bulky white astronaut boots
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(cx - 16, groundY - 6 + footBob,  13, 6);
    ctx.fillRect(cx + 3,  groundY - 6 - footBob,  13, 6);
    ctx.fillStyle = '#b8bcc8';
    [-16, 3].forEach((ox, i) => {
      const bob = i === 0 ? footBob : -footBob;
      ctx.fillRect(cx + ox - 1, groundY - 1 + bob, 15, 2);
    });
  } else {
    ctx.fillStyle = '#f97316';
    ctx.fillRect(cx - 14, groundY - 5 + footBob,  11, 5);
    ctx.fillRect(cx + 3,  groundY - 5 - footBob,  11, 5);
    [-14, 3].forEach((ox, i) => {
      const bob = i === 0 ? footBob : -footBob;
      ctx.fillRect(cx + ox - 2, groundY - 1 + bob, 15, 3);
    });
  }

  // ── Body ──────────────────────────────────
  const bw = 30, bh = 28;
  const bx = cx - bw / 2;
  const by = groundY - bh;
  const bodyCs = colorSet('#1a1a2e', 20, -10);
  drawBox(bx, by, bw, bh, depth, bodyCs.front, bodyCs.top, bodyCs.side);

  // Belly patch
  ctx.fillStyle = '#fff5f0';
  ctx.beginPath();
  ctx.ellipse(cx, by + bh * 0.58, bw * 0.28, bh * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Outfit overlays on body ────────────────
  if (theme === 'winter') {
    // Fluffy white/grey jacket — wide block covering most of body
    const jCs = colorSet('#c8d8e8', 20, -15);
    drawBox(bx - 3, by + 4, bw + 6, bh - 8, depth + 2, jCs.front, jCs.top, jCs.side);
    // Jacket lapels / opening down centre
    ctx.fillStyle = '#fff5f0'; // belly still visible through opening
    ctx.beginPath();
    ctx.ellipse(cx, by + bh * 0.58, bw * 0.18, bh * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Fluffy cuff lines on jacket
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - 3, by + bh - 10); ctx.lineTo(bx + bw + 3, by + bh - 10); ctx.stroke();

  } else if (theme === 'beach') {
    // Halter bikini top — two smaller, rounded triangular cups sitting up
    // on the chest with a visible gap + tie knot between them, instead of
    // one oversized triangle stretching most of the way down the body.
    const cupTopY = by + bh * 0.12;
    const cupBotY = by + bh * 0.46;
    const cupMidY = (cupTopY + cupBotY) / 2;
    const cupSpan = bw * 0.32;   // outer reach of each cup
    const gap     = 3;           // gap between the cups at the sternum

    const drawCup = side => { // side: -1 = left cup, +1 = right cup
      const outerX = cx + side * (gap + cupSpan);
      const innerX = cx + side * gap;
      ctx.fillStyle = '#ff6b9d';
      ctx.beginPath();
      ctx.moveTo(outerX, cupTopY);
      ctx.quadraticCurveTo(cx + side * (gap + cupSpan * 0.5), cupBotY + 2, innerX, cupBotY);
      ctx.quadraticCurveTo(cx + side * (gap + cupSpan * 0.3), cupTopY + 4, outerX, cupTopY);
      ctx.closePath();
      ctx.fill();
      // soft fabric crease for a little shape/depth
      ctx.strokeStyle = 'rgba(180,50,90,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + side * (gap + cupSpan * 0.55), cupTopY + 4);
      ctx.quadraticCurveTo(cx + side * (gap + cupSpan * 0.35), cupMidY, innerX, cupBotY - 2);
      ctx.stroke();
      // small polka dots following the cup's curve
      ctx.fillStyle = '#fff';
      [0.28, 0.55, 0.8].forEach(f => {
        const px = outerX + (innerX - outerX) * (f * 0.75 + 0.1);
        const py = cupTopY + (cupBotY - cupTopY) * f;
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
      });
    };
    drawCup(-1);
    drawCup(1);

    // Centre tie knot between the cups
    ctx.fillStyle = '#e0568a';
    ctx.beginPath(); ctx.arc(cx, cupMidY, 2, 0, Math.PI * 2); ctx.fill();

    // Halter straps up to the neck
    ctx.strokeStyle = '#ff6b9d';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - gap - cupSpan * 0.4, cupTopY); ctx.lineTo(cx - 3, by - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + gap + cupSpan * 0.4, cupTopY); ctx.lineTo(cx + 3, by - 2); ctx.stroke();
    // Side ties around the ribcage
    ctx.beginPath(); ctx.moveTo(cx - gap - cupSpan, cupMidY); ctx.lineTo(bx - 5,      cupMidY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + gap + cupSpan, cupMidY); ctx.lineTo(bx + bw + 5, cupMidY); ctx.stroke();

  } else if (theme === 'desert') {
    // Brown duster coat — long, covers most of body, open at chest
    const coatCs = colorSet('#7a5230', 25, -20);
    // Left coat panel
    drawBox(bx - 4, by + 2, bw * 0.38, bh, depth + 1, coatCs.front, coatCs.top, coatCs.side);
    // Right coat panel
    drawBox(bx + bw * 0.62, by + 2, bw * 0.42, bh, depth + 1, coatCs.front, coatCs.top, coatCs.side);
    // Coat collar/lapel V shape
    ctx.fillStyle = shiftColor('#7a5230', 30);
    ctx.beginPath();
    ctx.moveTo(cx - 8, by + 2);
    ctx.lineTo(cx,     by + bh * 0.4);
    ctx.lineTo(cx + 8, by + 2);
    ctx.stroke();
    // Belly still shows between coat panels
    // Button row
    ctx.fillStyle = '#c4922a';
    [0.3, 0.52, 0.72].forEach(f => {
      ctx.beginPath(); ctx.arc(cx, by + bh * f, 2, 0, Math.PI * 2); ctx.fill();
    });

  } else if (theme === 'space') {
    // Puffy white spacesuit — wide block like the winter jacket, with a
    // chest control panel instead of a jacket opening.
    const jCs = colorSet('#e8e8ee', 15, -20);
    drawBox(bx - 3, by + 2, bw + 6, bh - 6, depth + 2, jCs.front, jCs.top, jCs.side);
    // suit seam
    ctx.strokeStyle = 'rgba(120,130,150,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx - 3, by + bh * 0.2); ctx.lineTo(bx + bw + 3, by + bh * 0.2); ctx.stroke();
    // chest control panel with little blinking lights
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(cx - 7, by + bh * 0.35, 14, 10);
    ctx.fillStyle = '#ff5252'; ctx.fillRect(cx - 5, by + bh * 0.37, 3, 3);
    ctx.fillStyle = '#4fc3f7'; ctx.fillRect(cx,     by + bh * 0.37, 3, 3);
    ctx.fillStyle = '#ffd54a'; ctx.fillRect(cx - 5, by + bh * 0.42, 8, 2);
  }

  // ── Wings ─────────────────────────────────
  const wingW = 8, wingH = 20;
  const lwx   = bx - wingW + 1;
  const rwx   = bx + bw - 1;

  // Winter: jacket sleeves (blue-grey, wider). Space: puffy suit sleeves.
  const wingColor = theme === 'winter' ? '#8fa8c0' : theme === 'space' ? '#e0e0ea' : '#12122a';
  const lwCs = colorSet(wingColor, 15, -10);

  ctx.save();
  ctx.translate(lwx + wingW / 2, by + bh * 0.4);
  ctx.rotate((-0.15 - wingFlap * 0.035) * Math.PI);
  ctx.translate(-(lwx + wingW / 2), -(by + bh * 0.4));
  const wWAdj = (theme === 'winter' || theme === 'space') ? wingW + 3 : wingW;
  drawBox(lwx, by + 4, wWAdj, wingH, depth * 0.5, lwCs.front, lwCs.top, lwCs.side);
  ctx.restore();

  ctx.save();
  ctx.translate(rwx + wingW / 2, by + bh * 0.4);
  ctx.rotate((0.15 + wingFlap * 0.035) * Math.PI);
  ctx.translate(-(rwx + wingW / 2), -(by + bh * 0.4));
  drawBox(rwx, by + 4, wWAdj, wingH, depth * 0.5, lwCs.front, lwCs.top, lwCs.side);
  ctx.restore();

  // ── Head ──────────────────────────────────
  const hw = 26, hh = 24;
  const hx = cx - hw / 2;
  const hy = by - hh + 2;
  const headCs = colorSet('#1a1a2e', 20, -10);
  drawBox(hx, hy, hw, hh, depth, headCs.front, headCs.top, headCs.side);

  // Cheeks
  ctx.fillStyle = 'rgba(255,182,193,0.6)';
  ctx.beginPath(); ctx.arc(hx + 5,      hy + hh * 0.6, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + hw - 5, hy + hh * 0.6, 5, 0, Math.PI * 2); ctx.fill();

  // Eyes (direction-aware)
  const eyeOff = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx + 3 + eyeOff, hy + 4, 8, 8);
  ctx.fillRect(hx + hw - 11 + eyeOff, hy + 4, 8, 8);
  ctx.fillStyle = '#111';
  ctx.fillRect(hx + 5 + eyeOff, hy + 6, 5, 5);
  ctx.fillRect(hx + hw - 9 + eyeOff, hy + 6, 5, 5);
  ctx.fillStyle = '#fff';
  ctx.fillRect(hx + 8 + eyeOff, hy + 6, 2, 2);
  ctx.fillRect(hx + hw - 6 + eyeOff, hy + 6, 2, 2);

  // Beach: heart sunglasses over eyes
  if (theme === 'beach') {
    // Large heart sunglasses — big dark frames covering most of the eye area
    const fW = 13, fH = 13;
    ctx.fillStyle = 'rgba(10,10,10,0.7)';
    ctx.fillRect(hx - 1 + eyeOff,       hy + 2, fW, fH);   // left frame
    ctx.fillRect(hx + hw - fW + 1 + eyeOff, hy + 2, fW, fH); // right frame
    // Pink heart lens on each frame
    const drawHeart = (hcx, hcy) => {
      ctx.fillStyle = '#ff6b9d';
      ctx.beginPath(); ctx.arc(hcx - 2.5, hcy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(hcx + 2.5, hcy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hcx - 6,  hcy + 2);
      ctx.lineTo(hcx,      hcy + 8);
      ctx.lineTo(hcx + 6,  hcy + 2);
      ctx.closePath(); ctx.fill();
      // Lens shine
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(hcx - 2, hcy - 1, 2, 0, Math.PI * 2); ctx.fill();
    };
    drawHeart(hx + fW * 0.5 - 1 + eyeOff,        hy + 6);
    drawHeart(hx + hw - fW * 0.5 + 1 + eyeOff,   hy + 6);
    // Thick bridge between lenses
    ctx.fillStyle = 'rgba(10,10,10,0.7)';
    ctx.fillRect(hx + fW - 1 + eyeOff, hy + 5, hw - fW * 2 + 2, 3);
    // Side arms
    ctx.fillRect(hx - 5 + eyeOff,      hy + 4, 5, 2); // left arm
    ctx.fillRect(hx + hw + eyeOff,     hy + 4, 5, 2); // right arm
  }

  // Beak
  ctx.fillStyle = '#f97316';
  const bkX = cx + eyeOff;
  ctx.fillRect(bkX - 5, hy + hh * 0.52, 10, 4);
  ctx.fillRect(bkX - 4, hy + hh * 0.52 + 4, 8, 3);
  ctx.fillRect(bkX - 3, hy + hh * 0.52 + 7, 6, 2);

  // ── Headwear (theme-specific) ──────────────
  if (theme === 'default') {
    // Purple beanie with pompom
    const hatW = 22, hatH = 12;
    const hatCs = colorSet('#6c5ce7', 25, -30);
    drawBox(cx - hatW / 2, hy - hatH, hatW, hatH, depth, hatCs.front, hatCs.top, hatCs.side);
    ctx.fillStyle = shiftColor('#6c5ce7', -20);
    ctx.fillRect(cx - hatW / 2 - 3, hy - hatH + hatH * 0.7, hatW + 6, 5);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, hy - hatH - 5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8b8ff';
    ctx.beginPath(); ctx.arc(cx, hy - hatH - 5, 4, 0, Math.PI * 2); ctx.fill();

  } else if (theme === 'winter') {
    // Ear-flap winter hat — main dome + two ear flaps
    const hatW = 26, hatH = 14;
    const hatCs = colorSet('#c0392b', 25, -30); // red hat
    // Main dome
    drawBox(cx - hatW / 2, hy - hatH, hatW, hatH, depth, hatCs.front, hatCs.top, hatCs.side);
    // White stripe band
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - hatW / 2, hy - 4, hatW, 4);
    // Left ear flap
    drawBox(cx - hatW / 2 - 5, hy - 4, 7, 12, depth * 0.6,
      shiftColor('#c0392b', -10), shiftColor('#c0392b', 15), shiftColor('#c0392b', -20));
    // Right ear flap
    drawBox(cx + hatW / 2 - 2, hy - 4, 7, 12, depth * 0.6,
      shiftColor('#c0392b', -10), shiftColor('#c0392b', 15), shiftColor('#c0392b', -20));
    // Pompom on top
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, hy - hatH - 5, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcdd2';
    ctx.beginPath(); ctx.arc(cx, hy - hatH - 5, 4, 0, Math.PI * 2); ctx.fill();

    // Red scarf — sits between head and body
    const scarfY = by - 2;
    const scarfCs = colorSet('#e53935', 20, -25);
    drawBox(bx - 4, scarfY, bw + 8, 7, depth + 2, scarfCs.front, scarfCs.top, scarfCs.side);
    // Scarf stripe pattern
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let xi = 0; xi < 5; xi++) {
      ctx.fillRect(bx - 4 + xi * (bw + 8) / 5, scarfY, 2, 7);
    }
    // Scarf tail hanging down left side
    drawBox(bx - 2, scarfY + 4, 6, 14, depth * 0.5,
      scarfCs.front, scarfCs.top, scarfCs.side);

  } else if (theme === 'beach') {
    // Wide floppy beach sun hat — flat wide brim + shallow round crown
    const crownW = 24, crownH = 8;
    const brimW  = crownW + 22, brimH = 4;
    // Crown — soft yellow straw colour
    const crownCs = colorSet('#f5d76e', 20, -20);
    drawBox(cx - crownW / 2, hy - crownH - brimH + 1, crownW, crownH, depth,
      crownCs.front, crownCs.top, crownCs.side);
    // Wide floppy brim
    const brimCs = colorSet('#e8c94a', 15, -18);
    drawBox(cx - brimW / 2, hy - brimH, brimW, brimH, depth * 0.5,
      brimCs.front, brimCs.top, brimCs.side);
    // Pink flower on the hat
    const fx = cx + crownW * 0.2;
    const fy = hy - crownH - brimH - 1;
    ctx.fillStyle = '#ff6b9d';
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0, -4, 2.5, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(fx, fy, 3, 0, Math.PI * 2); ctx.fill();

  } else if (theme === 'desert') {
    // Wide-brim cowboy hat
    const crownW = 22, crownH = 14;
    const brimW  = crownW + 20, brimH = 5;
    const hatCs  = colorSet('#8b5e3c', 25, -25);
    const brimCs = colorSet('#7a5230', 20, -20);
    // Crown
    drawBox(cx - crownW / 2, hy - crownH - brimH + 2, crownW, crownH, depth,
      hatCs.front, hatCs.top, hatCs.side);
    // Hat band
    ctx.fillStyle = '#c4922a';
    ctx.fillRect(cx - crownW / 2, hy - brimH - 2, crownW, 4);
    // Brim (wide flat block)
    drawBox(cx - brimW / 2, hy - brimH, brimW, brimH, depth * 0.5,
      brimCs.front, brimCs.top, brimCs.side);

  } else if (theme === 'space') {
    // Astronaut helmet — a rounded glass dome over the whole head (the
    // penguin's face still shows through), a collar ring at the neck, and
    // a small blinking comms antenna.
    const helmR  = hw * 0.68;
    const helmCx = cx, helmCy = hy + hh * 0.42;
    ctx.fillStyle = 'rgba(200,225,255,0.2)';
    ctx.beginPath(); ctx.arc(helmCx, helmCy, helmR, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(helmCx, helmCy, helmR, 0, Math.PI * 2); ctx.stroke();
    // glass shine
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(helmCx - helmR * 0.35, helmCy - helmR * 0.4, helmR * 0.22, helmR * 0.34, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // neck collar ring
    ctx.fillStyle = '#e8e8ee';
    ctx.fillRect(cx - hw / 2 - 2, hy + hh - 3, hw + 4, 6);
    // comms antenna with a blinking tip light
    ctx.strokeStyle = '#cfd6de';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + hw * 0.28, helmCy - helmR * 0.8);
    ctx.lineTo(cx + hw * 0.42, helmCy - helmR * 1.4);
    ctx.stroke();
    ctx.fillStyle = Math.sin(Date.now() / 260) > 0 ? '#ff5252' : 'rgba(255,82,82,0.35)';
    ctx.beginPath(); ctx.arc(cx + hw * 0.42, helmCy - helmR * 1.4, 2.2, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

function drawSquished(sx, groundY) {
  ctx.save();
  ctx.translate(sx + TILE / 2, groundY - 4);
  ctx.scale(1.5, 0.22);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(-18, -8, 36, 16);
  ctx.fillStyle = '#fff5f0';
  ctx.fillRect(-10, -4, 20, 8);
  ctx.restore();
  ctx.save();
  ctx.translate(sx + TILE / 2, groundY - 34);
  ctx.font = '16px serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate((i / 4) * Math.PI * 2 + Date.now() / 350);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText('★', 24, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawDrowned(sx, groundY) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, 0.9 - (Date.now() % 900) / 900);
  ctx.fillStyle = 'rgba(180,230,255,0.85)';
  const bt = Date.now() / 500;
  for (let i = 0; i < 4; i++) {
    const bx = sx + TILE / 2 - 15 + i * 10;
    const by = groundY - 20 - ((bt * 25 + i * 12) % 45);
    ctx.beginPath(); ctx.arc(bx, by, 3 + i % 2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(sx + TILE / 2, groundY);
  ctx.scale(0.8, 0.8);
  drawPenguin(0, 0, 0);
  ctx.restore();
}

// ─────────────────────────────────────────────
//  PARTICLES  (square pixel bits)
// ─────────────────────────────────────────────
const particles = [];

function spawnHopParticles() {
  const px = player.px + TILE / 2;
  const py = player.py - cameraY + TILE - TILE_FACE_H;
  const cols = activeTheme.particles;
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: px, y: py,
      vx: (Math.random() - 0.5) * 3.5,
      vy: -Math.random() * 2.5 - 0.5,
      life: 1,
      size: 4 + Math.random() * 4,
      color: cols[Math.floor(Math.random() * cols.length)],
    });
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.14;
    p.life -= 0.05;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = p.life * p.life;
    ctx.fillStyle = p.color;
    const s = p.size * p.life;
    ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────
//  BACKGROUND CLOUDS  (all themes, tinted per theme)
// ─────────────────────────────────────────────
let clouds = [];

function initClouds() {
  clouds = [];
  const count = 6 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    clouds.push({
      x     : Math.random() * W,
      y     : 18 + Math.random() * 90,
      scale : 0.55 + Math.random() * 0.9,
      speed : 0.06 + Math.random() * 0.1,
    });
  }
}

function updateClouds() {
  for (const c of clouds) {
    c.x += c.speed;
    if (c.x - 70 * c.scale > W) c.x = -70 * c.scale;
  }
}

function drawClouds() {
  const theme = activeTheme.key;
  const color = theme === 'desert' ? 'rgba(255,250,240,0.55)'
              : theme === 'winter' ? 'rgba(255,255,255,0.92)'
              : theme === 'beach'  ? 'rgba(255,255,255,0.85)'
              : theme === 'space'  ? 'rgba(180,140,255,0.22)'  // distant nebula wisps
              :                      'rgba(255,255,255,0.8)';
  ctx.save();
  ctx.fillStyle = color;
  for (const c of clouds) {
    const s = c.scale;
    ctx.beginPath();
    ctx.ellipse(c.x,          c.y,        26 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 22 * s, c.y + 4 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 20 * s, c.y + 5 * s, 18 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  AMBIENT WEATHER  (theme-specific foreground touches)
// ─────────────────────────────────────────────
let ambientParticles = [];

function initAmbientParticles() {
  ambientParticles = [];
  const theme = activeTheme.key;

  if (theme === 'winter') {
    for (let i = 0; i < 45; i++) {
      ambientParticles.push({
        kind: 'snow', x: Math.random() * W, y: Math.random() * H,
        r: 1.4 + Math.random() * 2.4, vy: 0.35 + Math.random() * 0.55,
        vx: (Math.random() - 0.5) * 0.3, sway: Math.random() * Math.PI * 2,
      });
    }
  } else if (theme === 'desert') {
    for (let i = 0; i < 26; i++) {
      ambientParticles.push({
        kind: 'dust', x: Math.random() * W, y: Math.random() * H * 0.75,
        r: 1 + Math.random() * 1.8, vx: 0.35 + Math.random() * 0.4,
        vy: (Math.random() - 0.5) * 0.08,
      });
    }
  } else if (theme === 'default') {
    for (let i = 0; i < 22; i++) {
      ambientParticles.push({
        kind: 'pollen', x: Math.random() * W, y: Math.random() * H,
        r: 1.8 + Math.random() * 1.8, vy: -(0.12 + Math.random() * 0.18),
        vx: (Math.random() - 0.5) * 0.35, sway: Math.random() * Math.PI * 2,
      });
    }
  } else if (theme === 'beach') {
    for (let i = 0; i < 3; i++) {
      ambientParticles.push({
        kind: 'bird', x: Math.random() * W, y: 30 + Math.random() * 90,
        vx: 0.28 + Math.random() * 0.3, flap: Math.random() * Math.PI * 2,
      });
    }
  } else if (theme === 'space') {
    for (let i = 0; i < 70; i++) {
      ambientParticles.push({
        kind: 'star', x: Math.random() * W, y: Math.random() * H * 0.85,
        r: 0.8 + Math.random() * 1.6, twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
}

function updateAmbientParticles() {
  for (const p of ambientParticles) {
    if (p.kind === 'bird') {
      p.x += p.vx;
      p.flap += 0.15;
      if (p.x > W + 30) p.x = -30;
      continue;
    }
    if (p.kind === 'star') continue; // fixed in place, only twinkles on draw
    p.x += p.vx + (p.sway !== undefined ? Math.sin(Date.now() / 800 + p.sway) * 0.15 : 0);
    p.y += p.vy;
    if (p.y > H + 6) p.y = -6;
    if (p.y < -6)    p.y = H + 6;
    if (p.x > W + 6) p.x = -6;
    if (p.x < -6)    p.x = W + 6;
  }
}

function drawAmbientParticles() {
  ctx.save();
  for (const p of ambientParticles) {
    if (p.kind === 'bird') {
      ctx.strokeStyle = 'rgba(50,50,60,0.55)';
      ctx.lineWidth = 2;
      const flapY = Math.sin(p.flap) * 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 8, p.y - flapY);
      ctx.quadraticCurveTo(p.x, p.y + 4, p.x + 8, p.y - flapY);
      ctx.stroke();
    } else if (p.kind === 'snow') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'dust') {
      ctx.fillStyle = 'rgba(220,190,140,0.45)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'pollen') {
      ctx.fillStyle = 'rgba(255,244,200,0.7)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, Date.now() / 600 + p.sway, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'star') {
      const tw = 0.5 + Math.sin(Date.now() / 500 + p.twinkle) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${(0.3 + tw * 0.7).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
//  GAME LOOP
// ─────────────────────────────────────────────
let prevHopping = false;

function gameLoop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;

  if (gameState === 'playing' && player.hopping && !prevHopping) spawnHopParticles();
  prevHopping = player.hopping;

  update(dt);
  updateClouds();
  updateAmbientParticles();
  draw();
  requestAnimationFrame(gameLoop);
}

initClouds();
initAmbientParticles();
requestAnimationFrame(ts => { lastTime = ts; gameLoop(ts); });

// ─────────────────────────────────────────────
//  THEME SWITCHING  (sidebar buttons)
// ─────────────────────────────────────────────
const themeLabel = document.getElementById('frame-theme-label');
const sidebarHS  = document.getElementById('sidebar-highscore');
const sidebarBestCoins = document.getElementById('sidebar-best-coins');

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.theme;
    if (!THEMES[key]) return;

    // Update active theme
    activeTheme = THEMES[key];

    // Always start a fresh game on theme switch
    startGame();

    // Update sidebar active state
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update frame title bar label
    themeLabel.textContent = activeTheme.name;
  });
});

// Keep sidebar high-score in sync
function updateSidebarHS() {
  sidebarHS.textContent = highScore > 0 ? highScore : '—';
}
