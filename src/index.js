/**
 * examwatch-js
 * Browser-side exam monitoring. Zero dependencies.
 *
 * Detects and reports integrity-related events (tab switches, window blur,
 * fullscreen exit, copy/paste/cut, right-click, print, inactivity, going
 * offline). It does NOT record audio/video or screens, and nothing is sent
 * anywhere unless you pass an `onEvent` handler that does so.
 *
 * Note: client-side signals can be bypassed by a determined user. Treat them as
 * flags for human review, and always validate on your server.
 */

export const EVENT_TYPES = Object.freeze({
  TAB_HIDDEN: 'tab_hidden',
  TAB_VISIBLE: 'tab_visible',
  WINDOW_BLUR: 'window_blur',
  WINDOW_FOCUS: 'window_focus',
  FULLSCREEN_EXIT: 'fullscreen_exit',
  FULLSCREEN_ENTER: 'fullscreen_enter',
  COPY: 'copy',
  CUT: 'cut',
  PASTE: 'paste',
  CONTEXT_MENU: 'context_menu',
  PRINT: 'print',
  KEY_SHORTCUT: 'key_shortcut',
  IDLE: 'idle',
  ACTIVE: 'active',
  OFFLINE: 'offline',
  ONLINE: 'online',
  VIOLATION_LIMIT: 'violation_limit_reached',
});

const DEFAULTS = {
  // What to watch
  detectTabSwitch: true,
  detectWindowBlur: true,
  detectFullscreen: true,
  detectClipboard: true,
  detectContextMenu: true,
  detectPrint: true,
  detectShortcuts: true,
  detectIdle: true,
  detectConnection: true,
  // What to block (instead of only reporting)
  blockClipboard: false,
  blockContextMenu: false,
  // Tuning
  idleAfterMs: 60_000,
  maxViolations: Infinity,
  // Callbacks
  onEvent: null,
  onViolationLimit: null,
  // Injection points (useful for tests / SSR)
  target: undefined,
};

// Events counted as violations toward `maxViolations`.
const VIOLATION_TYPES = new Set([
  EVENT_TYPES.TAB_HIDDEN,
  EVENT_TYPES.WINDOW_BLUR,
  EVENT_TYPES.FULLSCREEN_EXIT,
  EVENT_TYPES.COPY,
  EVENT_TYPES.CUT,
  EVENT_TYPES.PASTE,
  EVENT_TYPES.PRINT,
  EVENT_TYPES.KEY_SHORTCUT,
]);

const SHORTCUT_KEYS = new Set(['c', 'v', 'x', 'p', 'u', 's', 'a', 'f']);

