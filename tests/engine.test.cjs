'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HungerEngine, segmentHitsEllipse, clamp, ACHIEVEMENTS, PLAYER_TITAN_IDS } = require('../game.js');

function seeded(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function target(engine, kind, x = engine.width / 2, y = engine.mouthY) {
  const entity = { id: 999, kind, x, y, variant: 0, phase: 0 };
  engine.entities.push(entity);
  return entity;
}

test('menu is idle; starting resets the complete round state', () => {
  const game = new HungerEngine({ random: seeded(1) });
  game.update(1);
  assert.equal(game.elapsed, 0);
  assert.equal(game.entities.length, 0);
  game.start();
  assert.equal(game.state, 'playing');
  assert.equal(game.score, 0);
  assert.equal(game.player.x, 240);
  assert.equal(game.player.targetX, 240);
});

test('a human gives exactly one point, a capture event, and is removed', () => {
  const game = new HungerEngine(); game.start(); game.drainEvents();
  target(game, 'human', 240, game.mouthY - 1);
  game.update(1 / 60);
  assert.equal(game.score, 1);
  assert.equal(game.entities.length, 0);
  assert.ok(game.player.munch > 0.23 && game.player.munch <= 0.25);
  assert.deepEqual(game.drainEvents().map(e => e.type), ['capture']);
  game.update(1 / 60);
  assert.equal(game.score, 1);
});

test('a titan ends the game immediately and freezes all remaining entities', () => {
  const game = new HungerEngine(); game.start();
  target(game, 'titan', 240, game.mouthY - 1);
  const laterHuman = target(game, 'human', 240, game.mouthY - 1);
  game.update(1 / 60);
  assert.equal(game.state, 'over');
  assert.equal(game.score, 0);
  const frozen = JSON.stringify(game.entities);
  const elapsed = game.elapsed;
  game.update(1);
  assert.equal(JSON.stringify(game.entities), frozen);
  assert.equal(game.elapsed, elapsed);
  assert.ok(game.entities.includes(laterHuman));
  assert.ok(game.drainEvents().some(e => e.type === 'defeat'));
});

test('earlier captures count before defeat, without stale duplicate entities', () => {
  const game = new HungerEngine(); game.start();
  target(game, 'human', 240, game.mouthY - 1);
  const titan = target(game, 'titan', 240, game.mouthY - 1);
  const later = target(game, 'human', 100, 100);
  game.update(1 / 60);
  assert.equal(game.score, 1);
  assert.equal(game.state, 'over');
  assert.deepEqual(game.entities, [titan, later]);
});

test('missing a human costs nothing and offscreen entities are recycled', () => {
  const game = new HungerEngine(); game.start();
  target(game, 'human', 50, game.height + 64);
  game.update(1 / 60);
  assert.equal(game.score, 0);
  assert.equal(game.entities.length, 0);
  assert.equal(game.pool.length, 1);
  assert.equal(game.state, 'playing');
});

test('near misses do not collide; swept collisions catch fast crossings', () => {
  assert.equal(segmentHitsEllipse(40, -100, 40, 100, 39, 43), false);
  assert.equal(segmentHitsEllipse(0, -100, 0, 100, 39, 43), true);
  assert.equal(segmentHitsEllipse(10, 10, 10, 10, 39, 43), true);
  const game = new HungerEngine({ height: 10000 }); game.start();
  target(game, 'human', 240, game.mouthY - 75);
  game.update(0.05);
  assert.equal(game.score, 1);
});

test('pause/resume preserves score, positions and elapsed time', () => {
  const game = new HungerEngine({ random: seeded(3) }); game.start();
  game.update(0.05); game.pause();
  const before = JSON.stringify({ entities: game.entities, player: game.player, elapsed: game.elapsed });
  game.update(0.05);
  assert.equal(JSON.stringify({ entities: game.entities, player: game.player, elapsed: game.elapsed }), before);
  assert.equal(game.resume(), true);
  game.update(0.05);
  assert.ok(game.elapsed > 0.05);
});

test('movement is responsive, bounded, and ignores invalid coordinates', () => {
  const game = new HungerEngine(); game.start();
  game.setTarget(-999);
  for (let i = 0; i < 4; i++) game.update(0.05);
  assert.equal(game.player.x, 43);
  game.setTarget(9999);
  for (let i = 0; i < 6; i++) game.update(0.05);
  assert.equal(game.player.x, game.width - 43);
  game.setTarget(NaN);
  assert.equal(game.player.targetX, game.width - 43);
  game.move(-1, 0.05);
  assert.ok(game.player.targetX < game.width - 43);
  assert.equal(clamp(9, 0, 5), 5);
});

test('spawn uses all seven human sprites and the rival titan sprites', () => {
  const game = new HungerEngine({ random: seeded(42) });
  game.start();
  const humans = new Set();
  const titans = new Set();
  for (let i = 0; i < 400; i++) {
    game.spawn();
    const entity = game.entities[game.entities.length - 1];
    if (entity.kind === 'human') {
      assert.ok(entity.variant >= 0 && entity.variant <= 6);
      humans.add(entity.variant);
    } else {
      assert.ok(entity.variant >= 0 && entity.variant <= 5);
      titans.add(entity.variant);
    }
  }
  assert.equal(humans.size, 7);
  // With the original titan chosen, all other five titans appear as rivals.
  assert.equal(titans.size, 5);
});

test('difficulty increases gradually and remains bounded', () => {
  const game = new HungerEngine();
  const initialSpeed = game.fallSpeed;
  const initialInterval = game.spawnInterval;
  game.score = 20;
  assert.ok(game.fallSpeed > initialSpeed);
  assert.ok(game.spawnInterval < initialInterval);
  assert.equal(game.level, 3);
  game.score = 100000;
  game.elapsed = 100000;
  assert.equal(game.fallSpeed, game.height * 0.65);
  assert.equal(game.spawnInterval, 0.58);
  // Even the fastest waves leave more vertical space than a titan occupies.
  assert.ok(game.fallSpeed * game.spawnInterval * 0.94 > 150);
});

test('fall speed increases with elapsed time even when score stays zero', () => {
  const game = new HungerEngine();
  game.start();
  const initial = game.fallSpeed;
  game.elapsed = 30;
  const after30 = game.fallSpeed;
  assert.ok(after30 > initial);
  game.elapsed = 150;
  const after150 = game.fallSpeed;
  assert.ok(after150 > after30);
  assert.equal(after150, game.height * (0.255 + 0.12));
  game.elapsed = 100000;
  assert.equal(game.fallSpeed, after150, 'time boost must stay capped');
  assert.equal(game.score, 0);
});

test('short landscape worlds preserve a fair absolute spawn gap at max speed', () => {
  const game = new HungerEngine({ width: 844, height: 360 });
  game.score = 100000;
  game.elapsed = 100000;
  assert.ok(game.fallSpeed * game.spawnInterval * 0.94 > 150);
});

test('resize preserves relative positions and play state', () => {
  const game = new HungerEngine(); game.start();
  const entity = target(game, 'human', 120, 200);
  game.resize(840, 390);
  assert.equal(game.player.x, 420);
  assert.equal(entity.x, 210);
  assert.equal(entity.y, 97.5);
  assert.equal(game.state, 'playing');
  game.resize(-1, 0);
  assert.equal(game.width, 840);
});

test('invalid deltas do not advance or break the simulation', () => {
  const game = new HungerEngine(); game.start();
  for (const dt of [0, -1, NaN, Infinity]) game.update(dt);
  assert.equal(game.elapsed, 0);
  assert.equal(game.entities.length, 0);
});

test('100 restarts clear targets, score, input and pending events', () => {
  const game = new HungerEngine({ random: seeded(8) });
  for (let i = 0; i < 100; i++) {
    game.start();
    game.setTarget(50);
    for (let frame = 0; frame < 40; frame++) game.update(1 / 60);
    const obstacle = game.entities[0] || target(game, 'titan');
    obstacle.kind = 'titan'; obstacle.x = game.player.x; obstacle.y = game.mouthY;
    game.update(1 / 60);
    assert.equal(game.state, 'over');
    game.start();
    assert.equal(game.score, 0);
    assert.equal(game.entities.length, 0);
    assert.equal(game.player.x, game.width / 2);
    assert.equal(game.player.targetX, game.width / 2);
    assert.equal(game.player.munch, 0);
    assert.deepEqual(game.drainEvents(), [{ type: 'start' }]);
  }
  assert.ok(game.pool.length < 20);
});

test('long seeded sessions keep fair spacing, no target overlap and bounded memory', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const game = new HungerEngine({ random: seeded(seed) }); game.start();
    let lastSerial = 0;
    let titanStreak = 0;
    for (let frame = 0; frame < 60 * 90; frame++) {
      // A simple legal autoplayer demonstrates that every wave has an escape.
      const threats = game.entities.filter(e => e.kind === 'titan' && e.y > game.mouthY - 180 && e.y < game.mouthY + 80);
      if (threats.length) {
        let safeX = game.player.x;
        let bestClearance = -Infinity;
        for (let x = 48; x <= game.width - 48; x += 16) {
          const clearance = Math.min(...threats.map(e => Math.abs(e.x - x))) - Math.abs(game.player.x - x) * 0.05;
          const crossesActiveTitan = threats.some(e =>
            Math.abs(e.y - game.mouthY) < 75 && (game.player.x - e.x) * (x - e.x) < 0
          );
          const score = clearance - (crossesActiveTitan ? 1000 : 0);
          if (score > bestClearance) { bestClearance = score; safeX = x; }
        }
        game.setTarget(safeX);
      } else {
        const human = game.entities.filter(e => e.kind === 'human' && e.y < game.mouthY).sort((a,b) => b.y-a.y)[0];
        if (human) game.setTarget(human.x);
      }
      game.update(1 / 60);
      assert.notEqual(game.state, 'over', `unavoidable collision with seed ${seed}`);
      assert.ok(game.entities.length <= 10);
      for (const entity of game.entities) {
        if (entity.id > lastSerial) {
          lastSerial = entity.id;
          titanStreak = entity.kind === 'titan' ? titanStreak + 1 : 0;
          assert.ok(titanStreak <= 2);
          const previous = game.entities[game.entities.length - 2];
          if (previous) assert.ok(entity.y - previous.y < -100 || game.height < 500);
        }
        assert.ok(entity.x >= 43 && entity.x <= game.width - 43);
      }
      game.drainEvents();
    }
    assert.ok(game.score > 40);
    assert.ok(game.pool.length <= 10);
  }
});

