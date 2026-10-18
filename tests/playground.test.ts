/*
 * The playground engine's pure parts, without a browser: the whole-number pixel fit, frame pacing at 30 fps,
 * the seeded generator, gesture thresholds, and hit-testing (box, mask, mirroring, a hop, draw order). The canvas side is checked in a real browser by tests/playground-e2e.cjs.
 */
import { fitGrid, fitBacking, toWorld } from '../src/playground/grid';
import { FrameGate, TICK_MS, MAX_CATCH_UP } from '../src/playground/frame';
import { Rng, hashSeed } from '../src/playground/rng';
import { Gestures, LONG_PRESS_MS, TAP_SLOP_PX } from '../src/playground/gestures';
import { World } from '../src/playground/world';
import type { Sprite, SpriteSource } from '../src/playground/sprites';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/* ---- pixel fit */
{
  // Pixel 7-ish: 412 x 915 CSS at 2.625
  const f = fitGrid(412, 915, 2.625, { minW: 120, minH: 160 });
  check('fit: whole-number scale', Number.isInteger(f.scale) && f.scale >= 1, JSON.stringify(f));
  check('fit: shows at least the minimum world', f.viewW >= 120 && f.viewH >= 160, JSON.stringify(f));
  check('fit: largest scale that does', Math.floor(f.backW / (f.scale + 1)) < 120 || Math.floor(f.backH / (f.scale + 1)) < 160);
  check('fit: world plus margins fill the canvas exactly', f.viewW * f.scale + 2 * f.offX <= f.backW && f.backW - f.viewW * f.scale - 2 * f.offX <= 1 && f.offX < f.scale && f.offY < f.scale, JSON.stringify(f));
  const capped = fitBacking(2560, 1600, { minW: 120, minH: 160, maxScale: 6 });
  check('fit: maxScale caps a tablet, which then sees more world', capped.scale === 6 && capped.viewW === Math.floor(2560 / 6), JSON.stringify(capped));
  const tiny = fitBacking(50, 50, { minW: 120, minH: 160 });
  check('fit: never below one device pixel per world pixel', tiny.scale === 1 && tiny.viewW === 50);
  check('fit: zero-size box survives', fitBacking(0, 0, { minW: 1, minH: 1 }).viewW === 1);
  // every world pixel lands on whole device pixels: toWorld maps each device pixel's centre back to its world pixel
  const g = fitBacking(1081, 2402, { minW: 120, minH: 160 });
  let ok = true;
  for (let dx = g.offX; dx < g.offX + g.viewW * g.scale; dx += 7) {
    const a = toWorld(g, (dx + 0.5), g.offY + 0.5, g.backW, g.backH);
    if (!a || a.x !== Math.floor((dx - g.offX) / g.scale) || a.y !== 0) { ok = false; break; }
  }
  check('fit: device pixel -> world pixel', ok);
  check('fit: the margin is outside the world', toWorld(g, g.offX - 0.5 + (g.offX ? 0 : -1), 10, g.backW, g.backH) === null);
}

/* ---- frame pacing */
{
  const run = (hz: number, ms: number) => {
    const gate = new FrameGate(); let draws = 0, ticks = 0;
    for (let t = 0; t <= ms; t += 1000 / hz) { const n = gate.frame(t); if (n) draws++; ticks += n; }
    return { draws, ticks };
  };
  for (const hz of [60, 90, 120, 144]) {
    const r = run(hz, 10_000);
    check(`frames: ${hz} Hz screen draws about 30 a second`, r.draws >= 295 && r.draws <= 301, JSON.stringify(r));
    check(`frames: ${hz} Hz screen steps about 30 ticks a second`, r.ticks >= 298 && r.ticks <= 301, JSON.stringify(r));
  }
  const r30 = run(30, 10_000);
  check('frames: a 30 Hz screen draws every frame', r30.draws >= 299, JSON.stringify(r30));
  const gate = new FrameGate();
  gate.frame(0);
  check('frames: a long stall catches up only a few ticks', gate.frame(5000) === MAX_CATCH_UP);
  gate.reset(); gate.frame(100_000);
  check('frames: after reset the time away is not caught up', gate.frame(100_000 + TICK_MS) === 1);
}

