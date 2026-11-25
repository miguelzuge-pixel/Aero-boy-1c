/*
  NEON SURVIVOR
  Jogo de sobrevivência futurista com p5.js
  Controles: WASD/setas, mouse, clique e ESC.
*/

const W = 960;
const H = 640;
const FORM_URL = "https://forms.gle/kUsXodRwYiZZPNaY6";

let gameState = "menu";
let player;
let bullets = [];
let enemies = [];
let particles = [];
let pickups = [];
let qrCode;
// =========================================
// CONTROLES PARA CELULAR
// =========================================

const isTouchDevice =
  ("ontouchstart" in window) ||
  (navigator.maxTouchPoints > 0);

let touchMoveX = 0;
let touchMoveY = 0;
let touchFire = false;

let touchJoystickId = null;
let touchOriginX = 105;
let touchOriginY = H - 105;

let score = 0;
let elapsed = 0;
let spawnTimer = 0;
let shake = 0;
let lastTime = 0;
let upgradeChoices = [];
let audioCtx = null;
let soundEnabled = true;

const COLORS = {
  cyan: [65, 245, 255],
  pink: [255, 65, 210],
  yellow: [255, 225, 90],
  red: [255, 65, 100],
  green: [90, 255, 165],
  white: [235, 250, 255]
};

function preload() {
  qrCode = loadImage("qrcode_docs.google.com.png");
}

function setup() {
  createCanvas(W, H);
  pixelDensity(1);

  textFont("monospace");
  frameRate(60);
  resetGame();
  gameState = "menu";
}

function resetGame() {
  player = {
    x: W / 2,
    y: H / 2,
    r: 13,
    speed: 245,
    hp: 100,
    maxHp: 100,
    fireRate: 0.20,
    fireTimer: 0,
    damage: 25,
    bulletSpeed: 650,
    multishot: 1,
    xp: 0,
    nextXp: 5,
    level: 1,
    invulnerable: 0
  };

  bullets = [];
  enemies = [];
  particles = [];
  pickups = [];

  score = 0;
  elapsed = 0;
  spawnTimer = 0.5;
  shake = 0;
  upgradeChoices = [];
}

function draw() {
  // Delta time mantém a movimentação consistente.
  let dt = min(deltaTime / 1000, 0.033);

  drawBackground();

  if (gameState === "playing") {
    updateGame(dt);
  }

  // Tremor aplicado somente ao mundo do jogo.
  push();
  if (shake > 0) {
    translate(random(-shake, shake), random(-shake, shake));
    shake = max(0, shake - 35 * dt);
  }

  drawPickups();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawParticles();
  pop();

drawHUD();

drawTouchControls();

  if (gameState === "menu") drawMenu();
  if (gameState === "paused") drawPause();
  if (gameState === "levelup") drawLevelUp();
  if (gameState === "gameover") drawGameOver();

  lastTime = millis();
}

// --------------------------------------------------
// CENÁRIO E GRADE NEON
// --------------------------------------------------

function drawBackground() {
  background(5, 8, 20);

  // Gradiente simulado por círculos transparentes.
  noStroke();
  for (let i = 8; i >= 1; i--) {
    fill(10, 25, 55, 4);
    ellipse(W / 2, H / 2, i * 145, i * 100);
  }

  stroke(35, 95, 125, 35);
  strokeWeight(1);

  let grid = 40;
  let offset = (elapsed * 12) % grid;

  for (let x = -grid + offset; x < W + grid; x += grid) {
    line(x, 0, x, H);
  }

  for (let y = -grid + offset; y < H + grid; y += grid) {
    line(0, y, W, y);
  }

  // Moldura da arena.
  noFill();
  stroke(50, 220, 255, 110);
  strokeWeight(2);
  rect(8, 8, W - 16, H - 16, 8);

  stroke(255, 60, 210, 100);
  strokeWeight(1);
  rect(15, 15, W - 30, H - 30, 6);
}

// --------------------------------------------------
// ATUALIZAÇÃO PRINCIPAL
// --------------------------------------------------

