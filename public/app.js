'use strict';
const $ = id => document.getElementById(id);
const localTime = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const localDate = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric' });
let last, connected = false, pending = false;
const defaults = [300, 10080];

function el(tag, cls, content) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (content !== undefined) node.textContent = content;
  return node;
}
function duration(min) {
  return min % 1440 === 0 ? `${min / 1440}-day window`
    : min % 60 === 0 ? `${min / 60}-hour window` : `${min}-minute window`;
}
function countdown(ms) {
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`;
}
function age(ms) {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}
function meter(minutes, row, now, stale) {
  const wrapper = el('div', 'window');
  const expired = row?.resetsAt && row.resetsAt <= now;
  const used = row && !expired ? row.used : null;
  const info = el('div', 'reading');
  info.append(el('h3', '', duration(minutes)), el('strong', used === null ? 'empty' : '', used === null ? '···' : `${Math.round(used)}%`));
  const track = el('progress', used === null ? 'track empty-track' : used >= 90 ? 'track warning' : 'track');
  track.max = 100;
  track.value = Math.min(100, used ?? 0);
  track.setAttribute('aria-label', `${duration(minutes)}: ${used === null ? 'usage unavailable' : `${Math.round(used)}% used`}`);
  const description = expired ? 'Window reset · waiting for a new reading'
    : !row ? 'No reading reported'
    : row.resetsAt ? `Resets in ${countdown(row.resetsAt - now)}`
    : 'Reset time unavailable';
  const meta = el('p', 'reset', description);
  if (row?.resetsAt) meta.title = `${localDate.format(row.resetsAt)} at ${localTime.format(row.resetsAt)}`;
  if (row) {
    const detail = `${row.source} read ${age(now - row.observedAt)}`;
    meta.append(el('span', 'reading-age', ` · ${stale && !expired ? 'Last seen ' + age(now - row.observedAt) : detail}`));
  }
  wrapper.append(info, track, meta);
  return wrapper;
}
function renderProvider(name, data, now) {
  const rows = new Map((data?.windows || []).map(w => [w.minutes, w]));
  const minutes = [...new Set([...defaults, ...rows.keys()])].sort((a, b) => a - b);
  const present = [...rows.values()].filter(w => !w.resetsAt || w.resetsAt > now);
  const staleAfter = name === 'claude' ? 15 * 60_000 : 2 * 60_000;
  const isStale = w => Boolean(w && (!connected || data?.issue || now - w.observedAt > staleAfter));
  const state = !last ? (connected ? 'Connecting' : 'Waiting')
    : !present.length ? 'No reading' : present.every(isStale) ? 'Last seen'
    : present.length < minutes.length || present.some(isStale) ? 'Partial' : 'Current';
  const badge = $(name + '-state');
  badge.textContent = state;
  badge.classList.toggle('current', state === 'Current' || state === 'Partial');
  $(name + '-windows').replaceChildren(...minutes.map(min => meter(min, rows.get(min), now, isStale(rows.get(min)))));
  $(name + '-source').textContent = data?.issue || (name === 'claude'
    ? 'Updates when the Usage Cabaret status line runs in Claude Code.'
    : 'Account limits checked every minute while open.');
}
function render() {
  const now = Date.now();
  $('clock').textContent = `${localDate.format(now)}  /  ${localTime.format(now)}`;
  $('connection').textContent = connected ? 'Live dashboard' : last ? 'Connection lost' : pending ? 'Connecting' : 'Reconnecting';
  document.body.classList.toggle('online', connected);
  if (last) $('last-check').textContent = `Dashboard checked ${localTime.format(last.checkedAt)}`;
  renderProvider('claude', last?.claude, now);
  renderProvider('codex', last?.codex, now);
}
async function refresh() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/api/usage', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error();
    last = await response.json();
    connected = true;
  } catch { connected = false; }
  finally { pending = false; render(); }
}
const stage = document.querySelector('.stage');
const toggle = $('show-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
function syncShow() {
  stage.classList.toggle('paused', paused);
  stage.classList.toggle('playing', !paused);
  $('act').textContent = paused ? 'INTERMISSION' : 'ON STAGE / THE FEATHER REVEAL';
  toggle.textContent = paused ? 'Play show' : 'Pause show';
  toggle.setAttribute('aria-pressed', String(paused));
}
toggle.addEventListener('click', () => { paused = !paused; syncShow(); });
reducedMotion.addEventListener('change', e => { paused = e.matches; syncShow(); });
syncShow();
refresh();
render();
setInterval(() => { if (!document.hidden) refresh(); }, 12_000);
setInterval(render, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