export class ExamMonitor {
  /**
   * @param {object} [options] see DEFAULTS
   */
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this._listeners = new Map(); // eventName -> Set<fn>
    this._cleanup = [];
    this._events = [];
    this._violations = 0;
    this._running = false;
    this._idle = false;
    this._idleTimer = null;
    this._limitFired = false;
  }

  /** True in environments with a DOM (false on server / SSR). */
  static isSupported() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  get running() {
    return this._running;
  }

  get violationCount() {
    return this._violations;
  }

  /** Copy of every event recorded this session. */
  getEvents() {
    return this._events.slice();
  }

  /** Counts per event type, e.g. { tab_hidden: 3, copy: 1 } */
  getSummary() {
    const counts = {};
    for (const e of this._events) counts[e.type] = (counts[e.type] || 0) + 1;
    return { violations: this._violations, counts, total: this._events.length };
  }

  /** Subscribe to an event type, or '*' for all. Returns an unsubscribe fn. */
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }

  off(type, fn) {
    this._listeners.get(type)?.delete(fn);
  }

  /** Begin monitoring. Safe to call twice. */
  start() {
    if (this._running) return this;
    const win = this.options.target ?? (ExamMonitor.isSupported() ? window : null);
    if (!win) {
      throw new Error('examwatch-js: no browser environment found (window/document missing).');
    }
    const doc = win.document;
    const o = this.options;
    this._running = true;

    const add = (el, evt, handler, opts) => {
      el.addEventListener(evt, handler, opts);
      this._cleanup.push(() => el.removeEventListener(evt, handler, opts));
    };

    if (o.detectTabSwitch) {
      add(doc, 'visibilitychange', () => {
        this._record(doc.hidden ? EVENT_TYPES.TAB_HIDDEN : EVENT_TYPES.TAB_VISIBLE);
      });
    }

    if (o.detectWindowBlur) {
      add(win, 'blur', () => {
        // When the tab is hidden, visibilitychange already reports it.
        if (!doc.hidden) this._record(EVENT_TYPES.WINDOW_BLUR);
      });
      add(win, 'focus', () => this._record(EVENT_TYPES.WINDOW_FOCUS));
    }

    if (o.detectFullscreen) {
      add(doc, 'fullscreenchange', () => {
        this._record(
          doc.fullscreenElement ? EVENT_TYPES.FULLSCREEN_ENTER : EVENT_TYPES.FULLSCREEN_EXIT
        );
      });
    }

    if (o.detectClipboard) {
      for (const [evt, type] of [
        ['copy', EVENT_TYPES.COPY],
        ['cut', EVENT_TYPES.CUT],
        ['paste', EVENT_TYPES.PASTE],
      ]) {
        add(doc, evt, (e) => {
          if (o.blockClipboard) e.preventDefault();
          this._record(type, { blocked: !!o.blockClipboard });
        });
      }
    }

    if (o.detectContextMenu) {
      add(doc, 'contextmenu', (e) => {
        if (o.blockContextMenu) e.preventDefault();
        this._record(EVENT_TYPES.CONTEXT_MENU, { blocked: !!o.blockContextMenu });
      });
    }

    if (o.detectPrint) {
      add(win, 'beforeprint', () => this._record(EVENT_TYPES.PRINT));
    }

    if (o.detectShortcuts) {
      add(doc, 'keydown', (e) => {
        const key = (e.key || '').toLowerCase();
        const mod = e.ctrlKey || e.metaKey;
        if ((mod && SHORTCUT_KEYS.has(key)) || key === 'f12' || key === 'printscreen') {
          this._record(EVENT_TYPES.KEY_SHORTCUT, { key: e.key, ctrl: !!e.ctrlKey, meta: !!e.metaKey });
        }
      });
    }

    if (o.detectIdle) {
      const reset = () => this._resetIdle();
      for (const evt of ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']) {
        add(doc, evt, reset, { passive: true });
      }
      this._resetIdle();
    }

    if (o.detectConnection) {
      add(win, 'offline', () => this._record(EVENT_TYPES.OFFLINE));
      add(win, 'online', () => this._record(EVENT_TYPES.ONLINE));
    }

    return this;
  }

  /** Stop monitoring and remove all listeners. */
  stop() {
    for (const fn of this._cleanup) fn();
    this._cleanup = [];
    clearTimeout(this._idleTimer);
    this._idleTimer = null;
    this._running = false;
    return this;
  }

  /** Clear recorded events and violation count. */
  reset() {
    this._events = [];
    this._violations = 0;
    this._limitFired = false;
    return this;
  }

  /**
   * Ask the browser to enter fullscreen (must be called from a user gesture,
   * e.g. a button click).
   */
  async requestFullscreen(element) {
    const el = element ?? (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el || !el.requestFullscreen) {
      throw new Error('examwatch-js: Fullscreen API is not supported here.');
    }
    await el.requestFullscreen();
  }

  _resetIdle() {
    if (this._idle) {
      this._idle = false;
      this._record(EVENT_TYPES.ACTIVE);
    }
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => {
      this._idle = true;
      this._record(EVENT_TYPES.IDLE, { afterMs: this.options.idleAfterMs });
    }, this.options.idleAfterMs);
  }

  _record(type, detail = {}) {
    const event = { type, timestamp: Date.now(), isViolation: VIOLATION_TYPES.has(type), ...detail };
    this._events.push(event);
    if (event.isViolation) this._violations += 1;

    this._emit(type, event);
    this._emit('*', event);
    if (typeof this.options.onEvent === 'function') this._safe(this.options.onEvent, event);

    if (
      event.isViolation &&
      !this._limitFired &&
      this._violations >= this.options.maxViolations
    ) {
      this._limitFired = true;
      const limitEvent = {
        type: EVENT_TYPES.VIOLATION_LIMIT,
        timestamp: Date.now(),
        isViolation: false,
        violations: this._violations,
      };
      this._events.push(limitEvent);
      this._emit(limitEvent.type, limitEvent);
      this._emit('*', limitEvent);
      if (typeof this.options.onViolationLimit === 'function') {
        this._safe(this.options.onViolationLimit, limitEvent);
      }
    }
    return event;
  }

  _emit(type, event) {
    const set = this._listeners.get(type);
    if (set) for (const fn of [...set]) this._safe(fn, event);
  }

  _safe(fn, arg) {
    try {
      fn(arg);
    } catch (err) {
      // A faulty handler must never break monitoring.
      if (typeof console !== 'undefined') console.error('examwatch-js handler error:', err);
    }
  }
}

/** Convenience factory: createMonitor(opts).start() */
export function createMonitor(options) {
  return new ExamMonitor(options);
}

export default ExamMonitor;
