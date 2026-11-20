import test from 'node:test';
import assert from 'node:assert/strict';
import { ExamMonitor, EVENT_TYPES } from '../src/index.js';

// Minimal fake window/document with an event system.
function makeEnv() {
  const make = () => {
    const map = new Map();
    return {
      addEventListener: (t, fn) => {
        if (!map.has(t)) map.set(t, new Set());
        map.get(t).add(fn);
      },
      removeEventListener: (t, fn) => map.get(t)?.delete(fn),
      dispatch: (t, ev = {}) => {
        let prevented = false;
        const e = { ...ev, preventDefault: () => (prevented = true) };
        map.get(t)?.forEach((fn) => fn(e));
        return prevented;
      },
      count: () => [...map.values()].reduce((n, s) => n + s.size, 0),
    };
  };
  const doc = Object.assign(make(), { hidden: false, fullscreenElement: null });
  const win = Object.assign(make(), { document: doc });
  return { win, doc };
}

test('records tab switches as violations', () => {
  const { win, doc } = makeEnv();
  const m = new ExamMonitor({ target: win, detectIdle: false }).start();
  doc.hidden = true;
  doc.dispatch('visibilitychange');
  doc.hidden = false;
  doc.dispatch('visibilitychange');
  const s = m.getSummary();
  assert.equal(s.counts[EVENT_TYPES.TAB_HIDDEN], 1);
  assert.equal(s.counts[EVENT_TYPES.TAB_VISIBLE], 1);
  assert.equal(s.violations, 1);
  m.stop();
});

test('blocks clipboard when configured', () => {
  const { win, doc } = makeEnv();
  const m = new ExamMonitor({ target: win, detectIdle: false, blockClipboard: true }).start();
  assert.equal(doc.dispatch('paste'), true);
  assert.equal(m.violationCount, 1);
  m.stop();
});

test('does not block clipboard by default', () => {
  const { win, doc } = makeEnv();
  const m = new ExamMonitor({ target: win, detectIdle: false }).start();
  assert.equal(doc.dispatch('copy'), false);
  assert.equal(m.violationCount, 1);
  m.stop();
});

test('fires violation limit once', () => {
  const { win, doc } = makeEnv();
  let fired = 0;
  const m = new ExamMonitor({
    target: win,
    detectIdle: false,
    maxViolations: 2,
    onViolationLimit: () => fired++,
  }).start();
  doc.dispatch('copy');
  doc.dispatch('copy');
  doc.dispatch('copy');
  assert.equal(fired, 1);
  m.stop();
});

test('stop() removes all listeners', () => {
  const { win, doc } = makeEnv();
  const m = new ExamMonitor({ target: win }).start();
  assert.ok(doc.count() + win.count() > 0);
  m.stop();
  assert.equal(doc.count() + win.count(), 0);
});

test('on() subscribers and wildcard receive events; faulty handlers do not break monitoring', () => {
  const { win, doc } = makeEnv();
  const m = new ExamMonitor({ target: win, detectIdle: false });
  const seen = [];
  m.on('*', (e) => seen.push(e.type));
  m.on(EVENT_TYPES.COPY, () => {
    throw new Error('boom');
  });
  const origErr = console.error;
  console.error = () => {};
  m.start();
  doc.dispatch('copy');
  console.error = origErr;
  assert.deepEqual(seen, [EVENT_TYPES.COPY]);
});

test('throws without a browser environment', () => {
  assert.throws(() => new ExamMonitor().start(), /no browser environment/);
});

test('idle detection fires', async () => {
  const { win } = makeEnv();
  const m = new ExamMonitor({ target: win, idleAfterMs: 20 }).start();
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(m.getSummary().counts[EVENT_TYPES.IDLE], 1);
  m.stop();
});