test('combo multiplier rises every five captures and feeds the score', () => {
  const game = new HungerEngine(); game.start(); game.drainEvents();
  for (let i = 0; i < 12; i++) {
    target(game, 'human', 240, game.mouthY - 1);
    game.update(1 / 60);
    game.drainEvents();
  }
  assert.equal(game.combo, 12);
  // Captures 1-4 score +1 each (total 4), the 5th rises to X2 (total 6),
  // captures 6-9 score +2 each (total 14), and 10-12 rise to X3 (+3 each, total 23).
  assert.equal(game.score, 23);
  assert.equal(game.multiplier, 3);
  target(game, 'human', 240, game.mouthY - 1);
  game.update(1 / 60);
  const capture = game.drainEvents()[0];
  assert.equal(capture.type, 'capture');
  assert.equal(capture.points, 3);
  assert.equal(capture.combo, 13);
  assert.equal(capture.score, game.score);
  assert.equal(capture.multiplier, 3);
  // The multiplier caps at X5 and the combo keeps growing.
  for (let i = 0; i < 40; i++) {
    target(game, 'human', 240, game.mouthY - 1);
    game.update(1 / 60);
    game.drainEvents();
  }
  assert.equal(game.combo, 53);
  assert.equal(game.multiplier, 5);
});