function updateGame(dt) {
  elapsed += dt;

  updatePlayer(dt);
  updateShooting(dt);
  updateBullets(dt);
  updateSpawning(dt);
  updateEnemies(dt);
  updatePickups(dt);
  updateParticles(dt);
  checkCollisions();
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;

  // CONTROLES DE PC
  if (keyIsDown(65) || keyIsDown(LEFT_ARROW)) dx--;
  if (keyIsDown(68) || keyIsDown(RIGHT_ARROW)) dx++;
  if (keyIsDown(87) || keyIsDown(UP_ARROW)) dy--;
  if (keyIsDown(83) || keyIsDown(DOWN_ARROW)) dy++;

  // CONTROLES DE CELULAR
  dx += touchMoveX;
  dy += touchMoveY;

  // Normalização
  let mag = Math.hypot(dx, dy);

  if (mag > 1) {
    dx /= mag;
    dy /= mag;
  }

  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;

  player.x = constrain(player.x, 27, W - 27);
  player.y = constrain(player.y, 27, H - 27);

  player.fireTimer -= dt;
  player.invulnerable = max(
    0,
    player.invulnerable - dt
  );
}

function updateShooting(dt) {
  let firing = mouseIsPressed || touchFire;

  if (!firing || gameState !== "playing") return;
  if (player.fireTimer > 0) return;

  player.fireTimer = player.fireRate;

  let angle;

  if (touchFire) {
    angle = getNearestEnemyAngle();
  } else {
    angle = atan2(
      mouseY - player.y,
      mouseX - player.x
    );
  }

  let spread = 0.14;

  for (let i = 0; i < player.multishot; i++) {
    let offset =
      (i - (player.multishot - 1) / 2) * spread;

    let a = angle + offset;

    bullets.push({
      x: player.x + cos(a) * 19,
      y: player.y + sin(a) * 19,
      vx: cos(a) * player.bulletSpeed,
      vy: sin(a) * player.bulletSpeed,
      r: 4,
      damage: player.damage,
      life: 1.5
    });
  }

  playTone(440, 0.035, "square", 0.025);

  burst(
    player.x + cos(angle) * 20,
    player.y + sin(angle) * 20,
    COLORS.cyan,
    3,
    65
  );
}

function getNearestEnemyAngle() {
  if (enemies.length === 0) {
    return 0;
  }

  let nearest = enemies[0];
  let shortest = Infinity;

  for (let e of enemies) {
    let d = dist(
      player.x,
      player.y,
      e.x,
      e.y
    );

    if (d < shortest) {
      shortest = d;
      nearest = e;
    }
  }

  return atan2(
    nearest.y - player.y,
    nearest.x - player.x
  );
}

function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (
      b.life <= 0 ||
      b.x < -20 || b.x > W + 20 ||
      b.y < -20 || b.y > H + 20
    ) {
      bullets.splice(i, 1);
    }
  }
}

// --------------------------------------------------
// INIMIGOS
// --------------------------------------------------

function updateSpawning(dt) {
  spawnTimer -= dt;

  // A dificuldade aumenta gradualmente.
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = max(0.30, 1.05 - elapsed * 0.008);
  }
}

function spawnEnemy() {
  let side = floor(random(4));
  let x, y;

  if (side === 0) { x = random(W); y = -25; }
  if (side === 1) { x = W + 25; y = random(H); }
  if (side === 2) { x = random(W); y = H + 25; }
  if (side === 3) { x = -25; y = random(H); }

  let roll = random();
  let type = roll < 0.68 ? "normal" :
             roll < 0.90 ? "fast" : "tank";

  let e = {
    x, y,
    type,
    r: type === "tank" ? 20 :
       type === "fast" ? 10 : 14,
    hp: type === "tank" ? 100 :
        type === "fast" ? 25 : 50,
    speed: type === "tank" ? 52 :
           type === "fast" ? 145 : 83,
    damage: type === "tank" ? 25 : 15,
    value: type === "tank" ? 35 :
           type === "fast" ? 15 : 20,
    phase: random(TWO_PI)
  };

  // Inimigos ficam mais resistentes com o tempo.
  let scale = 1 + min(elapsed / 150, 0.8);
  e.hp *= scale;
  enemies.push(e);
}

