/* =============================================
   Personal Countdown Hub — script.js
   Timezone-aware (Africa/Lagos default)
   localStorage persistence, JSON export/import
   ============================================= */

'use strict';

/* ── Constants ───────────────────────────────── */
const STORAGE_KEY   = 'pch_events_v1';
const DEFAULT_TZ    = 'Africa/Lagos';
const MAX_EVENTS    = 100;

/* ── State ───────────────────────────────────── */
let events     = [];       // Array of event objects
let filterMode = 'all';    // 'all' | 'active' | 'completed'
let searchTerm = '';
let tickTimer  = null;
let pendingDeleteId = null;
let editingId  = null;

/* ── Event schema
  {
    id:          string   (uuid-ish)
    title:       string
    description: string
    targetISO:   string   (ISO 8601, local time entered as Africa/Lagos)
    targetMs:    number   (UTC epoch ms — computed at save time)
    color:       string   (hex)
    featured:    boolean
    createdAt:   number   (UTC epoch ms)
  }
 ── */

/* ══════════════════════════════════════════════
   STORAGE
══════════════════════════════════════════════ */

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    showToast('Storage full — could not save.', 'error');
  }
}

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      events = parsed.filter(isValidEvent);
    }
  } catch (e) {
    console.error('PCH: failed to load events', e);
  }
}

/* ══════════════════════════════════════════════
   DATE / TIME HELPERS
══════════════════════════════════════════════ */

/**
 * Given a date string "YYYY-MM-DD" and time string "HH:MM",
 * interpret them as Africa/Lagos local time and return UTC epoch ms.
 * We use the Intl API trick: format a reference date in the target TZ
 * to find its UTC offset, then compute accordingly.
 */
function lagosLocalToUtcMs(dateStr, timeStr) {
  // Combine into a naive ISO-like string (no Z, no offset)
  const naive = `${dateStr}T${timeStr || '00:00'}:00`;

  // We interpret this as Africa/Lagos. Africa/Lagos is always UTC+1 (WAT),
  // no DST. But we use the runtime's Intl support for correctness.
  const [year, month, day]    = dateStr.split('-').map(Number);
  const [hour, minute]        = (timeStr || '00:00').split(':').map(Number);

  // Create a UTC Date and measure how Lagos differs
  const probeUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const lagosStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(new Date(probeUtc));

  // lagosStr looks like "2025-06-15, 14:30:00"
  const lagosDate = new Date(lagosStr.replace(', ', 'T') + 'Z');
  const offsetMs  = lagosDate - probeUtc; // difference
  return probeUtc - offsetMs;
}

/**
 * Format a UTC epoch ms as a readable target date string in Lagos time.
 */
function formatTargetDate(ms) {
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: DEFAULT_TZ,
    weekday: 'short',
    year:    'numeric',
    month:   'short',
    day:     'numeric',
    hour:    '2-digit',
    minute:  '2-digit',
    hour12:  true
  }).format(new Date(ms));
}

/**
 * Decompose a positive ms delta into d / h / m / s.
 */
function msToComponents(ms) {
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0 };
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const totalHr = Math.floor(totalMin / 60);
  const h = totalHr % 24;
  const d = Math.floor(totalHr / 24);
  return { d, h, m, s };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* ══════════════════════════════════════════════
   ID GENERATION
══════════════════════════════════════════════ */

function genId() {
  return 'pch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

/* ══════════════════════════════════════════════
   VALIDATION
══════════════════════════════════════════════ */

function isValidEvent(e) {
  return (
    e &&
    typeof e.id        === 'string' &&
    typeof e.title     === 'string' && e.title.trim().length > 0 &&
    typeof e.targetMs  === 'number' && isFinite(e.targetMs)
  );
}

function validateImportData(arr) {
  if (!Array.isArray(arr)) throw new Error('Data must be a JSON array.');
  if (arr.length > MAX_EVENTS) throw new Error(`Too many events (max ${MAX_EVENTS}).`);
  const validated = [];
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!isValidEvent(e)) {
      throw new Error(`Item at index ${i} is missing required fields (id, title, targetMs).`);
    }
    validated.push({
      id:          String(e.id).slice(0, 80),
      title:       String(e.title).slice(0, 80),
      description: String(e.description || '').slice(0, 200),
      targetISO:   String(e.targetISO || ''),
      targetMs:    Number(e.targetMs),
      color:       /^#[0-9a-fA-F]{6}$/.test(e.color) ? e.color : '#6c63ff',
      featured:    Boolean(e.featured),
      createdAt:   Number(e.createdAt) || Date.now()
    });
  }
  return validated;
}

