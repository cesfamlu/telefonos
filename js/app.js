import { directoryData } from '../data/directory-data.js';
import { renderContacts }  from './modules/renderer.js';
import { debounce }        from './modules/utils.js';
import { initializeAccessibility } from './modules/accessibility.js';

/* ── Utilities ───────────────────────────────────── */
const $  = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalize(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function matchesQuery(haystack, query) {
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  return tokens.every(t => haystack.includes(t));
}

function highlightMatch(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const token = query.split(/\s+/).filter(Boolean)[0];
  if (!token) return safe;
  const idx = normalize(text).indexOf(token);
  if (idx < 0) return safe;
  return `${escapeHtml(text.slice(0, idx))}<mark>${escapeHtml(text.slice(idx, idx + token.length))}</mark>${escapeHtml(text.slice(idx + token.length))}`;
}

/* ── Inline SVG icons (Lucide-style) ─────────────── */
const ICONS = {
  sun:  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  moon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

/* ── Flatten grouped data ────────────────────────── */
function flattenData(grouped) {
  const flat = [];
  grouped.forEach(section => {
    section.contacts.forEach(c => {
      flat.push({
        nombre: c.name,
        anexo: c.ext,
        telefono: c.detail,
        categoria: section.category,
        dependencia: section.group,
        _search: normalize([c.name, c.ext, c.detail, section.category, section.group].join(' ')),
      });
    });
  });
  return flat;
}

const allContacts = flattenData(directoryData);

const state = { query: '', group: 'all' };

/* ── DOM refs ────────────────────────────────────── */
const container    = $('#directoryContainer');
const emptyState   = $('#emptyState');
const searchInput  = $('#searchInput');
const clearBtn     = $('#clearSearch');
const themeBtn     = $('#themeToggle');
const totalCount   = $('#totalCount');
const sidebar      = $('#sidebar');
const menuBtn      = $('#mobileMenuBtn');
const overlay      = $('#sidebarOverlay');
const clockDate    = $('#clock-date');
const clockTime    = $('#clock-time');

/* ── Clock (pauses when tab is hidden) ───────────── */
function updateClock() {
  if (!clockDate || !clockTime) return;
  const now = new Date();
  const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  clockDate.textContent = `${days[now.getDay()]} ${now.getDate()} de ${months[now.getMonth()]} ${now.getFullYear()}`;
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  clockTime.textContent = `${h}:${m}:${s}`;
}
let clockTimer = null;
function startClock() {
  updateClock();
  clockTimer = setInterval(updateClock, 1000);
}
startClock();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearInterval(clockTimer); clockTimer = null; }
  else if (!clockTimer) { startClock(); }
});

/* ── Theme toggle (icon injected into .toggle-thumb) ── */
function updateThemeIcon() {
  const thumb = $('.toggle-thumb');
  if (!thumb) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  thumb.innerHTML = isDark ? ICONS.moon : ICONS.sun;
}

(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  updateThemeIcon();
})();

themeBtn?.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon();
});

/* ── Filtering ───────────────────────────────────── */
function filterContacts() {
  let results = allContacts;
  if (state.group !== 'all') {
    results = results.filter(c => c.dependencia === state.group);
  }
  if (state.query) {
    const q = normalize(state.query);
    results = results.filter(c => matchesQuery(c._search, q));
  }
  return results;
}

const render = () => {
  const results = filterContacts();
  renderContacts({ container, contacts: results });

  const empty = results.length === 0;
  emptyState.classList.toggle('hidden', !empty);
  container.classList.toggle('hidden', empty);
  totalCount.textContent = `${results.length} contacto${results.length !== 1 ? 's' : ''}`;
};

/* ── Search input ────────────────────────────────── */
searchInput.addEventListener('input', debounce(e => {
  state.query = e.target.value.trim();
  clearBtn.classList.toggle('hidden', !state.query);
  render();
}, 180));

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  state.query = '';
  clearBtn.classList.add('hidden');
  searchInput.focus();
  render();
});

/* ── Sidebar nav filter buttons ──────────────────── */
$$('.side-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.side-nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.group = btn.dataset.group;
    render();
    closeMobile();
  });
});

/* ── Mobile sidebar ──────────────────────────────── */
function closeMobile() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}
menuBtn?.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
});
overlay?.addEventListener('click', closeMobile);

/* ── Sync header height to CSS var ───────────────── */
const headerEl = $('.main-header') || $('.header');
function syncHeaderHeight() {
  if (!headerEl) return;
  document.documentElement.style.setProperty('--header-h', `${headerEl.offsetHeight}px`);
}
syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
if (window.ResizeObserver && headerEl) {
  new ResizeObserver(syncHeaderHeight).observe(headerEl);
}

/* ── First-load attract pulse on the search input ── */
const searchContainer = searchInput.closest('.header-search-container');
if (searchContainer && !localStorage.getItem('directorio-search-seen')) {
  searchContainer.classList.add('attract');
  setTimeout(() => searchContainer.classList.remove('attract'), 1800);
  localStorage.setItem('directorio-search-seen', '1');
}

