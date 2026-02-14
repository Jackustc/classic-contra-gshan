const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const deathsEl = document.getElementById("deaths");
const megaStatusEl = document.getElementById("mega-status");
const statusEl = document.getElementById("status");
const playerNameInput = document.getElementById("player-name");
const setPlayerBtn = document.getElementById("set-player-btn");
const currentPlayerEl = document.getElementById("current-player");
const restartBtn = document.getElementById("restart-btn");
const pauseBtn = document.getElementById("pause-btn");
const controlBtns = document.querySelectorAll("[data-action]");

const GROUND_Y = 450;
const GRAVITY = 0.8;
const WORLD_WIDTH = 5000;
const MAX_PLAYER_NAME = 20;

const PLAYER_NAME_KEY = "contra_player_name_v1";
const HIGH_SCORE_KEY = "contra_high_score_v1";
const STAR_COUNT = 90;
const TREE_COUNT = 36;
const MEGA_COOLDOWN_FRAMES = 600;
const stars = [];
const PLAYER_SPRITE = [
  "................",
  "....rrrrrr......",
  "...rrhhhhrr.....",
  "...rhhsshhrr....",
  "...rhhsshhhr....",
  "...rrhsshhrr....",
  "....rrrrrrrr....",
  "...ttttbbtt.....",
  "..ttttbbbbtt....",
  "..tttbbbbbbt....",
  "..tttbbbbbbt....",
  "..tttbbbbbbt....",
  "...ttbbbbtt.....",
  "...ttbbbbtt.....",
  "..ss.ttbb..ss...",
  "..ss..tt...ss...",
  "..pp..pp...pp...",
  ".ppp..pp..ppp...",
  ".pp....p..pp....",
  ".pp....p..pp....",
  "..k....k...k....",
  "..k....k...k....",
  "................",
  "................",
];

const PLAYER_COLORS = {
  r: "#d43b2f", // headband/hair red
  h: "#402519", // dark hair shadow
  s: "#f4cf9f", // skin
  t: "#2d5fd6", // blue shirt
  b: "#223d8e", // dark blue shade
  p: "#4d49d8", // pants
  k: "#1c1c1c", // boots
};

for (let i = 0; i < STAR_COUNT; i += 1) {
  // Deterministic pseudo-random distribution to keep background stable.
  const t = (i * 137.13) % 997;
  stars.push({
    x: (t * 37) % WORLD_WIDTH,
    y: 20 + ((t * 53) % 200),
    r: 1 + ((t * 7) % 2),
  });
}

const state = {
  playerName: "Player",
  score: 0,
  highScore: 0,
  deaths: 0,
  paused: false,
  cameraX: 0,
  keys: { left: false, right: false },
  player: null,
  bullets: [],
  enemies: [],
  enemySpawnTimer: 0,
  respawnTimer: 0,
  megaCooldown: 0,
  megaFlash: 0,
  lastTs: 0,
};

function normalizePlayerName(name) {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed.slice(0, MAX_PLAYER_NAME) : "Player";
}

function loadPlayerName() {
  const stored = localStorage.getItem(PLAYER_NAME_KEY);
  state.playerName = normalizePlayerName(stored || "Player");
  playerNameInput.value = state.playerName;
  currentPlayerEl.textContent = state.playerName;
}

function savePlayerName() {
  state.playerName = normalizePlayerName(playerNameInput.value);
  playerNameInput.value = state.playerName;
  currentPlayerEl.textContent = state.playerName;
  localStorage.setItem(PLAYER_NAME_KEY, state.playerName);
}

function loadHighScore() {
  const raw = Number(localStorage.getItem(HIGH_SCORE_KEY));
  state.highScore = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
}

function saveHighScoreIfNeeded() {
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem(HIGH_SCORE_KEY, String(state.highScore));
  }
}

function createPlayer() {
  return {
    x: 120,
    y: GROUND_Y - 58,
    w: 32,
    h: 58,
    vx: 0,
    vy: 0,
    speed: 4.2,
    onGround: true,
    facing: 1,
    shootCooldown: 0,
  };
}

function restartGame() {
  state.score = 0;
  state.deaths = 0;
  state.cameraX = 0;
  state.bullets = [];
  state.enemies = [];
  state.enemySpawnTimer = 0;
  state.respawnTimer = 0;
  state.megaCooldown = 0;
  state.megaFlash = 0;
  state.paused = false;
  state.player = createPlayer();
  state.lastTs = 0;
  renderHud();
}