/* ══════════════════════════════════════════════
   FEATURED EVENT HELPERS
══════════════════════════════════════════════ */

function getFeatured() {
  return events.find(e => e.featured) || null;
}

function setFeatured(id) {
  events.forEach(e => { e.featured = (e.id === id); });
  saveEvents();
  renderFeatured();
  renderGrid();
}

/* ══════════════════════════════════════════════
   RENDER — FEATURED SECTION
══════════════════════════════════════════════ */

function renderFeatured() {
  const ev = getFeatured();
  const section = document.getElementById('featuredSection');
  const hint    = document.getElementById('featuredHint');

  if (!ev) {
    document.getElementById('featuredTitle').textContent       = 'No event selected';
    document.getElementById('featuredDescription').textContent = '';
    document.getElementById('fDays').textContent    = '--';
    document.getElementById('fHours').textContent   = '--';
    document.getElementById('fMinutes').textContent = '--';
    document.getElementById('fSeconds').textContent = '--';
    section.classList.remove('is-completed');
    hint.hidden = false;
    return;
  }

  hint.hidden = true;
  document.getElementById('featuredTitle').textContent       = ev.title;
  document.getElementById('featuredDescription').textContent = ev.description || '';

  const now   = Date.now();
  const delta = ev.targetMs - now;

  if (delta <= 0) {
    section.classList.add('is-completed');
    document.getElementById('fDays').textContent    = '00';
    document.getElementById('fHours').textContent   = '00';
    document.getElementById('fMinutes').textContent = '00';
    document.getElementById('fSeconds').textContent = '00';
  } else {
    section.classList.remove('is-completed');
    const { d, h, m, s } = msToComponents(delta);
    document.getElementById('fDays').textContent    = String(d);
    document.getElementById('fHours').textContent   = pad2(h);
    document.getElementById('fMinutes').textContent = pad2(m);
    document.getElementById('fSeconds').textContent = pad2(s);
  }
}

/* ══════════════════════════════════════════════
   RENDER — CARDS GRID
══════════════════════════════════════════════ */

function getVisibleEvents() {
  let list = [...events];

  // Filter
  if (filterMode === 'active') {
    list = list.filter(e => e.targetMs > Date.now());
  } else if (filterMode === 'completed') {
    list = list.filter(e => e.targetMs <= Date.now());
  }

  // Search
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter(e =>
      e.title.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );
  }

  // Sort: featured first, then by soonest target
  list.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return a.targetMs - b.targetMs;
  });

  return list;
}

function renderGrid() {
  const grid       = document.getElementById('eventsGrid');
  const emptyState = document.getElementById('emptyState');
  const emptySearch= document.getElementById('emptySearch');
  const visible    = getVisibleEvents();

  emptyState.hidden  = true;
  emptySearch.hidden = true;

  // Clear old cards only
  grid.querySelectorAll('.event-card').forEach(n => n.remove());

  if (events.length === 0) {
    emptyState.hidden = false;
    return;
  }

  if (visible.length === 0) {
    emptySearch.hidden = false;
    return;
  }

  visible.forEach(ev => {
    grid.appendChild(buildCard(ev));
  });
}