/* ---- seeded generator */
{
  const a = new Rng('user-1:2026-10-13'), b = new Rng('user-1:2026-10-13'), c = new Rng('user-2:2026-10-13');
  const sa = Array.from({ length: 50 }, () => a.next()), sb = Array.from({ length: 50 }, () => b.next());
  check('rng: same seed, same world', JSON.stringify(sa) === JSON.stringify(sb));
  check('rng: another seed, another world', c.next() !== sa[0]);
  check('rng: within [0, 1)', sa.every(x => x >= 0 && x < 1));
  const r = new Rng(7); const ints = Array.from({ length: 2000 }, () => r.int(3, 5));
  check('rng: int covers its range inclusively', [3, 4, 5].every(v => ints.includes(v)) && ints.every(v => v >= 3 && v <= 5));
  const f1 = new Rng(9).fork('trees'), f2 = new Rng(9).fork('trees'), f3 = new Rng(9).fork('rocks');
  check('rng: forks are stable and independent', f1.next() === f2.next() && f1.next() !== f3.next());
  check('rng: hash is FNV-1a', hashSeed('') === 0x811c9dc5 && hashSeed('a') === 0xe40c292c);
}

/* ---- gestures */
{
  const timers: Array<{ f: () => void, at: number, dead?: boolean }> = []; let now = 0;
  const T = { set: (f: () => void, ms: number) => { const t = { f, at: now + ms }; timers.push(t); return t; }, clear: (t: unknown) => { (t as { dead: boolean }).dead = true; } };
  const advance = (ms: number) => { now += ms; for (const t of timers) if (!t.dead && t.at <= now) { t.dead = true; t.f(); } };
  const seen: string[] = [];
  const gs = new Gestures<string>({
    tap: p => seen.push(`tap ${p}`), longPress: p => seen.push(`long ${p}`),
    dragStart: (p, l) => seen.push(`start ${p}${l ? ' long' : ''}`), drag: p => seen.push(`drag ${p}`), dragEnd: (p, c) => seen.push(`end ${p}${c ? ' cancelled' : ''}`),
  }, T);
  gs.down(1, { x: 0, y: 0 }, 'A'); advance(100); gs.move(1, { x: TAP_SLOP_PX - 1, y: 0 }, 'A2'); gs.up(1, 'A3');
  check('gestures: a short press that wobbles a little is a tap', seen.join('|') === 'tap A', seen.join('|'));
  seen.length = 0; advance(1000);
  check('gestures: a tap leaves no long press behind', seen.length === 0);
  gs.down(1, { x: 0, y: 0 }, 'B'); gs.move(1, { x: 20, y: 0 }, 'B2'); gs.move(1, { x: 30, y: 0 }, 'B3'); gs.up(1, 'B4');
  check('gestures: moving past the slop drags from the down point', seen.join('|') === 'start B|drag B2|drag B3|end B4', seen.join('|'));
  seen.length = 0;
  gs.down(1, { x: 0, y: 0 }, 'C'); advance(LONG_PRESS_MS); gs.move(1, { x: 40, y: 0 }, 'C2'); gs.cancel(1);
  check('gestures: long press then move is a lift, cancel reports it', seen.join('|') === 'long C|start C long|drag C2|end C2 cancelled', seen.join('|'));
  seen.length = 0;
  gs.down(1, { x: 0, y: 0 }, 'D'); gs.down(2, { x: 50, y: 0 }, 'E'); gs.up(2, 'E'); gs.up(1, 'D');
  check('gestures: a second finger is ignored', seen.join('|') === 'tap D', seen.join('|'));
  seen.length = 0;
  gs.down(1, { x: 0, y: 0 }, 'F'); advance(LONG_PRESS_MS); gs.up(1, 'F');
  check('gestures: a long press released in place is not a tap', seen.join('|') === 'long F', seen.join('|'));
  seen.length = 0;
  gs.down(1, { x: 0, y: 0 }, 'G'); gs.abort(); advance(LONG_PRESS_MS * 2); gs.up(1, 'G');
  gs.down(2, { x: 0, y: 0 }, 'H'); gs.up(2, 'H');
  check('gestures: abort (the stage going away) leaves no late long press and frees the finger', seen.join('|') === 'tap H', seen.join('|'));
}

