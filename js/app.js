import { directoryData } from '../data/directory-data.js';
import { renderContacts }  from './modules/renderer.js';
import { debounce }        from './modules/utils.js';
import { initializeAccessibility } from './modules/accessibility.js';

/* ── Flatten grouped data ─────────────────────────── */
function flattenData(grouped) {
  const flat = [];
  grouped.forEach(section => {
    section.contacts.forEach(c => {
      flat.push({
        nombre: c.name,
        anexo: c.ext,
        telefono: c.detail,
        categoria: section.category,
        dependencia: section.group
      });
    });
  });
  return flat;
}

const allContacts = flattenData(directoryData);

const state = {
  query: '',
  group: 'all'
};

/* ── DOM refs ─────────────────────────────────────── */
const container    = document.getElementById('directoryContainer');
const emptyState   = document.getElementById('emptyState');
const searchInput  = document.getElementById('searchInput');
const clearBtn     = document.getElementById('clearSearch');
const themeBtn     = document.getElementById('themeToggle');
const totalCount   = document.getElementById('totalCount');
const sidebar      = document.getElementById('sidebar');
const menuBtn      = document.getElementById('mobileMenuBtn');
const overlay      = document.getElementById('sidebarOverlay');
const dateTimeEl   = document.getElementById('currentDateTime');

/* ── Date / Time display ──────────────────────────── */
function updateDateTime() {
  const now = new Date();
  const opts = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  dateTimeEl.textContent = now.toLocaleDateString('es-CL', opts);
}
updateDateTime();
setInterval(updateDateTime, 30000);

/* ── Filtering ────────────────────────────────────── */
function filterContacts() {
  let results = allContacts;

  if (state.group !== 'all') {
    results = results.filter(c => c.dependencia === state.group);
  }

  if (state.query) {
    const q = state.query.toLowerCase();
    results = results.filter(c =>
      c.nombre.toLowerCase().includes(q) ||
      c.anexo.toLowerCase().includes(q) ||
      c.telefono.toLowerCase().includes(q) ||
      c.categoria.toLowerCase().includes(q)
    );
  }

  return results;
}

/* ── Render ────────────────────────────────────────── */
const render = () => {
  const results = filterContacts();

  renderContacts({ container, contacts: results });

  const empty = results.length === 0;
  emptyState.classList.toggle('hidden', !empty);
  container.classList.toggle('hidden', empty);

  totalCount.textContent = `${results.length} contacto${results.length !== 1 ? 's' : ''}`;
};

/* ── Search ────────────────────────────────────────── */
searchInput.addEventListener('input', debounce(e => {
  state.query = e.target.value.trim();
  clearBtn.classList.toggle('hidden', !state.query);
  render();
}, 180));

/* ── Clear search ──────────────────────────────────── */
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.query = '';
  clearBtn.classList.add('hidden');
  searchInput.focus();
  render();
});

/* ── Nav filter buttons ────────────────────────────── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.group = btn.dataset.group;
    render();
    closeMobile();
  });
});

/* ── Dark mode toggle ──────────────────────────────── */
const root = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'light';
root.setAttribute('data-theme', savedTheme);

themeBtn.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});

/* ── Mobile sidebar ────────────────────────────────── */
function closeMobile() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
});

overlay.addEventListener('click', closeMobile);

/* ── Sync header height to CSS var (sticky sidebar offset) ── */
const headerEl = document.querySelector('.main-header');
function syncHeaderHeight() {
  if (!headerEl) return;
  document.documentElement.style.setProperty('--header-h', `${headerEl.offsetHeight}px`);
}
syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
if (window.ResizeObserver && headerEl) {
  new ResizeObserver(syncHeaderHeight).observe(headerEl);
}

/* ── Init ──────────────────────────────────────────── */
initializeAccessibility();
render();