function updateEnemies(dt) {
  for (let e of enemies) {
    let dx = player.x - e.x;
    let dy = player.y - e.y;
    let d = max(1, Math.hypot(dx, dy));

    e.x += (dx / d) * e.speed * dt;
    e.y += (dy / d) * e.speed * dt;
    e.phase += dt * 4;
  }
}

function drawEnemies() {
  for (let e of enemies) {
    let col = e.type === "tank" ? COLORS.pink :
              e.type === "fast" ? COLORS.yellow : COLORS.red;

    let pulse = 1 + sin(e.phase) * 0.08;

    // Camadas de brilho.
    noStroke();
    fill(col[0], col[1], col[2], 22);
    circle(e.x, e.y, e.r * 4 * pulse);
    fill(col[0], col[1], col[2], 45);
    circle(e.x, e.y, e.r * 2.5 * pulse);

    push();
    translate(e.x, e.y);
    rotate(e.phase * 0.25);
    rectMode(CENTER);

    stroke(col[0], col[1], col[2]);
    strokeWeight(2);
    fill(15, 12, 30, 220);

    if (e.type === "tank") {
      rect(0, 0, e.r * 1.7, e.r * 1.7, 4);
    } else if (e.type === "fast") {
      triangle(0, -e.r, e.r, e.r, -e.r, e.r);
    } else {
      beginShape();
      vertex(0, -e.r);
      vertex(e.r, 0);
      vertex(0, e.r);
      vertex(-e.r, 0);
      endShape(CLOSE);
    }

    noStroke();
    fill(col);
    circle(0, 0, 5);
    pop();

    // Barra de vida para inimigos feridos.
    if (e.hp < (e.type === "tank" ? 100 :
                e.type === "fast" ? 25 : 50) *
                (1 + min(elapsed / 150, 0.8))) {
      let maxHP = (e.type === "tank" ? 100 :
                   e.type === "fast" ? 25 : 50) *
                   (1 + min(elapsed / 150, 0.8));

      noStroke();
      fill(50, 30, 50);
      rect(e.x - e.r, e.y - e.r - 9, e.r * 2, 3);
      fill(col);
      rect(e.x - e.r, e.y - e.r - 9,
           e.r * 2 * max(0, e.hp / maxHP), 3);
    }
  }
}

// --------------------------------------------------
// JOGADOR E PROJÉTEIS
// --------------------------------------------------

function drawPlayer() {
  if (player.invulnerable > 0 && frameCount % 6 < 3) return;

let angle = touchFire
  ? getNearestEnemyAngle()
  : atan2(mouseY - player.y, mouseX - player.x);

  noStroke();
  fill(65, 245, 255, 18);
  circle(player.x, player.y, 65);
  fill(65, 245, 255, 35);
  circle(player.x, player.y, 40);

  push();
  translate(player.x, player.y);
  rotate(angle);

  stroke(65, 245, 255);
  strokeWeight(2);
  fill(10, 35, 55);

  beginShape();
  vertex(19, 0);
  vertex(-11, -11);
  vertex(-6, 0);
  vertex(-11, 11);
  endShape(CLOSE);

  noStroke();
  fill(255);
  circle(2, 0, 5);

  stroke(255, 65, 210, 190);
  line(-9, -5, -15, -8);
  line(-9, 5, -15, 8);
  pop();
}

function drawBullets() {
  for (let b of bullets) {
    stroke(65, 245, 255, 70);
    strokeWeight(7);
    line(b.x - b.vx * 0.025, b.y - b.vy * 0.025,
         b.x, b.y);

    noStroke();
    fill(65, 245, 255, 80);
    circle(b.x, b.y, 13);
    fill(235, 255, 255);
    circle(b.x, b.y, b.r * 1.4);
  }
}

// --------------------------------------------------
// COLISÕES, PONTOS E EXPERIÊNCIA
// --------------------------------------------------