/* ---- world: hit-testing and draw order */
{
  // a 4 x 4 sprite painted only in its left half; anchor bottom-centre
  const mask = new Uint8Array(16); for (let y = 0; y < 4; y++) { mask[y * 4] = 1; mask[y * 4 + 1] = 1; }
  const s: Sprite = { key: 'half', image: null as unknown as CanvasImageSource, w: 4, h: 4, anchor: { x: 2, y: 3 }, gait: 'upright', mask };
  const box: Sprite = { ...s, key: 'box', mask: undefined };
  const src: SpriteSource = { get: k => (k === 'half' ? s : k === 'box' ? box : undefined), load: async () => {} };
  const w = new World(src, { seed: 1, w: 50, h: 50 });
  const a = w.add({ id: 'a', x: 10, y: 10, sprite: 'half' });
  check('world: box from the anchor', JSON.stringify(w.box(a)) === '{"x":8,"y":7,"w":4,"h":4}', JSON.stringify(w.box(a)));
  check('world: painted pixel hits', w.hitTest(8, 7) === a && w.hitTest(9, 10) === a);
  check('world: unpainted pixel in the box misses', w.hitTest(10, 8) === null && w.hitTest(11, 8) === null);
  a.flip = true;
  check('world: mirrored sprite mirrors its anchor and mask', JSON.stringify(w.box(a)) === '{"x":9,"y":7,"w":4,"h":4}' && w.hitTest(12, 8) === a && w.hitTest(9, 8) === null, JSON.stringify(w.box(a)));
  a.flip = false; a.lift = 5;
  check('world: a hop moves the hit area up', w.hitTest(8, 2) === a && w.hitTest(8, 7) === null);
  a.lift = 0;
  const b = w.add({ id: 'b', x: 10, y: 11, sprite: 'box' });
  check('world: the nearer creature (lower on screen) is drawn last and hit first', w.drawOrder().map(e => e.id).join() === 'a,b' && w.hitTest(9, 8) === b);
  b.inert = true;
  check('world: inert entities are not tappable', w.hitTest(9, 8) === a);
  b.hidden = true;
  check('world: hidden entities are not drawn', w.drawOrder().length === 1);
  w.add({ id: 'ghost', x: 30, y: 30, sprite: 'not-loaded' });
  check('world: a sprite not loaded yet is neither hit nor fatal', w.hitTest(30, 29) === null);
  let ups = 0; w.add({ id: 'u', x: 0, y: 0, sprite: 'box', update () { ups++; if (ups === 1) w.add({ id: 'late', x: 0, y: 0, sprite: 'box' }); } });
  w.step(); w.step();
  check('world: step runs updates and survives entities added mid-step', ups === 2 && w.tick === 2 && !!w.byId('late'));
  let resized = 0; w.addLayer({ id: 'l', depth: 'back', draw () {}, resize () { resized++; } });
  w.resize(50, 50); w.resize(60, 50);
  check('world: layers rebuild once per real size change', resized === 2, String(resized));
}

/* ---- entities that hit-test and draw themselves (a ball, a mount's two layers) */
{
  const src: SpriteSource = { get: () => undefined, load: async () => {} };
  const w = new World(src, { seed: 1, w: 50, h: 50 });
  let drawn = 0;
  const own = w.add({ id: 'own', sprite: 'none', x: 10, y: 10, hit: (x, y) => x === 10 && y === 10, draw: () => { drawn++; } });
  w.add({ id: 'ghost', sprite: 'none', x: 10, y: 20, inert: true, hit: () => true, draw: () => { drawn++; } });
  check('world: hit() decides an entity\'s hit test', w.hitTest(10, 10) === own && w.hitTest(11, 10) === null);
  check('world: inert entities are skipped before hit()', w.hitTest(10, 20) === null);
  const g = { set imageSmoothingEnabled (_: boolean) {}, set fillStyle (_: string) {}, fillRect () {} } as unknown as CanvasRenderingContext2D;
  w.draw(g);
  check('world: an entity that draws itself is drawn without a catalogue sprite', drawn === 2, String(drawn));
}

if (failures) { console.log(`FAIL  playground: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  playground: all ${passes} checks (pixel fit, 30 fps pacing, seeds, gestures, hit-testing)`);