/* ── Global "/" shortcut → focus the header search ─ */
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
  e.preventDefault();
  searchInput.focus();
  searchInput.select();
});

/* ══════════════════════════════════════════════════
   COMMAND PALETTE (Ctrl+K)
   ══════════════════════════════════════════════════ */
const cmdk = {
  el: $('#cmdk'),
  input: $('#cmdk-input'),
  list: $('#cmdk-list'),
  items: [],
  selected: 0,

  open() {
    if (!this.el) return;
    this.el.hidden = false;
    this.input.value = '';
    this.render('');
    setTimeout(() => this.input.focus(), 0);
    document.body.style.overflow = 'hidden';
  },

  close() {
    if (!this.el) return;
    this.el.hidden = true;
    document.body.style.overflow = '';
  },

  toggle() { this.el?.hidden ? this.open() : this.close(); },

  render(query) {
    const q = normalize(query);
    const matched = q
      ? allContacts.filter(c => matchesQuery(c._search, q))
      : allContacts.slice(0, 80); // limit when empty

    this.items = matched;
    this.selected = 0;

    if (!matched.length) {
      this.list.innerHTML = `<div class="cmdk-empty">Sin resultados para "${escapeHtml(query)}"</div>`;
      return;
    }

    // Group by dependencia when no query, flat list when filtering
    let html = '';
    if (!q) {
      const groups = {};
      matched.forEach((c, i) => {
        const key = c.dependencia || 'otros';
        (groups[key] = groups[key] || []).push({ c, i });
      });
      const labels = { muni: 'Municipalidad', salud: 'Salud', daem: 'DAEM', otros: 'Otros' };
      Object.entries(groups).forEach(([k, list]) => {
        html += `<div class="cmdk-group-label">${escapeHtml(labels[k] || k)}</div>`;
        list.forEach(({ c, i }) => { html += this.itemHTML(c, i, ''); });
      });
    } else {
      matched.forEach((c, i) => { html += this.itemHTML(c, i, q); });
    }

    this.list.innerHTML = html;
    this.highlight();

    $$('.cmdk-item', this.list).forEach(el => {
      el.addEventListener('mouseenter', () => {
        this.selected = Number(el.dataset.idx);
        this.highlight();
      });
      el.addEventListener('click', () => this.pickSelected());
    });
  },

  itemHTML(c, idx, q) {
    const title = q ? highlightMatch(c.nombre, q) : escapeHtml(c.nombre);
    const desc  = `Anexo ${escapeHtml(c.anexo || '—')} · ${escapeHtml(c.categoria || '')}`;
    return `
      <div class="cmdk-item" role="option" data-idx="${idx}" id="cmdk-item-${idx}">
        <div class="cmdk-item-icon"><i class="material-icons-round">person</i></div>
        <div class="cmdk-item-body">
          <div class="cmdk-item-title">${title}</div>
          <div class="cmdk-item-desc">${desc}</div>
        </div>
        <span class="cmdk-item-tag">${escapeHtml(c.dependencia || '')}</span>
      </div>`;
  },

  highlight() {
    const els = $$('.cmdk-item', this.list);
    els.forEach((el, i) => el.setAttribute('aria-selected', i === this.selected ? 'true' : 'false'));
    const active = els[this.selected];
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
      this.input.setAttribute('aria-activedescendant', active.id);
    }
  },

  move(delta) {
    if (!this.items.length) return;
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.highlight();
  },

  pickSelected() {
    const c = this.items[this.selected];
    if (!c) return;
    // Filter the directory to that contact and highlight the card briefly.
    searchInput.value = c.nombre;
    state.query = c.nombre;
    clearBtn.classList.remove('hidden');
    render();
    this.close();

    setTimeout(() => {
      const card = $$('#directoryContainer .contact-card').find(el =>
        el.textContent.includes(c.nombre)
      );
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('search-highlight');
        setTimeout(() => card.classList.remove('search-highlight'), 2000);
      }
    }, 50);
  },
};

function initCmdK() {
  if (!cmdk.el) return;

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      cmdk.toggle();
    }
  });

  cmdk.el.querySelectorAll('[data-cmdk-close]').forEach(el => {
    el.addEventListener('click', () => cmdk.close());
  });

  cmdk.input.addEventListener('input', () => cmdk.render(cmdk.input.value));
  cmdk.input.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Escape':    e.preventDefault(); cmdk.close(); break;
      case 'ArrowDown': e.preventDefault(); cmdk.move(1); break;
      case 'ArrowUp':   e.preventDefault(); cmdk.move(-1); break;
      case 'Enter':     e.preventDefault(); cmdk.pickSelected(); break;
      case 'Home':      e.preventDefault(); cmdk.selected = 0; cmdk.highlight(); break;
      case 'End':       e.preventDefault(); cmdk.selected = cmdk.items.length - 1; cmdk.highlight(); break;
    }
  });
}
initCmdK();

/* ── Init ────────────────────────────────────────── */
initializeAccessibility();
render();