function checkCollisions() {
  // Projéteis contra inimigos.
  for (let i = bullets.length - 1; i >= 0; i--) {
    let b = bullets[i];
    let hit = false;

    for (let j = enemies.length - 1; j >= 0; j--) {
      let e = enemies[j];
      let d = dist(b.x, b.y, e.x, e.y);

      if (d < b.r + e.r) {
        e.hp -= b.damage;
        hit = true;

        burst(b.x, b.y, COLORS.cyan, 4, 100);
        playTone(180, 0.025, "triangle", 0.018);

        if (e.hp <= 0) {
          score += e.value;
          player.xp++;
          burst(e.x, e.y,
                e.type === "fast" ? COLORS.yellow : COLORS.pink,
                18, 210);

          pickups.push({
            x: e.x,
            y: e.y,
            r: 6,
            phase: random(TWO_PI)
          });

          enemies.splice(j, 1);
        }
        break;
      }
    }

    if (hit) bullets.splice(i, 1);
  }

  // Inimigos encostando no jogador.
  for (let e of enemies) {
    let d = dist(player.x, player.y, e.x, e.y);

    if (d < player.r + e.r && player.invulnerable <= 0) {
      player.hp -= e.damage;
      player.invulnerable = 0.75;
      shake = 10;

      let angle = atan2(player.y - e.y, player.x - e.x);
      player.x += cos(angle) * 20;
      player.y += sin(angle) * 20;

      burst(player.x, player.y, COLORS.red, 14, 180);
      playTone(100, 0.14, "sawtooth", 0.06);

      if (player.hp <= 0) {
        player.hp = 0;
        gameState = "gameover";
      }
      break;
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    let p = pickups[i];
    p.phase += dt * 4;

    if (dist(player.x, player.y, p.x, p.y) < 28) {
      pickups.splice(i, 1);
      player.xp += 1;
      burst(p.x, p.y, COLORS.green, 8, 130);
      playTone(700, 0.09, "sine", 0.035);

      if (player.xp >= player.nextXp) {
        player.xp -= player.nextXp;
        player.nextXp = ceil(player.nextXp * 1.45);
        player.level++;
        openLevelUp();
        return;
      }
    }
  }

  // Permite subir de nível mesmo com muitos abates.
  if (player.xp >= player.nextXp) {
    player.xp -= player.nextXp;
    player.nextXp = ceil(player.nextXp * 1.45);
    player.level++;
    openLevelUp();
  }
}

function drawPickups() {
  for (let p of pickups) {
    let pulse = 1 + sin(p.phase) * 0.25;

    noStroke();
    fill(90, 255, 165, 30);
    circle(p.x, p.y, 27 * pulse);
    fill(90, 255, 165, 210);
    circle(p.x, p.y, p.r * 2 * pulse);
    fill(235, 255, 240);
    circle(p.x, p.y, 4);
  }
}

// --------------------------------------------------
// PARTÍCULAS
// --------------------------------------------------

function burst(x, y, color, count, force) {
  for (let i = 0; i < count; i++) {
    let a = random(TWO_PI);
    let speed = random(force * 0.25, force);

    particles.push({
      x, y,
      vx: cos(a) * speed,
      vy: sin(a) * speed,
      life: random(0.18, 0.55),
      maxLife: 0.55,
      size: random(2, 5),
      color
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
    p.life -= dt;

    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  noStroke();

  for (let p of particles) {
    let alpha = map(p.life, 0, p.maxLife, 0, 230);
    fill(p.color[0], p.color[1], p.color[2], alpha);
    circle(p.x, p.y, p.size);
  }
}

// --------------------------------------------------
// INTERFACE E HUD
// --------------------------------------------------

function drawHUD() {
  // Fundo dos painéis.
  noStroke();
  fill(5, 10, 25, 220);
  rect(22, 22, 245, 83, 8);
  rect(W - 220, 22, 195, 83, 8);

  stroke(65, 245, 255, 120);
  noFill();
  rect(22, 22, 245, 83, 8);
  rect(W - 220, 22, 195, 83, 8);

  noStroke();
  fill(65, 245, 255);
  textSize(11);
  text("INTEGRIDADE", 36, 42);

  fill(40, 25, 45);
  rect(36, 51, 215, 12, 3);

  fill(player.hp > 30 ? COLORS.cyan : COLORS.red);
  rect(36, 51, 215 * player.hp / player.maxHp, 12, 3);

  fill(235, 250, 255);
  textSize(12);
  text(floor(player.hp) + " / " + player.maxHp + " HP", 36, 81);
  text("NÍVEL " + player.level, 36, 96);

  fill(255, 65, 210);
  textSize(11);
  text("PONTUAÇÃO", W - 205, 42);

  fill(235, 250, 255);
  textSize(22);
  text(nf(score, 5), W - 205, 70);

  fill(65, 245, 255);
  textSize(11);
  text("TEMPO  " + formatTime(elapsed), W - 205, 91);

  // Barra de XP.
  fill(5, 10, 25, 220);
  rect(W / 2 - 130, H - 31, 260, 15, 5);

  noStroke();
  fill(255, 65, 210, 60);
  rect(W / 2 - 130, H - 31, 260, 15, 5);
  fill(COLORS.pink);
  rect(W / 2 - 130, H - 31,
       260 * player.xp / player.nextXp, 15, 5);

  fill(235, 250, 255);
  textAlign(CENTER);
  textSize(10);
  text("XP  " + player.xp + " / " + player.nextXp,
       W / 2, H - 38);
  textAlign(LEFT);

  fill(130, 175, 195);
  textSize(10);
  text("WASD / SETAS: MOVER   •   MOUSE: MIRAR E ATIRAR",
       25, H - 13);
}

function formatTime(seconds) {
  let s = floor(seconds);
  return nf(floor(s / 60), 2) + ":" + nf(s % 60, 2);
}

// --------------------------------------------------
// MENU, PAUSA E GAME OVER
// --------------------------------------------------

function drawMenu() {
  overlay();
  titleText("NEON SURVIVOR", H / 2 - 95, 43);

  fill(100, 220, 245);
  textAlign(CENTER);
  textSize(13);
  text("SOBREVIVA À ARENA. EVOLUA. RESISTA.", W / 2, H / 2 - 55);

  drawButton(W / 2 - 105, H / 2 - 10, 210, 48,
             "INICIAR JOGO", COLORS.cyan);

  fill(190, 210, 225);
  textSize(12);
  text("WASD / SETAS PARA MOVER", W / 2, H / 2 + 68);
  text("SEGURE O CLIQUE ESQUERDO PARA ATIRAR", W / 2, H / 2 + 90);
  text("ESC PARA PAUSAR", W / 2, H / 2 + 112);
  textAlign(LEFT);
}

function drawPause() {
  overlay();
  titleText("JOGO PAUSADO", H / 2 - 35, 34);
  drawButton(W / 2 - 100, H / 2 + 15, 200, 45,
             "CONTINUAR", COLORS.cyan);

  fill(190, 210, 225);
  textAlign(CENTER);
  textSize(12);
  text("Pressione ESC para voltar", W / 2, H / 2 + 85);
  textAlign(LEFT);
}

function drawGameOver() {
  overlay();

  titleText("FIM DE JOGO", H / 2 - 190, 38);

  // Pontuação
  fill(255, 100, 135);
  textAlign(CENTER);
  textSize(16);
  text("PONTUAÇÃO: " + score, W / 2, H / 2 - 145);

  // Tempo de sobrevivência
  fill(190, 210, 225);
  textSize(12);
  text("TEMPO DE SOBREVIVÊNCIA: " + formatTime(elapsed),
       W / 2, H / 2 - 118);

  // Mensagem de avaliação
  fill(65, 245, 255);
  textSize(16);
  text("ahh você perdeu... Mas o que achou do jogo?",
       W / 2, H / 2 - 88);

  // QR Code
  image(qrCode, W / 2 - 60, H / 2 - 75, 120, 120);

  // Link do formulário
  fill(190, 210, 225);
  textSize(11);
  text("https://forms.gle/kUsXodRwYiZZPNaY6",
       W / 2, H / 2 + 82);

  // Botão de reiniciar
  drawButton(W / 2 - 110, H / 2 + 105, 220, 46,
             "TENTAR NOVAMENTE", COLORS.pink);

  textAlign(LEFT);
}

function overlay() {
  noStroke();
  fill(2, 5, 15, 205);
  rect(0, 0, W, H);
}

function titleText(label, y, size) {
  textAlign(CENTER);
  textSize(size);
  textStyle(BOLD);
  fill(65, 245, 255, 35);
  text(label, W / 2 + 2, y + 2);
  fill(65, 245, 255);
  text(label, W / 2, y);
  textStyle(NORMAL);
  textAlign(LEFT);
}

function drawButton(x, y, w, h, label, col) {
  let hover = mouseX >= x && mouseX <= x + w &&
              mouseY >= y && mouseY <= y + h;

  stroke(col[0], col[1], col[2], hover ? 255 : 150);
  strokeWeight(hover ? 2 : 1);
  fill(col[0], col[1], col[2], hover ? 35 : 12);
  rect(x, y, w, h, 7);

  noStroke();
  fill(235, 250, 255);
  textAlign(CENTER, CENTER);
  textSize(13);
  textStyle(BOLD);
  text(label, x + w / 2, y + h / 2);
  textStyle(NORMAL);
  textAlign(LEFT);
}

function openLevelUp() {
  gameState = "levelup";

  upgradeChoices = [
    {
      name: "TIRO RÁPIDO",
      desc: "Dispara 20% mais rápido",
      color: COLORS.cyan,
      apply: () => {
        player.fireRate = max(0.065, player.fireRate * 0.8);
      }
    },
    {
      name: "TIRO POTENTE",
      desc: "Aumenta o dano em 40%",
      color: COLORS.pink,
      apply: () => {
        player.damage *= 1.4;
      }
    },
    {
      name: "REPARO",
      desc: "Recupera 35 de vida",
      color: COLORS.green,
      apply: () => {
        player.hp = min(player.maxHp, player.hp + 35);
      }
    },
    {
      name: "TIRO DUPLO",
      desc: "Adiciona um projétil",
      color: COLORS.yellow,
      apply: () => {
        player.multishot = min(5, player.multishot + 1);
      }
    },
    {
      name: "MOTOR NEON",
      desc: "Aumenta a velocidade",
      color: COLORS.cyan,
      apply: () => {
        player.speed = min(390, player.speed + 30);
      }
    },
    {
      name: "BLINDAGEM",
      desc: "Aumenta vida máxima em 25",
      color: COLORS.green,
      apply: () => {
        player.maxHp += 25;
        player.hp = min(player.maxHp, player.hp + 25);
      }
    }
  ];

  // Seleciona três melhorias diferentes.
  upgradeChoices = shuffle(upgradeChoices).slice(0, 3);
}

function drawLevelUp() {
  overlay();
  titleText("SISTEMA EVOLUÍDO", H / 2 - 115, 30);

  fill(190, 220, 235);
  textAlign(CENTER);
  textSize(13);
  text("ESCOLHA UMA MELHORIA", W / 2, H / 2 - 80);

  let cardW = 220;
  let gap = 15;
  let total = cardW * 3 + gap * 2;
  let startX = (W - total) / 2;
  let y = H / 2 - 45;

  for (let i = 0; i < upgradeChoices.length; i++) {
    let u = upgradeChoices[i];
    let x = startX + i * (cardW + gap);
    let hover = mouseX >= x && mouseX <= x + cardW &&
                mouseY >= y && mouseY <= y + 150;

    stroke(u.color[0], u.color[1], u.color[2],
           hover ? 255 : 130);
    fill(u.color[0], u.color[1], u.color[2],
         hover ? 32 : 10);
    rect(x, y, cardW, 150, 9);

    noStroke();
    fill(u.color);
    textSize(12);
    textStyle(BOLD);
    text("[" + (i + 1) + "]", x + cardW / 2, y + 28);

    textSize(14);
    text(u.name, x + cardW / 2, y + 65);

    fill(195, 215, 230);
    textStyle(NORMAL);
    textSize(10);
    text(u.desc, x + cardW / 2, y + 100);
  }

  fill(150, 185, 205);
  textSize(11);
  text("CLIQUE EM UMA CARTA OU PRESSIONE 1, 2 OU 3",
       W / 2, y + 185);
  textAlign(LEFT);
}

// --------------------------------------------------
// CONTROLES E MELHORIAS
// --------------------------------------------------

// =========================================
// EVENTOS DE TOQUE
// =========================================

function touchStarted() {
  initAudio();

  if (gameState === "playing") {
    updateTouchControls();
  } else {
    mousePressed();
  }

  return false;
}

function touchMoved() {
  updateTouchControls();
  return false;
}

function touchEnded() {
  updateTouchControls();
  return false;
}

function updateTouchControls() {
  touchFire = false;

  let joystickTouch = null;

  for (let t of touches) {

    // Lado direito: disparo
    if (t.x >= W * 0.5) {
      touchFire = true;
    }

    // Lado esquerdo: movimentação
    else {
      if (touchJoystickId === null) {
        touchJoystickId = t.id;
        touchOriginX = t.x;
        touchOriginY = t.y;
      }

      if (t.id === touchJoystickId) {
        joystickTouch = t;
      }
    }
  }
function drawTouchControls() {
  if (!isTouchDevice || gameState !== "playing") return;

  let baseX = touchJoystickId !== null
    ? touchOriginX
    : 105;

  let baseY = touchJoystickId !== null
    ? touchOriginY
    : H - 105;

  // Base do joystick
  noFill();
  stroke(65, 245, 255, 100);
  strokeWeight(3);

  circle(baseX, baseY, 110);

  // Parte móvel
  let knobX = baseX + touchMoveX * 35;
  let knobY = baseY + touchMoveY * 35;

  fill(65, 245, 255, 65);
  stroke(65, 245, 255);

  circle(knobX, knobY, 45);

  // Área de disparo
  noFill();
  stroke(255, 65, 210, 120);

  circle(W - 105, H - 105, 110);

  noStroke();
  fill(255, 65, 210);

  textAlign(CENTER, CENTER);
  textSize(13);

  text(
    "ATIRAR",
    W - 105,
    H - 105
  );

  textAlign(LEFT);
}
  if (joystickTouch) {
    let dx = joystickTouch.x - touchOriginX;
    let dy = joystickTouch.y - touchOriginY;

    let mag = Math.hypot(dx, dy);

    if (mag > 55) {
      dx = (dx / mag) * 55;
      dy = (dy / mag) * 55;
    }

    touchMoveX = dx / 55;
    touchMoveY = dy / 55;

  } else {
    touchJoystickId = null;
    touchMoveX = 0;
    touchMoveY = 0;
  }
}


function updateTouchControls() {
  touchFire = false;

  let joystickTouch = null;

  for (let t of touches) {

    // Lado direito: disparo
    if (t.x >= W * 0.5) {
      touchFire = true;
    }

    // Lado esquerdo: movimentação
    else {
      if (touchJoystickId === null) {
        touchJoystickId = t.id;
        touchOriginX = t.x;
        touchOriginY = t.y;
      }

      if (t.id === touchJoystickId) {
        joystickTouch = t;
      }
    }
  }

  if (joystickTouch) {
    let dx = joystickTouch.x - touchOriginX;
    let dy = joystickTouch.y - touchOriginY;

    let mag = Math.hypot(dx, dy);

    if (mag > 55) {
      dx = (dx / mag) * 55;
      dy = (dy / mag) * 55;
    }

    touchMoveX = dx / 55;
    touchMoveY = dy / 55;

  } else {
    touchJoystickId = null;
    touchMoveX = 0;
    touchMoveY = 0;
  }
}

// DESENHO DOS CONTROLES
function drawTouchControls() {
  if (!isTouchDevice || gameState !== "playing") return;

  let baseX = touchJoystickId !== null
    ? touchOriginX
    : 105;

  let baseY = touchJoystickId !== null
    ? touchOriginY
    : H - 105;

  // Base do joystick
  noFill();
  stroke(65, 245, 255, 100);
  strokeWeight(3);
  circle(baseX, baseY, 110);

  // Parte móvel
  let knobX = baseX + touchMoveX * 35;
  let knobY = baseY + touchMoveY * 35;

  fill(65, 245, 255, 65);
  stroke(65, 245, 255);
  circle(knobX, knobY, 45);

  // Área de disparo
  noFill();
  stroke(255, 65, 210, 120);
  circle(W - 105, H - 105, 110);

  noStroke();
  fill(255, 65, 210);

  textAlign(CENTER, CENTER);
  textSize(13);
  text("ATIRAR", W - 105, H - 105);

  textAlign(LEFT);
}


function mousePressed() {
  // O primeiro clique também libera o áudio do navegador.
  initAudio();

  if (gameState === "menu") {
    resetGame();
    gameState = "playing";
    return false;
  }

if (gameState === "gameover") {

  // Verifica se clicou no link
  textSize(11);
  textAlign(CENTER);

  let linkWidth = textWidth(FORM_URL);

  if (
    mouseX >= W / 2 - linkWidth / 2 - 8 &&
    mouseX <= W / 2 + linkWidth / 2 + 8 &&
    mouseY >= H / 2 + 68 &&
    mouseY <= H / 2 + 94
  ) {
    window.open(FORM_URL, "_blank");
    return false;
  }

  // Verifica se clicou no botão de reiniciar
  if (
    mouseX >= W / 2 - 110 &&
    mouseX <= W / 2 + 110 &&
    mouseY >= H / 2 + 105 &&
    mouseY <= H / 2 + 151
  ) {
    resetGame();
    gameState = "playing";
  }

  return false;
}

  if (gameState === "gameover") {
    resetGame();
    gameState = "playing";
    return false;
  }

  if (gameState === "levelup") {
    let cardW = 220;
    let gap = 15;
    let startX = (W - (cardW * 3 + gap * 2)) / 2;
    let y = H / 2 - 45;

    for (let i = 0; i < upgradeChoices.length; i++) {
      let x = startX + i * (cardW + gap);

      if (mouseX >= x && mouseX <= x + cardW &&
          mouseY >= y && mouseY <= y + 150) {
        chooseUpgrade(i);
        break;
      }
    }
    return false;
  }

  return false;
}

function keyPressed() {
  initAudio();

  if (keyCode === ESCAPE) {
    if (gameState === "playing") gameState = "paused";
    else if (gameState === "paused") gameState = "playing";
    return false;
  }

  if (gameState === "levelup") {
    if (key === "1") chooseUpgrade(0);
    if (key === "2") chooseUpgrade(1);
    if (key === "3") chooseUpgrade(2);
  }

  if (gameState === "gameover" && keyCode === ENTER) {
    resetGame();
    gameState = "playing";
  }

  if (gameState === "menu" && keyCode === ENTER) {
    resetGame();
    gameState = "playing";
  }
}

function chooseUpgrade(index) {
  if (!upgradeChoices[index]) return;

  upgradeChoices[index].apply();
  gameState = "playing";
  playTone(850, 0.15, "sine", 0.045);
  burst(player.x, player.y, COLORS.cyan, 20, 150);
}

// --------------------------------------------------
// ÁUDIO SINTETIZADO
// --------------------------------------------------

function initAudio() {
  if (!soundEnabled) return;

  try {
    if (!audioCtx) {
      let AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (AudioContextClass) audioCtx = new AudioContextClass();
    }

    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  } catch (e) {
    // O jogo continua funcionando sem áudio.
  }
}

function playTone(freq, duration, type, volume) {
  if (!soundEnabled || !audioCtx) return;

  try {
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    let now = audioCtx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(
      max(40, freq * 0.65), now + duration
    );

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(
      0.001, now + duration
    );

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    // Falha de áudio não interrompe a partida.
  }
}
