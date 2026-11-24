/* Attack of Hunger — lógica do jogo independente do DOM.
 * Coordenadas em unidades lógicas, nunca em pixels DPR.
 * This file also works in Node so the game rules can be tested without a browser.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HungerGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const FIXED_STEP = 1 / 120;

  // Shared player metrics keep the rendered mouth and collision point aligned.
  const PLAYER_HEIGHT = 180;
  const PLAYER_FEET_OFFSET = 22;
  const PLAYER_MOUTH_FROM_TOP = 24;

  // Visible phases advance every 25 humans; the current name is shown in the HUD.
  const PHASES = ['LANCHE LIGHT', 'FOME MODERADA', 'FOME CRÍTICA', 'FOME ABSOLUTA', 'FOME DO CONTINENTE', 'FOME SEM FIM'];

  // Collectible goals. test() receives pure match stats, so it stays testable
  // without a DOM: { score, combo, level, elapsed }.
  const ACHIEVEMENTS = [
    { id: 'first-bite', name: 'Primeiro lanche', hint: 'Comer o primeiro humano.', test: (s) => s.score >= 1 },
    { id: 'moderate-hunger', name: 'Fome moderada', hint: 'Chegar a 25 humanos.', test: (s) => s.score >= 25 },
    { id: 'critical-hunger', name: 'Fome crítica', hint: 'Chegar a 50 humanos.', test: (s) => s.score >= 50 },
    { id: 'century', name: 'Centurão', hint: 'Chegar a 100 humanos.', test: (s) => s.score >= 100 },
    { id: 'feast', name: 'Fome sem fim', hint: 'Chegar a 200 humanos.', test: (s) => s.score >= 200 },
    { id: 'combo-ten', name: 'Corretiva dez', hint: 'Fazer uma corrente de 10 humanos.', test: (s) => s.combo >= 10 },
    { id: 'combo-twenty', name: 'Mestre da corrente', hint: 'Fazer uma corrente de 20 humanos.', test: (s) => s.combo >= 20 },
    { id: 'special-feast', name: 'Banquete de titã', hint: 'Comer 5 alvos de banquete.', test: (s) => s.specialCount >= 5 },
    { id: 'survivor', name: 'Sobrevivente', hint: 'Ficar 3 minutos na partida.', test: (s) => s.elapsed >= 180 }
  ];

  // Rare feast target: an edible humanoid carrying extra points.
  const SPECIAL_POINTS = 3;

  // Player outfits. wash is a translucent color layered over the sprite with a
  // "source-atop" blend in script.js; glow is a soft aura drawn behind the titan.
  // Outfits unlock progressively with the best score kept in localStorage.
  const PLAYER_ASPECTS = [
    { id: 'default', name: 'Titã Padrão', hint: 'O titã como ele é.', unlockScore: 0, wash: null, glow: null },
    { id: 'desert', name: 'Titã do Deserto', hint: 'Desbloqueia com 50 humanos.', unlockScore: 50, wash: 'rgba(240, 170, 80, .32)', glow: '#f0a850' },
    { id: 'shadow', name: 'Titã das Sombras', hint: 'Desbloqueia com 100 humanos.', unlockScore: 100, wash: 'rgba(96, 112, 224, .32)', glow: '#7c8ce8' },
    { id: 'gold', name: 'Titã Dourado', hint: 'Desbloqueia com 150 humanos.', unlockScore: 150, wash: 'rgba(255, 205, 60, .34)', glow: '#ffc93c' },
    { id: 'hunger', name: 'Titã da Fome', hint: 'Desbloqueia com 200 humanos.', unlockScore: 200, wash: 'rgba(224, 72, 60, .32)', glow: '#ff6a5c' }
  ];

  function unlockedAspects(bestScore) {
    return PLAYER_ASPECTS.filter(aspect => aspect.unlockScore <= bestScore);
  }

  // Swept collision in ellipse space: a fast target cannot skip the player.
  function segmentHitsEllipse(ax, ay, bx, by, rx, ry) {
    const sx = ax / rx;
    const sy = ay / ry;
    const dx = (bx - ax) / rx;
    const dy = (by - ay) / ry;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 0
      ? clamp(-(sx * dx + sy * dy) / lengthSquared, 0, 1)
      : 0;
    const x = sx + t * dx;
    const y = sy + t * dy;
    return x * x + y * y <= 1;
  }

  class HungerEngine {
    constructor(options = {}) {
      this.width = options.width || 480;
      this.height = options.height || 800;
      this.random = options.random || Math.random;
      this.difficulty = options.difficulty || 'normal';
      this.state = 'menu';
      this.score = 0;
      this.elapsed = 0;
      this.combo = 0;
      this.specialCount = 0;
      this.entities = [];
      this.pool = [];
      this.events = [];
      this.player = { x: this.width / 2, targetX: this.width / 2, munch: 0 };
      this.spawnClock = 0.5;
      this.spawnCount = 0;
      this.lastLane = -1;
      this.titanStreak = 0;
      this.humanStreak = 0;
      this.serial = 0;
    }

    get mouthY() { return this.height - PLAYER_FEET_OFFSET - PLAYER_HEIGHT + PLAYER_MOUTH_FROM_TOP; }
    get level() { return 1 + Math.floor(this.score / 10); }
    get multiplier() {
      // Combo multiplier: every 5 consecutive captures it rises one tier, capped at X5.
      return Math.min(1 + Math.floor(Math.max(this.combo, 0) / 5), 5);
    }
    get phaseIndex() { return Math.min(Math.floor(this.score / 25), PHASES.length - 1); }
    get phase() { return PHASES[this.phaseIndex]; }
    get stats() { return { score: this.score, combo: this.combo, level: this.level, elapsed: this.elapsed, specialCount: this.specialCount }; }
    get timeSpeedBoost() {
      // Speed ramps up with survived time even if the player scores nothing.
      // Full time bonus is reached after 150 seconds and then stays capped.
      return Math.min(Math.max(this.elapsed, 0) / 150, 1) * 0.12;
    }
    get fallSpeed() {
      const scoreBoost = Math.min(this.score, 100) * 0.00275;
      const difficultyBoost = this.difficulty === 'easy' ? -0.0275 : this.difficulty === 'hard' ? 0.025 : 0;
      return this.height * Math.min(0.65, 0.255 + difficultyBoost + scoreBoost + this.timeSpeedBoost);
    }
    get spawnInterval() {
      // In short landscape worlds, keep a minimum absolute vertical gap as well.
      // Use the maximum possible fall speed (score + time) for fairness.
      const fairnessFloor = Math.max(0.58, 160 / (this.height * 0.65))
        * (this.difficulty === 'easy' ? 1.1 : this.difficulty === 'hard' ? 0.9 : 1);
      const factor = this.difficulty === 'easy' ? 1.2 : this.difficulty === 'hard' ? 0.9 : 1;
      return Math.max(fairnessFloor, (1.06 - this.score * 0.0065) * factor);
    }
    get laneCount() { return clamp(Math.floor((this.width - 72) / 72), 4, 10); }

    start() {
      while (this.entities.length) this.pool.push(this.entities.pop());
      this.score = 0;
      this.elapsed = 0;
      this.combo = 0;
      this.specialCount = 0;
      this.spawnClock = 0.45;
      this.spawnCount = 0;
      this.lastLane = -1;
      this.titanStreak = 0;
      this.humanStreak = 0;
      this.serial = 0;
      this.events.length = 0;
      this.player.x = this.width / 2;
      this.player.targetX = this.width / 2;
      this.player.munch = 0;
      this.state = 'playing';
      this.events.push({ type: 'start' });
    }

    pause() {
      if (this.state !== 'playing') return false;
      this.state = 'paused';
      return true;
    }

    resume() {
      if (this.state !== 'paused') return false;
      this.state = 'playing';
      return true;
    }

    menu() {
      this.state = 'menu';
      this.events.length = 0;
      while (this.entities.length) this.pool.push(this.entities.pop());
    }

    resize(width, height) {
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
      const sx = width / this.width;
      const sy = height / this.height;
      this.player.x *= sx;
      this.player.targetX *= sx;
      for (const entity of this.entities) {
        entity.x *= sx;
        entity.y *= sy;
      }
      this.width = width;
      this.height = height;
      this.setTarget(this.player.targetX);
    }

    setTarget(x) {
      if (Number.isFinite(x)) this.player.targetX = clamp(x, 43, this.width - 43);
    }

    move(direction, dt) {
      this.setTarget(this.player.targetX + direction * this.width * 1.8 * dt);
    }

    laneX(lane) {
      // Wider margin keeps the Beast titan's long arms inside the playfield.
      const margin = 60;
      return margin + lane * (this.width - margin * 2) / (this.laneCount - 1);
    }

    spawn() {
      // One target per wave, with a generous vertical gap even at maximum speed.
      // There is always an open lane; we never generate an unavoidable wall.
      const roll = this.random();
      // Rival titan density by difficulty: titan when roll <= threshold.
      // Easy ~20% titans, normal ~33%, hard ~80% of eligible waves.
      const titanThreshold = this.difficulty === 'easy' ? 0.2 : this.difficulty === 'hard' ? 0.8 : 0.33;
      let kind = this.spawnCount < 3 || roll > titanThreshold ? 'human' : 'titan';
      if (this.titanStreak >= 2) kind = 'human';
      if (this.humanStreak >= 4) kind = 'titan';
      // Rare feast target: a bonus-carrying edible, never in the opening waves.
      if (kind === 'human' && this.spawnCount >= 4 && this.random() < 0.08) kind = 'special';
      let lane = Math.floor(this.random() * this.laneCount);
      if (lane === this.lastLane) lane = (lane + 1 + Math.floor(this.random() * (this.laneCount - 1))) % this.laneCount;
      if (this.spawnCount === 0) lane = Math.floor(this.laneCount / 2);
      const entity = this.pool.pop() || {};
      entity.id = ++this.serial;
      entity.kind = kind;
      entity.x = this.laneX(clamp(lane, 0, this.laneCount - 1));
      entity.y = -48;
      // Seven human sprites (feast targets share them); two rival titans (Beast / Armored).
      const humanFamily = kind === 'human' || kind === 'special';
      entity.variant = clamp(Math.floor(this.random() * (humanFamily ? 7 : 2)), 0, humanFamily ? 6 : 1);
      entity.phase = this.random() * Math.PI * 2;
      this.entities.push(entity);
      this.lastLane = lane;
      this.spawnCount++;
      this.titanStreak = kind === 'titan' ? this.titanStreak + 1 : 0;
      this.humanStreak = humanFamily ? this.humanStreak + 1 : 0;
    }

    update(delta) {
      if (this.state !== 'playing' || !Number.isFinite(delta) || delta <= 0) return;
      // Cap long frames. Background tabs are explicitly paused by the controller.
      let remaining = Math.min(delta, 0.05);
      while (remaining > 0.000001 && this.state === 'playing') {
        const dt = Math.min(FIXED_STEP, remaining);
        this.step(dt);
        remaining -= dt;
      }
    }

    step(dt) {
      this.elapsed += dt;
      const previousX = this.player.x;
      const maxMove = this.width * 3.4 * dt;
      this.player.x += clamp(this.player.targetX - this.player.x, -maxMove, maxMove);
      this.player.munch = Math.max(0, this.player.munch - dt);
      this.spawnClock -= dt;
      if (this.spawnClock <= 0) {
        this.spawn();
        this.spawnClock += this.spawnInterval * (0.94 + this.random() * 0.12);
      }

      let writeIndex = 0;
      for (let i = 0; i < this.entities.length; i++) {
        const entity = this.entities[i];
        const oldY = entity.y;
        entity.y += this.fallSpeed * dt;
        const isTitan = entity.kind === 'titan';
        // Hitboxes follow the new sprite torsos, not decorative swords/long arms.
        const colliderX = isTitan ? (entity.variant === 1 ? 44 : 54) : 38;
        const colliderY = isTitan ? 68 : 50;
        const hit = segmentHitsEllipse(
          entity.x - previousX, oldY - this.mouthY,
          entity.x - this.player.x, entity.y - this.mouthY,
          colliderX, colliderY
        );
        if (hit) {
          if (isTitan) {
            // Compact earlier captures, but keep this titan and all later targets.
            // Defeat freezes the exact collision frame without stale duplicates.
            this.entities[writeIndex++] = entity;
            for (let j = i + 1; j < this.entities.length; j++) this.entities[writeIndex++] = this.entities[j];
            this.entities.length = writeIndex;
            this.state = 'over';
            this.events.push({ type: 'defeat', x: entity.x, y: entity.y, score: this.score });
            return;
          }
          this.combo++;
          const points = (entity.kind === 'special' ? SPECIAL_POINTS : 1) * this.multiplier;
          this.score += points;
          if (entity.kind === 'special') this.specialCount++;
          this.player.munch = 0.25;
          this.events.push({
            type: 'capture',
            x: entity.x,
            y: entity.y,
            score: this.score,
            points,
            combo: this.combo,
            multiplier: this.multiplier,
            special: entity.kind === 'special'
          });
          this.pool.push(entity);
          continue;
        }
        if (entity.y > this.height + 65) {
          // An escaped edible breaks the combo streak, but costs no points.
          if ((entity.kind === 'human' || entity.kind === 'special') && this.combo > 0) {
            this.combo = 0;
            this.events.push({ type: 'combo-reset' });
          }
          this.pool.push(entity);
          continue;
        }
        this.entities[writeIndex++] = entity;
      }
      this.entities.length = writeIndex;
    }

    drainEvents() {
      const events = this.events.slice();
      this.events.length = 0;
      return events;
    }
  }

  return { HungerEngine, segmentHitsEllipse, clamp, PLAYER_HEIGHT, PLAYER_FEET_OFFSET, PLAYER_MOUTH_FROM_TOP, PHASES, ACHIEVEMENTS, PLAYER_ASPECTS, unlockedAspects, SPECIAL_POINTS };
});