test('an escaped human resets the combo but costs no points', () => {
  const game = new HungerEngine(); game.start(); game.drainEvents();
  for (let i = 0; i < 3; i++) {
    target(game, 'human', 240, game.mouthY - 1);
    game.update(1 / 60);
    game.drainEvents();
  }
  assert.equal(game.combo, 3);
  assert.equal(game.score, 3);
  target(game, 'human', 50, game.height + 64);
  game.update(1 / 60);
  assert.equal(game.score, 3);
  assert.equal(game.combo, 0);
  assert.deepEqual(game.drainEvents().map(e => e.type), ['combo-reset']);
});

test('difficulty tunes fall speed, spawn interval, fairness floor and titan density', () => {
  const easy = new HungerEngine({ difficulty: 'easy' });
  const normal = new HungerEngine();
  const hard = new HungerEngine({ difficulty: 'hard' });
  easy.start(); normal.start(); hard.start();
  assert.ok(easy.fallSpeed < normal.fallSpeed);
  assert.ok(hard.fallSpeed > normal.fallSpeed);
  assert.ok(easy.spawnInterval > normal.spawnInterval);
  assert.ok(hard.spawnInterval < normal.spawnInterval);
  // Even hard mode keeps a fair absolute gap at maximum speed.
  hard.score = 100000;
  hard.elapsed = 100000;
  assert.ok(hard.fallSpeed * hard.spawnInterval * 0.94 > 150);
  const titanDensity = (difficulty, seed) => {
    const game = new HungerEngine({ random: seeded(seed), difficulty });
    game.start();
    let titans = 0;
    for (let i = 0; i < 300; i++) {
      game.spawn();
      if (game.entities[game.entities.length - 1].kind === 'titan') titans++;
    }
    return titans;
  };
  assert.ok(titanDensity('hard', 7) > titanDensity('easy', 7));
});

