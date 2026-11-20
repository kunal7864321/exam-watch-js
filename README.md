# examwatch-js

## Live demo

- [Open the deployed demo](https://kunal7864321.github.io/exam-watch-js/)
- [Browse the demo source](https://github.com/kunal7864321/exam-watch-js/tree/main/demo)

The demo installs `examwatch-js` from npm and uses `ExamMonitor` in a Vite browser app.

Lightweight, zero-dependency, browser-side **online exam monitoring** library. It detects integrity-related events during an exam and hands them to your code so you can log, warn, or flag them.

It detects: tab switches, window blur, fullscreen exit, copy/cut/paste, right-click, print, suspicious shortcuts (Ctrl+C/V/U, F12, PrintScreen...), inactivity, and going offline.

It does **not** record video, audio, or screens, and it sends nothing anywhere on its own.

## Install

```bash
npm install examwatch-js
```

## Quick start

```js
import { ExamMonitor, EVENT_TYPES } from 'examwatch-js';

const monitor = new ExamMonitor({
  maxViolations: 5,
  blockClipboard: true,
  idleAfterMs: 90_000,
  onEvent: (event) => {
    // e.g. send to your backend
    fetch('/api/exam/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  },
  onViolationLimit: () => alert('Too many violations. Your exam will be submitted.'),
});

monitor.on(EVENT_TYPES.TAB_HIDDEN, () => showWarning('Please stay on the exam tab.'));

startButton.addEventListener('click', async () => {
  await monitor.requestFullscreen(); // must be called from a user gesture
  monitor.start();
});

submitButton.addEventListener('click', () => {
  monitor.stop();
  console.log(monitor.getSummary()); // { violations: 2, total: 9, counts: {...} }
});
```

## API

### `new ExamMonitor(options)`

| Option | Default | Description |
| --- | --- | --- |
| `detectTabSwitch` | `true` | Tab hidden / visible |
| `detectWindowBlur` | `true` | Window loses / regains focus |
| `detectFullscreen` | `true` | Fullscreen enter / exit |
| `detectClipboard` | `true` | copy, cut, paste |
| `detectContextMenu` | `true` | Right-click |
| `detectPrint` | `true` | Print dialog |
| `detectShortcuts` | `true` | Ctrl/Cmd + C V X P U S A F, F12, PrintScreen |
| `detectIdle` | `true` | No input for `idleAfterMs` |
| `detectConnection` | `true` | online / offline |
| `blockClipboard` | `false` | Prevent copy/cut/paste instead of only reporting |
| `blockContextMenu` | `false` | Prevent the right-click menu |
| `idleAfterMs` | `60000` | Idle threshold |
| `maxViolations` | `Infinity` | Fires `onViolationLimit` once when reached |
| `onEvent` | `null` | Called for every event |
| `onViolationLimit` | `null` | Called once when `maxViolations` is reached |

### Methods

- `start()` / `stop()` / `reset()`
- `on(type | '*', fn)` returns an unsubscribe function; `off(type, fn)`
- `getEvents()`, `getSummary()`, `violationCount`
- `requestFullscreen(element?)`
- `ExamMonitor.isSupported()`

### Event shape

```ts
{ type: 'tab_hidden', timestamp: 1730000000000, isViolation: true, ...details }
```

Violations are: `tab_hidden`, `window_blur`, `fullscreen_exit`, `copy`, `cut`, `paste`, `print`, `key_shortcut`.

## Important notes

- **Client-side signals can be bypassed.** Use them as flags for human review, and always enforce rules and validate answers on your server.
- **Be transparent and compliant.** Tell candidates what is monitored and why, and follow your local privacy laws (e.g. GDPR, India's DPDP Act) and your institution's policy.
- Works in the browser; in SSR frameworks, call `start()` only on the client (check `ExamMonitor.isSupported()`).

## License

MIT