function buildCard(ev) {
  const now      = Date.now();
  const delta    = ev.targetMs - now;
  const done     = delta <= 0;
  const { d, h, m, s } = done ? { d: 0, h: 0, m: 0, s: 0 } : msToComponents(delta);

  const card = document.createElement('div');
  card.className = 'event-card' + (ev.featured ? ' is-featured' : '') + (done ? ' is-completed' : '');
  card.dataset.id = ev.id;
  card.style.setProperty('--card-accent', ev.color || '#6c63ff');

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-wrap">
        <div class="card-title">${escHtml(ev.title)}</div>
        <div class="card-date">${formatTargetDate(ev.targetMs)}</div>
      </div>
    </div>

    ${done
      ? `<div class="card-completed-badge">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
           Event completed
         </div>`
      : `<div class="card-countdown">
           <div class="card-unit">
             <span class="card-number" data-field="d">${d}</span>
             <span class="card-unit-label">days</span>
           </div>
           <div class="card-unit">
             <span class="card-number" data-field="h">${pad2(h)}</span>
             <span class="card-unit-label">hrs</span>
           </div>
           <div class="card-unit">
             <span class="card-number" data-field="m">${pad2(m)}</span>
             <span class="card-unit-label">min</span>
           </div>
           <div class="card-unit">
             <span class="card-number" data-field="s">${pad2(s)}</span>
             <span class="card-unit-label">sec</span>
           </div>
         </div>`
    }

    ${ev.description
      ? `<p class="card-desc">${escHtml(ev.description)}</p>`
      : ''}

    <div class="card-footer">
      <button class="card-btn card-btn-feature${ev.featured ? ' active' : ''}" data-action="feature" title="${ev.featured ? 'Unfeature' : 'Feature this event'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${ev.featured ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        ${ev.featured ? 'Featured' : 'Feature'}
      </button>
      <button class="card-btn" data-action="edit">Edit</button>
      <button class="card-btn card-btn-delete" data-action="delete">Delete</button>
    </div>
  `;

  card.addEventListener('click', handleCardClick);
  return card;
}

function handleCardClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = e.currentTarget.dataset.id;
  const action = btn.dataset.action;

  if (action === 'feature') {
    const ev = events.find(x => x.id === id);
    if (!ev) return;
    if (ev.featured) {
      // un-feature
      ev.featured = false;
      saveEvents();
      renderFeatured();
      renderGrid();
    } else {
      setFeatured(id);
      showToast('Featured event updated.', 'success');
    }
  } else if (action === 'edit') {
    openEditModal(id);
  } else if (action === 'delete') {
    openDeleteModal(id);
  }
}

/* Live-update just the numbers in existing cards to avoid full re-render flicker */
function tickCards() {
  const now = Date.now();
  document.querySelectorAll('.event-card').forEach(card => {
    if (card.classList.contains('is-completed')) return;
    const id = card.dataset.id;
    const ev = events.find(x => x.id === id);
    if (!ev) return;
    const delta = ev.targetMs - now;
    if (delta <= 0) {
      // Trigger a full re-render once so the card flips to "completed"
      renderGrid();
      return;
    }
    const { d, h, m, s } = msToComponents(delta);
    const set = (field, val) => {
      const el = card.querySelector(`[data-field="${field}"]`);
      if (el) el.textContent = field === 'd' ? d : pad2(val);
    };
    set('d', d); set('h', h); set('m', m); set('s', s);
  });
}

/* ══════════════════════════════════════════════
   MODAL — NEW / EDIT EVENT
══════════════════════════════════════════════ */

function openNewModal() {
  editingId = null;
  document.getElementById('modalTitle').textContent = 'New Event';
  document.getElementById('btnSave').textContent    = 'Save Event';
  resetForm();

  // Default date to today in Lagos
  const todayLagos = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  document.getElementById('eventDate').value = todayLagos;
  document.getElementById('eventTime').value = '12:00';

  showModal('modalOverlay');
}

function openEditModal(id) {
  const ev = events.find(x => x.id === id);
  if (!ev) return;
  editingId = id;

  document.getElementById('modalTitle').textContent = 'Edit Event';
  document.getElementById('btnSave').textContent    = 'Save Changes';

  // Pre-fill from stored ISO date (we saved the local date string)
  const parts = (ev.targetISO || '').split('T');
  document.getElementById('eventId').value       = ev.id;
  document.getElementById('eventTitle').value    = ev.title;
  document.getElementById('eventDate').value     = parts[0] || '';
  document.getElementById('eventTime').value     = (parts[1] || '00:00').slice(0, 5);
  document.getElementById('eventDesc').value     = ev.description || '';
  document.getElementById('eventColor').value    = ev.color || '#6c63ff';
  document.getElementById('eventFeatured').checked = ev.featured || false;

  // Sync color preset selection
  document.querySelectorAll('.color-preset').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.color === ev.color);
  });

  clearFormErrors();
  showModal('modalOverlay');
}

function resetForm() {
  document.getElementById('eventForm').reset();
  document.getElementById('eventId').value = '';
  document.getElementById('eventColor').value = '#6c63ff';
  document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
  clearFormErrors();
}

function clearFormErrors() {
  ['errTitle', 'errDate'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  document.getElementById('eventTitle').classList.remove('is-invalid');
  document.getElementById('eventDate').classList.remove('is-invalid');
}

function showModal(id) {
  const el = document.getElementById(id);
  el.hidden = false;
  // Force layout then enable transition
  requestAnimationFrame(() => el.classList.add('visible'));
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const el = document.getElementById(id);
  el.hidden = true;
  el.classList.remove('visible');
  document.body.style.overflow = '';
}

/* ── Form submit ─────────────────────────────── */
document.getElementById('eventForm').addEventListener('submit', function(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const title    = document.getElementById('eventTitle').value.trim();
  const dateStr  = document.getElementById('eventDate').value;
  const timeStr  = document.getElementById('eventTime').value || '00:00';
  const desc     = document.getElementById('eventDesc').value.trim();
  const color    = document.getElementById('eventColor').value || '#6c63ff';
  const featured = document.getElementById('eventFeatured').checked;
  const targetMs = lagosLocalToUtcMs(dateStr, timeStr);
  const targetISO = `${dateStr}T${timeStr}`;

  if (featured) {
    // un-feature all others
    events.forEach(ev => { ev.featured = false; });
  }

  if (editingId) {
    const idx = events.findIndex(x => x.id === editingId);
    if (idx !== -1) {
      events[idx] = { ...events[idx], title, description: desc, targetMs, targetISO, color, featured };
    }
    showToast('Event updated.', 'success');
  } else {
    if (events.length >= MAX_EVENTS) {
      showToast(`Maximum of ${MAX_EVENTS} events reached.`, 'error');
      return;
    }
    events.push({
      id: genId(),
      title,
      description: desc,
      targetISO,
      targetMs,
      color,
      featured,
      createdAt: Date.now()
    });
    showToast('Event created!', 'success');
  }

  saveEvents();
  renderFeatured();
  renderGrid();
  closeModal('modalOverlay');
});

function validateForm() {
  clearFormErrors();
  let valid = true;

  const title   = document.getElementById('eventTitle').value.trim();
  const dateStr = document.getElementById('eventDate').value;

  if (!title) {
    document.getElementById('errTitle').textContent = 'Title is required.';
    document.getElementById('eventTitle').classList.add('is-invalid');
    valid = false;
  }

  if (!dateStr) {
    document.getElementById('errDate').textContent = 'Date is required.';
    document.getElementById('eventDate').classList.add('is-invalid');
    valid = false;
  }

  return valid;
}

/* ══════════════════════════════════════════════
   MODAL — DELETE
══════════════════════════════════════════════ */

function openDeleteModal(id) {
  const ev = events.find(x => x.id === id);
  if (!ev) return;
  pendingDeleteId = id;
  document.getElementById('deleteBody').textContent = `"${ev.title}" will be permanently deleted.`;
  showModal('deleteOverlay');
}

document.getElementById('btnDeleteConfirm').addEventListener('click', () => {
  if (!pendingDeleteId) return;
  events = events.filter(e => e.id !== pendingDeleteId);
  saveEvents();
  renderFeatured();
  renderGrid();
  closeModal('deleteOverlay');
  showToast('Event deleted.', 'success');
  pendingDeleteId = null;
});

document.getElementById('btnDeleteCancel').addEventListener('click', () => {
  closeModal('deleteOverlay');
  pendingDeleteId = null;
});

/* ══════════════════════════════════════════════
   EXPORT
══════════════════════════════════════════════ */

document.getElementById('btnExport').addEventListener('click', () => {
  if (events.length === 0) {
    showToast('No events to export.', 'error');
    return;
  }
  const json = JSON.stringify(events, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const ts   = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `countdown-hub-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${events.length} event(s).`, 'success');
});

/* ══════════════════════════════════════════════
   IMPORT
══════════════════════════════════════════════ */

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('importJson').value = '';
  document.getElementById('errImport').textContent = '';
  document.getElementById('importMerge').checked = true;
  showModal('importOverlay');
});

document.getElementById('importClose').addEventListener('click', () => closeModal('importOverlay'));
document.getElementById('importCancel').addEventListener('click', () => closeModal('importOverlay'));

document.getElementById('importConfirm').addEventListener('click', () => {
  const raw = document.getElementById('importJson').value.trim();
  const errEl = document.getElementById('errImport');
  errEl.textContent = '';

  if (!raw) {
    errEl.textContent = 'Paste JSON data before importing.';
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    errEl.textContent = 'Invalid JSON — check the format and try again.';
    return;
  }

  let validated;
  try {
    validated = validateImportData(parsed);
  } catch (e) {
    errEl.textContent = e.message;
    return;
  }

  const merge = document.getElementById('importMerge').checked;

  if (merge) {
    // Add events that don't already exist (by id), update those that do
    validated.forEach(incoming => {
      const idx = events.findIndex(e => e.id === incoming.id);
      if (idx !== -1) {
        events[idx] = incoming;
      } else {
        events.push(incoming);
      }
    });
  } else {
    events = validated;
  }

  saveEvents();
  renderFeatured();
  renderGrid();
  closeModal('importOverlay');
  showToast(`Imported ${validated.length} event(s).`, 'success');
});

/* ══════════════════════════════════════════════
   SEARCH & FILTER
══════════════════════════════════════════════ */

document.getElementById('searchInput').addEventListener('input', function() {
  searchTerm = this.value.trim();
  renderGrid();
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    filterMode = this.dataset.filter;
    renderGrid();
  });
});

/* ══════════════════════════════════════════════
   BUTTON WIRING
══════════════════════════════════════════════ */

document.getElementById('btnNew').addEventListener('click', openNewModal);
document.getElementById('btnEmptyNew').addEventListener('click', openNewModal);
document.getElementById('btnCancel').addEventListener('click', () => closeModal('modalOverlay'));
document.getElementById('modalClose').addEventListener('click', () => closeModal('modalOverlay'));

/* Close modals on backdrop click */
['modalOverlay', 'deleteOverlay', 'importOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      closeModal(id);
      pendingDeleteId = null;
    }
  });
});

/* Close on Escape */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ['modalOverlay', 'deleteOverlay', 'importOverlay'].forEach(id => {
      if (!document.getElementById(id).hidden) closeModal(id);
    });
    pendingDeleteId = null;
  }
});

/* ══════════════════════════════════════════════
   COLOR PICKER SYNC
══════════════════════════════════════════════ */

document.getElementById('colorPresets').addEventListener('click', function(e) {
  const btn = e.target.closest('.color-preset');
  if (!btn) return;
  const color = btn.dataset.color;
  document.getElementById('eventColor').value = color;
  document.querySelectorAll('.color-preset').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
});

document.getElementById('eventColor').addEventListener('input', function() {
  document.querySelectorAll('.color-preset').forEach(b => {
    b.classList.toggle('selected', b.dataset.color === this.value);
  });
});

/* ══════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════ */

let toastTimer = null;

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = 'toast show' + (type ? ` toast-${type}` : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ══════════════════════════════════════════════
   TICK LOOP
══════════════════════════════════════════════ */

function tick() {
  renderFeatured();
  tickCards();
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
}

/* ══════════════════════════════════════════════
   ESCAPE HTML
══════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════════
   INIT
══════════════════════════════════════════════ */

function init() {
  loadEvents();
  renderFeatured();
  renderGrid();
  startTick();
}

init();

/* ══════════════════════════════════════════════
   SERVICE WORKER REGISTRATION
   Runs after the page is fully initialised.
   Failures are caught and logged — they never
   affect countdown functionality or localStorage.
══════════════════════════════════════════════ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(reg => {
        console.log('[PCH] Service worker registered. Scope:', reg.scope);
      })
      .catch(err => {
        /* Registration failure (e.g. opening index.html as a local
           file:// URL) is non-fatal. The app works normally without it. */
        console.warn('[PCH] Service worker registration failed:', err);
      });
  });
}