function playerRect() {
  return state.player
    ? { x: state.player.x, y: state.player.y, w: state.player.w, h: state.player.h }
    : null;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function spawnEnemy() {
  const spawnX = state.cameraX + canvas.width + 80 + Math.random() * 300;
  state.enemies.push({
    x: Math.min(spawnX, WORLD_WIDTH - 40),
    y: GROUND_Y - 48,
    w: 34,
    h: 48,
    vx: -(1.2 + Math.random() * 1.2),
  });
}

function shoot() {
  if (!state.player || state.player.shootCooldown > 0) {
    return;
  }
  const dir = state.player.facing;
  state.bullets.push({
    x: state.player.x + (dir > 0 ? state.player.w : -8),
    y: state.player.y + 22,
    w: 10,
    h: 4,
    vx: dir * 8.5,
  });
  state.player.shootCooldown = 12;
}

function bigShoot() {
  if (state.megaCooldown > 0) {
    return;
  }
  const left = state.cameraX - 10;
  const right = state.cameraX + canvas.width + 10;
  let killed = 0;
  const survivors = [];
  for (const e of state.enemies) {
    if (e.x + e.w >= left && e.x <= right) {
      killed += 1;
    } else {
      survivors.push(e);
    }
  }
  state.enemies = survivors;
  if (killed > 0) {
    state.score += killed * 100;
  }
  state.megaCooldown = MEGA_COOLDOWN_FRAMES;
  state.megaFlash = 10;
}

function killPlayer() {
  state.player = null;
  state.respawnTimer = 45;
  state.deaths += 1; // unlimited lives: only track death count
}

function updatePlayer() {
  const p = state.player;
  if (!p) {
    return;
  }

  if (state.keys.left) {
    p.vx = -p.speed;
    p.facing = -1;
  } else if (state.keys.right) {
    p.vx = p.speed;
    p.facing = 1;
  } else {
    p.vx = 0;
  }

  p.x += p.vx;
  p.vy += GRAVITY;
  p.y += p.vy;

  if (p.y + p.h >= GROUND_Y) {
    p.y = GROUND_Y - p.h;
    p.vy = 0;
    p.onGround = true;
  } else {
    p.onGround = false;
  }

  p.x = Math.max(0, Math.min(WORLD_WIDTH - p.w, p.x));
  p.shootCooldown = Math.max(0, p.shootCooldown - 1);

  const targetCam = p.x - canvas.width * 0.35;
  state.cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, targetCam));
}

function updateBullets() {
  for (const b of state.bullets) {
    b.x += b.vx;
  }
  state.bullets = state.bullets.filter((b) => b.x > state.cameraX - 80 && b.x < state.cameraX + canvas.width + 80);
}

function updateEnemies() {
  for (const e of state.enemies) {
    e.x += e.vx;
  }
  state.enemies = state.enemies.filter((e) => e.x + e.w > state.cameraX - 100);
}

function handleCollisions() {
  if (!state.player) {
    return;
  }

  const pRect = playerRect();
  for (const e of state.enemies) {
    if (overlaps(pRect, e)) {
      killPlayer();
      return;
    }
  }

  const aliveEnemies = [];
  for (const e of state.enemies) {
    let hit = false;
    for (const b of state.bullets) {
      if (overlaps(e, b)) {
        hit = true;
        b.x = -9999;
        state.score += 100;
        break;
      }
    }
    if (!hit) {
      aliveEnemies.push(e);
    }
  }
  state.enemies = aliveEnemies;
  state.bullets = state.bullets.filter((b) => b.x > -5000);
}

function update() {
  if (state.paused) {
    return;
  }

  if (state.megaCooldown > 0) {
    state.megaCooldown -= 1;
  }
  if (state.megaFlash > 0) {
    state.megaFlash -= 1;
  }

  if (!state.player) {
    state.respawnTimer -= 1;
    if (state.respawnTimer <= 0) {
      state.player = createPlayer();
      state.player.x = Math.max(60, state.cameraX + 50);
    }
  } else {
    updatePlayer();
    updateBullets();
    updateEnemies();
    handleCollisions();
  }

  state.enemySpawnTimer -= 1;
  if (state.enemySpawnTimer <= 0) {
    spawnEnemy();
    state.enemySpawnTimer = 40 + Math.floor(Math.random() * 35);
  }

  saveHighScoreIfNeeded();
  renderHud();
}

