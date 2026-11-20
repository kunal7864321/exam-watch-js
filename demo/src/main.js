import { ExamMonitor, EVENT_TYPES } from 'examwatch-js';
import './style.css';

const startButton = document.querySelector('#start');
const fullscreenButton = document.querySelector('#fullscreen');
const resetButton = document.querySelector('#reset');
const statusBadge = document.querySelector('#status');
const violations = document.querySelector('#violations');
const total = document.querySelector('#total');
const eventList = document.querySelector('#events');

const monitor = new ExamMonitor({
  idleAfterMs: 30_000,
  maxViolations: 10,
  blockContextMenu: false,
  onEvent: (event) => addEvent(event),
  onViolationLimit: () => {
    statusBadge.textContent = 'Limit reached';
    statusBadge.className = 'badge danger';
  },
});

monitor.on(EVENT_TYPES.ACTIVE, () => setStatus('Monitoring'));

startButton.addEventListener('click', () => {
  if (monitor.running) {
    monitor.stop();
    setStatus('Stopped');
    startButton.textContent = 'Start monitoring';
  } else {
    monitor.start();
    setStatus('Monitoring');
    startButton.textContent = 'Stop monitoring';
  }
});

fullscreenButton.addEventListener('click', async () => {
  try {
    await monitor.requestFullscreen();
  } catch (error) {
    addEvent({ type: 'fullscreen_error', timestamp: Date.now(), detail: error.message });
  }
});

resetButton.addEventListener('click', () => {
  monitor.reset();
  eventList.innerHTML = '<li class="empty">Event log cleared.</li>';
  updateStats();
});

function setStatus(text) {
  statusBadge.textContent = text;
  statusBadge.className = `badge ${text === 'Monitoring' ? 'live' : ''}`;
}

function updateStats() {
  const summary = monitor.getSummary();
  violations.textContent = String(summary.violations);
  total.textContent = String(summary.total);
}

function addEvent(event) {
  const empty = eventList.querySelector('.empty');
  if (empty) empty.remove();

  const item = document.createElement('li');
  const time = new Date(event.timestamp).toLocaleTimeString();
  item.className = event.isViolation ? 'violation' : '';
  item.innerHTML = `<time>${time}</time><code>${event.type}</code>`;
  eventList.prepend(item);
  updateStats();
}
