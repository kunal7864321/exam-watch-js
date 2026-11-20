export declare const EVENT_TYPES: Readonly<{
  TAB_HIDDEN: 'tab_hidden';
  TAB_VISIBLE: 'tab_visible';
  WINDOW_BLUR: 'window_blur';
  WINDOW_FOCUS: 'window_focus';
  FULLSCREEN_EXIT: 'fullscreen_exit';
  FULLSCREEN_ENTER: 'fullscreen_enter';
  COPY: 'copy';
  CUT: 'cut';
  PASTE: 'paste';
  CONTEXT_MENU: 'context_menu';
  PRINT: 'print';
  KEY_SHORTCUT: 'key_shortcut';
  IDLE: 'idle';
  ACTIVE: 'active';
  OFFLINE: 'offline';
  ONLINE: 'online';
  VIOLATION_LIMIT: 'violation_limit_reached';
}>;

export type ExamEventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface ExamEvent {
  type: ExamEventType;
  timestamp: number;
  isViolation: boolean;
  [detail: string]: unknown;
}

export interface ExamMonitorOptions {
  detectTabSwitch?: boolean;
  detectWindowBlur?: boolean;
  detectFullscreen?: boolean;
  detectClipboard?: boolean;
  detectContextMenu?: boolean;
  detectPrint?: boolean;
  detectShortcuts?: boolean;
  detectIdle?: boolean;
  detectConnection?: boolean;
  blockClipboard?: boolean;
  blockContextMenu?: boolean;
  idleAfterMs?: number;
  maxViolations?: number;
  onEvent?: (event: ExamEvent) => void;
  onViolationLimit?: (event: ExamEvent) => void;
  /** Override the window object (tests / custom environments). */
  target?: Window;
}

export interface ExamSummary {
  violations: number;
  total: number;
  counts: Record<string, number>;
}

export declare class ExamMonitor {
  constructor(options?: ExamMonitorOptions);
  static isSupported(): boolean;
  readonly running: boolean;
  readonly violationCount: number;
  start(): this;
  stop(): this;
  reset(): this;
  on(type: ExamEventType | '*', fn: (event: ExamEvent) => void): () => void;
  off(type: ExamEventType | '*', fn: (event: ExamEvent) => void): void;
  getEvents(): ExamEvent[];
  getSummary(): ExamSummary;
  requestFullscreen(element?: Element): Promise<void>;
}

export declare function createMonitor(options?: ExamMonitorOptions): ExamMonitor;
export default ExamMonitor;