test('phase names advance every 25 humans and stay capped', () => {
  const game = new HungerEngine(); game.start();
  assert.equal(game.phase, 'LANCHE LIGHT');
  assert.equal(game.phaseIndex, 0);
  game.score = 25;
  assert.equal(game.phase, 'FOME MODERADA');
  game.score = 100;
  assert.equal(game.phase, 'FOME DO CONTINENTE');
  game.score = 100000;
  assert.equal(game.phase, 'FOME SEM FIM');
});

test('achievements unlock from pure match stats', () => {
  assert.equal(ACHIEVEMENTS.length, 8);
  const ids = (extra) => ACHIEVEMENTS.filter(a => a.test({ score: 0, combo: 0, level: 1, elapsed: 0, ...extra })).map(a => a.id);
  assert.deepEqual(ids({}), []);
  assert.ok(ids({ score: 1 }).includes('first-bite'));
  assert.ok(ids({ score: 25 }).includes('moderate-hunger'));
  assert.ok(ids({ score: 200 }).includes('feast'));
  assert.ok(ids({ combo: 10 }).includes('combo-ten'));
  assert.ok(ids({ combo: 20 }).includes('combo-twenty'));
  assert.ok(ids({ elapsed: 180 }).includes('survivor'));
  assert.equal(ids({ score: 200, combo: 20, level: 21, elapsed: 200 }).length, 8);
});

test('restart resets the combo and difficulty keeps the match fair', () => {
  const game = new HungerEngine({ difficulty: 'hard', random: seeded(11) });
  for (let i = 0; i < 6; i++) {
    game.start();
    for (let n = 0; n < 8; n++) {
      target(game, 'human', 240, game.mouthY - 1);
      game.update(1 / 60);
      game.drainEvents();
    }
    assert.equal(game.combo, 8);
    assert.equal(game.difficulty, 'hard');
    assert.ok(game.score >= 8);
  }
});

test('longer matches escalate fall frequency and titan density over time', () => {
  const game = new HungerEngine();
  game.start();
  assert.equal(game.titanTimeDrift, 0, 'no time drift at the start');
  const intervalAtStart = game.spawnInterval;
  const titansEarly = countTitans(game, 400);

  game.elapsed = 120;
  assert.ok(game.titanTimeDrift > 0.03 && game.titanTimeDrift < 0.06, 'half-ramp drift at 120s');
  assert.ok(game.spawnInterval < intervalAtStart, 'waves fall faster at 120s');
  const titansMid = countTitans(game, 400);

  game.elapsed = 400;
  assert.ok(Math.abs(game.titanTimeDrift - 0.08) < 1e-9, 'drift caps at 8%');
  assert.ok(game.spawnInterval < intervalAtStart, 'waves keep falling faster at 400s');
  const titansLate = countTitans(game, 600);

  assert.ok(titansLate > titansMid, 'more rival titans at 400s than at 120s');
  assert.ok(titansMid >= titansEarly, 'titan density does not decrease with time');
});

test('the time density ramp keeps a fair floor and resets on restart', () => {
  const game = new HungerEngine();
  game.start();
  const opening = game.spawnInterval;
  const fairnessFloor = Math.max(0.58, 160 / (game.height * 0.65));
  game.elapsed = 9999;
  assert.ok(game.spawnInterval >= fairnessFloor, 'the per-match fairness floor is never undercut');
  game.start();
  assert.equal(game.elapsed, 0);
  assert.equal(game.titanTimeDrift, 0, 'restart rewinds the time ramp');
  assert.equal(game.spawnInterval, opening, 'restart restores the opening cadence');
});