function drawBackground() {
  ctx.fillStyle = "#02040c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Stars
  ctx.fillStyle = "#d8d8d8";
  for (const s of stars) {
    const sx = s.x - state.cameraX * 0.2;
    const wrappedX = ((sx % (canvas.width + 100)) + (canvas.width + 100)) % (canvas.width + 100) - 50;
    ctx.fillRect(wrappedX, s.y, s.r, s.r);
  }

  // Moon / bright mountain highlight
  ctx.fillStyle = "#e6e6e6";
  ctx.beginPath();
  ctx.moveTo(60, 170);
  ctx.lineTo(130, 40);
  ctx.lineTo(210, 170);
  ctx.closePath();
  ctx.fill();

  // Far mountain range
  ctx.fillStyle = "#203322";
  ctx.beginPath();
  ctx.moveTo(-40, GROUND_Y - 140);
  ctx.lineTo(80, GROUND_Y - 230);
  ctx.lineTo(190, GROUND_Y - 130);
  ctx.lineTo(330, GROUND_Y - 250);
  ctx.lineTo(480, GROUND_Y - 125);
  ctx.lineTo(620, GROUND_Y - 240);
  ctx.lineTo(780, GROUND_Y - 120);
  ctx.lineTo(canvas.width + 60, GROUND_Y - 120);
  ctx.lineTo(canvas.width + 60, GROUND_Y);
  ctx.lineTo(-40, GROUND_Y);
  ctx.closePath();
  ctx.fill();

  // Jungle tree trunks and canopy
  for (let i = 0; i < TREE_COUNT; i += 1) {
    const base = i * 180;
    const x = base - state.cameraX * 0.55;
    const sx = ((x % (canvas.width + 220)) + (canvas.width + 220)) % (canvas.width + 220) - 110;
    const trunkH = 110 + (i % 4) * 18;
    ctx.fillStyle = "#2f4e21";
    ctx.fillRect(sx + 20, GROUND_Y - trunkH, 14, trunkH);
    ctx.fillRect(sx + 40, GROUND_Y - trunkH + 12, 10, trunkH - 12);
    ctx.fillStyle = "#5f9f35";
    ctx.fillRect(sx - 8, GROUND_Y - trunkH - 18, 70, 18);
  }

  // Mid bushes
  ctx.fillStyle = "#6ea92d";
  for (let x = -20; x < canvas.width + 40; x += 38) {
    ctx.fillRect(x, GROUND_Y - 48, 34, 18);
    ctx.fillRect(x + 6, GROUND_Y - 60, 26, 12);
  }

  // Ground top grass strip
  ctx.fillStyle = "#8fc82f";
  ctx.fillRect(0, GROUND_Y - 16, canvas.width, 16);
  ctx.fillStyle = "#4d8a1f";
  for (let x = 0; x < canvas.width; x += 26) {
    ctx.fillRect(x + ((x / 13) % 3), GROUND_Y - 20, 10, 4);
  }

  // Rocky terrain
  for (let x = -40; x < canvas.width + 80; x += 56) {
    ctx.fillStyle = "#8f7a2a";
    ctx.fillRect(x, GROUND_Y, 56, canvas.height - GROUND_Y);
    ctx.fillStyle = "#d39e23";
    ctx.fillRect(x + 5, GROUND_Y + 8, 18, 10);
    ctx.fillRect(x + 28, GROUND_Y + 20, 20, 8);
    ctx.fillRect(x + 12, GROUND_Y + 36, 30, 9);
    ctx.fillStyle = "#4d3f13";
    ctx.fillRect(x + 1, GROUND_Y + 2, 6, 4);
    ctx.fillRect(x + 26, GROUND_Y + 14, 5, 4);
  }

  if (state.megaFlash > 0) {
    ctx.fillStyle = "rgba(255, 255, 220, 0.35)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawPixelSprite(x, y, sprite, palette, scale, facing) {
  const w = sprite[0].length;
  ctx.save();
  if (facing < 0) {
    ctx.translate(x + w * scale, y);
    ctx.scale(-1, 1);
    x = 0;
    y = 0;
  }
  for (let row = 0; row < sprite.length; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const key = sprite[row][col];
      if (key === ".") {
        continue;
      }
      ctx.fillStyle = palette[key];
      ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
  ctx.restore();
}

function drawPlayer() {
  if (!state.player) {
    return;
  }
  const p = state.player;
  const sx = p.x - state.cameraX;
  const px = sx;
  const py = p.y + 6;
  drawPixelSprite(px, py, PLAYER_SPRITE, PLAYER_COLORS, 2, p.facing);

  // Rifle aligned to sprite stance.
  const gunBaseX = p.facing > 0 ? px + 24 : px - 8;
  ctx.fillStyle = "#121212";
  ctx.fillRect(gunBaseX, py + 20, 14, 4);
  ctx.fillRect(gunBaseX + (p.facing > 0 ? 12 : -2), py + 19, 4, 2);
  ctx.fillStyle = "#8a8a8a";
  ctx.fillRect(gunBaseX + 4, py + 21, 4, 2);
}

function drawBullets() {
  ctx.fillStyle = "#ffd34d";
  for (const b of state.bullets) {
    ctx.fillRect(b.x - state.cameraX, b.y, b.w, b.h);
  }
}

function drawEnemies() {
  for (const e of state.enemies) {
    const sx = e.x - state.cameraX;
    ctx.fillStyle = "#cf3a2d";
    ctx.fillRect(sx + 8, e.y + 18, 16, 16);
    ctx.fillStyle = "#3a8f33";
    ctx.fillRect(sx + 8, e.y + 34, 8, 14);
    ctx.fillRect(sx + 16, e.y + 34, 8, 14);
    ctx.fillStyle = "#f0cf9d";
    ctx.fillRect(sx + 10, e.y + 8, 12, 10);
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(sx + 5, e.y + 23, 8, 3);
    ctx.fillRect(sx + 22, e.y + 23, 8, 3);
  }
}

function drawRespawnText() {
  if (state.player) {
    return;
  }
  ctx.fillStyle = "#1a1a1a";
  ctx.font = "24px sans-serif";
  ctx.fillText("Respawning...", canvas.width / 2 - 70, 120);
}

function renderHud() {
  scoreEl.textContent = String(state.score);
  highScoreEl.textContent = String(state.highScore);
  deathsEl.textContent = String(state.deaths);
  if (state.megaCooldown <= 0) {
    megaStatusEl.textContent = "Ready";
  } else {
    megaStatusEl.textContent = `${Math.ceil(state.megaCooldown / 60)}s`;
  }
  statusEl.textContent = state.paused ? "Paused" : "Running";
  pauseBtn.textContent = state.paused ? "Resume" : "Pause";
}

function render() {
  drawBackground();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawRespawnText();
}

function frame(ts) {
  state.lastTs = ts;
  update();
  render();
  requestAnimationFrame(frame);
}

function jump() {
  if (!state.player) {
    return;
  }
  if (state.player.onGround) {
    state.player.vy = -13.5;
    state.player.onGround = false;
  }
}

function handleAction(action, pressed) {
  if (action === "left") {
    state.keys.left = pressed;
  } else if (action === "right") {
    state.keys.right = pressed;
  } else if (action === "jump" && pressed) {
    jump();
  } else if (action === "shoot" && pressed) {
    shoot();
  } else if (action === "bigshoot" && pressed) {
    bigShoot();
  }
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      handleAction("left", true);
    } else if (key === "arrowright" || key === "d") {
      event.preventDefault();
      handleAction("right", true);
    } else if (key === "arrowup" || key === "w" || key === " ") {
      event.preventDefault();
      handleAction("jump", true);
    } else if (key === "j") {
      event.preventDefault();
      handleAction("shoot", true);
    } else if (key === "k") {
      event.preventDefault();
      handleAction("bigshoot", true);
    } else if (key === "p") {
      event.preventDefault();
      state.paused = !state.paused;
      renderHud();
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowleft" || key === "a") {
      handleAction("left", false);
    } else if (key === "arrowright" || key === "d") {
      handleAction("right", false);
    }
  });
}

function bindTouchButtons() {
  for (const btn of controlBtns) {
    const action = btn.dataset.action;
    if (action === "left" || action === "right") {
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        handleAction(action, true);
      });
      btn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        handleAction(action, false);
      });
      btn.addEventListener("pointerleave", () => handleAction(action, false));
      btn.addEventListener("pointercancel", () => handleAction(action, false));
    } else {
      btn.addEventListener("click", () => handleAction(action, true));
    }
  }
}

setPlayerBtn.addEventListener("click", savePlayerName);
playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    savePlayerName();
  }
});
restartBtn.addEventListener("click", restartGame);
pauseBtn.addEventListener("click", () => {
  state.paused = !state.paused;
  renderHud();
});

loadPlayerName();
loadHighScore();
restartGame();
bindKeyboard();
bindTouchButtons();
requestAnimationFrame(frame);
