const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("high-score");
const deathsEl = document.getElementById("deaths");
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
  ctx.fillStyle = "#84b9ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#95ca66";
  ctx.fillRect(0, GROUND_Y - 12, canvas.width, canvas.height - GROUND_Y + 12);

  ctx.fillStyle = "#5d8f3f";
  for (let i = 0; i < 30; i += 1) {
    const x = ((i * 180 - (state.cameraX * 0.6)) % (canvas.width + 220)) - 40;
    ctx.fillRect(x, GROUND_Y - 60, 20, 48);
  }
}

function drawPlayer() {
  if (!state.player) {
    return;
  }
  const p = state.player;
  const sx = p.x - state.cameraX;
  ctx.fillStyle = "#1d3b8f";
  ctx.fillRect(sx, p.y, p.w, p.h);
  ctx.fillStyle = "#f4cfa1";
  ctx.fillRect(sx + 8, p.y + 6, 16, 12);
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
    ctx.fillStyle = "#b3342d";
    ctx.fillRect(sx, e.y, e.w, e.h);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(sx + 8, e.y + 6, 18, 10);
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