test('the playable titan choice is selectable, validated and never an edible target', () => {
  assert.deepEqual(PLAYER_TITAN_IDS, ['original', 'cinza', 'laranja', 'beast', 'armored', 'colossal']);
  const game = new HungerEngine();
  assert.equal(game.playerTitan, 'original', 'defaults to the original titan');
  game.setPlayerTitan('colossal');
  assert.equal(game.playerTitan, 'colossal');
  game.setPlayerTitan('does-not-exist');
  assert.equal(game.playerTitan, 'colossal', 'invalid ids are rejected');
  game.start();
  game.setPlayerTitan('laranja');
  assert.equal(game.playerTitan, 'laranja');
  // Restart keeps the choice but the choice never changes spawn behaviour:
  // spawns only produce 'human' or 'titan' kinds.
  for (let i = 0; i < 400; i++) {
    game.spawn();
    const entity = game.entities[game.entities.length - 1];
    assert.ok(entity.kind === 'human' || entity.kind === 'titan',
      'the playable titan never appears as an edible spawn');
  }
});

test('the chosen titan is excluded from rival spawns; all others fall', () => {
  // Rival variant index = position in PLAYER_TITAN_IDS:
  // 0 original, 1 cinza, 2 laranja, 3 beast, 4 armored, 5 colossal.
  // Choosing a titan removes it from the menu of edible rivals.
  const beastGame = new HungerEngine({ random: seeded(3) });
  beastGame.start();
  beastGame.setPlayerTitan('beast');
  const beastVariants = new Set();
  for (let i = 0; i < 500; i++) {
    beastGame.spawn();
    const entity = beastGame.entities[beastGame.entities.length - 1];
    if (entity.kind === 'titan') beastVariants.add(entity.variant);
    beastGame.entities.length = 0;
  }
  assert.ok(beastVariants.size > 0, 'rival titans still spawn when beast is chosen');
  assert.ok(!beastVariants.has(3), 'the chosen beast titan never spawns as food');
  assert.ok(beastVariants.has(4), 'the armored titan still falls as food');
  assert.ok(beastVariants.has(5), 'the colossal titan still falls as food');
  assert.ok(beastVariants.has(1) && beastVariants.has(2), 'the other titans fall as food too');

  const armoredGame = new HungerEngine({ random: seeded(4) });
  armoredGame.start();
  armoredGame.setPlayerTitan('armored');
  const armoredVariants = new Set();
  for (let i = 0; i < 500; i++) {
    armoredGame.spawn();
    const entity = armoredGame.entities[armoredGame.entities.length - 1];
    if (entity.kind === 'titan') armoredVariants.add(entity.variant);
    armoredGame.entities.length = 0;
  }
  assert.ok(armoredVariants.size > 0, 'rival titans still spawn when armored is chosen');
  assert.ok(!armoredVariants.has(4), 'the chosen armored titan never spawns as food');
  assert.ok(armoredVariants.has(3), 'the beast titan still falls as food');

  // With a non-rival titan chosen, the rivals and the other titans keep falling.
  const bothGame = new HungerEngine({ random: seeded(5) });
  bothGame.start();
  bothGame.setPlayerTitan('cinza');
  const bothVariants = new Set();
  for (let i = 0; i < 500; i++) {
    bothGame.spawn();
    const entity = bothGame.entities[bothGame.entities.length - 1];
    if (entity.kind === 'titan') bothVariants.add(entity.variant);
    bothGame.entities.length = 0;
  }
  assert.ok(bothVariants.has(3) && bothVariants.has(4), 'both rivals fall when a non-rival is chosen');
  assert.ok(bothVariants.has(5), 'the colossal titan falls when a non-rival is chosen');
  assert.ok(!bothVariants.has(1), 'the chosen cinza titan never spawns as food');
});

test('the playable titan choice survives restarts', () => {
  const game = new HungerEngine({ playerTitan: 'cinza' });
  game.start();
  assert.equal(game.playerTitan, 'cinza');
  game.start();
  assert.equal(game.playerTitan, 'cinza');
  game.score = 42;
  game.start();
  assert.equal(game.playerTitan, 'cinza', 'restart keeps the chosen titan');
});

function countTitans(game, waves) {
  let titans = 0;
  for (let i = 0; i < waves; i++) {
    game.spawn();
    if (game.entities[game.entities.length - 1].kind === 'titan') titans++;
    game.entities.length = 0;
  }
  return titans;
}
