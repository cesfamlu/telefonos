/* app.js — Orquestador del Directorio Institucional.
   Estado único → render. Los módulos no se conocen entre sí más de lo necesario:
     search.js    modelo + búsqueda difusa       filters.js   filtros, facetas + estado en URL
     renderer.js  marcado de las 3 vistas        favorites.js fijados persistentes
     ui.js        portapapeles, toasts, 3D/filo  cmdk.js      paleta de comandos
     hero3d.js    red nodal del hero             qr.js        código QR en cliente */

import { directoryData } from '../data/directory-data.js?v=20261112-v7';
import { $, $$, debounce, dialable, escapeHtml, plural, prefersReducedMotion } from './modules/utils.js?v=20261112-v7';
import { KEYS, readJSON, writeJSON } from './modules/storage.js?v=20261112-v7';
import { GROUP_LABELS, flattenData, rankContacts } from './modules/search.js?v=20261112-v7';
import { VIEWS, applyCategory, buildUrl, categoryCounts, filterGroup, groupCounts, readUrlState, writeUrlState } from './modules/filters.js?v=20261112-v7';
import { favoriteCount, favoriteIds, isFavorite, onFavoritesChange, toggleFavorite } from './modules/favorites.js?v=20261112-v7';
import { chipsHTML, fichaHTML, quickTileHTML, renderContacts } from './modules/renderer.js?v=20261112-v7';
import { copyText, flashCopied, initEdgeLight, initTilt, toast } from './modules/ui.js?v=20261112-v7';
import { announce, initializeAccessibility, isTypingTarget } from './modules/accessibility.js?v=20261112-v7';
import { createCommandPalette } from './modules/cmdk.js?v=20261112-v7';
import { createHero3D } from './modules/hero3d.js?v=20261112-v7';
import { qrSvg } from './modules/qr.js?v=20261112-v7';

/* ── Datos ───────────────────────────────────────── */
const allContacts = flattenData(directoryData);
const byId = new Map(allContacts.map(contact => [contact.id, contact]));
const categoryOrder = new Map();
allContacts.forEach(c => { if (!categoryOrder.has(c.categoria)) categoryOrder.set(c.categoria, categoryOrder.size); });

/* Sugerencias para estrenar "Acceso rápido": los anexos críticos del CESFAM. */
const SUGGESTED = [
  { label: 'Urgencia · SAR', nombre: 'SAR', categoria: 'Otros Centros' },
  { label: 'SOME', nombre: 'SOME Central/Adm', categoria: 'CESFAM P. Hurtado' },
  { label: 'Farmacia', nombre: 'Farmacia', categoria: 'CESFAM P. Hurtado' },
  { label: 'Informática', nombre: 'Soporte y Comunicaciones', categoria: 'CESFAM P. Hurtado' },
].map(s => ({ ...s, contact: allContacts.find(c => c.nombre === s.nombre && c.categoria === s.categoria) }))
  .filter(s => s.contact);

/* Ejemplos bajo el buscador: enseñan que también se busca por número. */
const EXAMPLES = ['farmacia', 'some', 'dideco', 'informatica', '7135'];

/* ── Estado ──────────────────────────────────────── */
const initial = readUrlState();
const storedView = readJSON(KEYS.view, 'cards');
const state = {
  query: initial.query,
  group: initial.group,
  cat: initial.cat,
  view: initial.view || (VIEWS.includes(storedView) ? storedView : 'cards'),
  ficha: '',
};
const openClusters = new Set();
let lastMatched = allContacts;     // resultados del texto, antes de filtrar por grupo
let lastCounts = groupCounts(allContacts, isFavorite);
let lastResults = allContacts;     // lo que se ve, en orden

/* ── DOM ─────────────────────────────────────────── */
const root          = document.documentElement;
const heroSection   = $('#hero');
const container     = $('#directoryContainer');
const emptyState    = $('#emptyState');
const emptyActions  = $('#emptyActions');
const searchInput   = $('#searchInput');
const clearBtn      = $('#clearSearch');
const searchAssist  = $('#searchAssist');
const dirBar        = $('#dirBar');
const resultsTitle  = $('#resultsTitle');
const resultsMeta   = $('#resultsMeta');
const chipsBar      = $('#catChips');
const quickAccess   = $('#quickAccess');
const quickList     = $('#quickList');
const quickCount    = $('#quickCount');
const fichaDialog   = $('#ficha');

const hero = createHero3D($('[data-hero-canvas]'), allContacts);
const motion = () => (prefersReducedMotion() ? 'auto' : 'smooth');

/* ── Ícono del toggle de tema ────────────────────
   El reloj, el cambio de tema y su persistencia los maneja portal-shell.js.
   Acá solo se refleja el estado en el pulgar del toggle. */
const THEME_ICONS = {
  sun:  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  moon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

function updateThemeIcon() {
  const thumb = $('.portal-theme__thumb');
  if (!thumb) return;
  thumb.innerHTML = root.getAttribute('data-theme') === 'dark' ? THEME_ICONS.moon : THEME_ICONS.sun;
}
updateThemeIcon();
new MutationObserver(updateThemeIcon).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

/* ── Animaciones de apoyo ────────────────────────── */
function replayAnimation(element, className) {
  if (!element || prefersReducedMotion()) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

/* Conteo que viaja desde el valor que se ve al nuevo (no desde cero en cada tecla). */
const counters = new WeakMap();
function animateCount(element, target, format) {
  const previous = counters.get(element);
  if (previous) cancelAnimationFrame(previous.raf);
  const from = previous ? previous.value : 0;
  const tween = { value: from, raf: 0 };
  counters.set(element, tween);
  if (prefersReducedMotion() || document.hidden || from === target) {
    tween.value = target;
    element.textContent = format(target);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 420);
    tween.value = Math.round(from + (target - from) * (1 - (1 - t) ** 3));
    element.textContent = format(tween.value);
    if (t < 1) tween.raf = requestAnimationFrame(step);
  };
  tween.raf = requestAnimationFrame(step);
}

/* ── Render ──────────────────────────────────────── */
const TITLES = { all: 'Todos los contactos', favs: 'Favoritos', ...GROUP_LABELS };
const icon = (name) => `<i class="material-icons-round" aria-hidden="true">${name}</i>`;
let firstPaint = true;

function paintCounts(counts) {
  const searching = Boolean(state.query);
  $$('[data-count]').forEach(node => { node.textContent = counts[node.dataset.count] ?? 0; });
  $$('.seg-btn').forEach(btn => btn.classList.toggle('is-zero', searching && !counts[btn.dataset.group]));
  $$('.hub-key').forEach(key => key.classList.toggle('is-zero', searching && !counts[key.dataset.hubKey]));
}

function paintActive() {
  $$('.seg-btn').forEach(btn => {
    const on = btn.dataset.group === state.group;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  $$('.hub-key').forEach(key => {
    const on = key.dataset.hubKey === state.group;
    key.classList.toggle('is-active', on);
    key.setAttribute('aria-pressed', String(on));
  });
  $$('.view-btn').forEach(btn => {
    const on = btn.dataset.view === state.view;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

/* Línea de ayuda bajo el buscador. */
function renderAssist(results, counts) {
  let html;
  if (!state.query) {
    html = `<span class="assist-label">Prueba:</span>${EXAMPLES.map(example => `
      <button type="button" class="assist-chip${/^\d+$/.test(example) ? ' assist-chip--num' : ''}" data-example="${example}">${example}</button>`).join('')}
      <span class="assist-sep assist-tip" aria-hidden="true"></span>
      <span class="assist-tip"><kbd>/</kbd> abre la paleta</span>`;
  } else if (results.length) {
    const top = results[0];
    html = `<span><kbd>Enter</kbd> copia <strong>${escapeHtml(top.anexo)}</strong> · ${escapeHtml(top.nombre)}</span>
      ${results.length > 1 ? `<span class="assist-sep assist-tip" aria-hidden="true"></span><span class="assist-tip"><kbd>↓</kbd> recorre ${plural(results.length, 'resultado')}</span>` : ''}`;
  } else if (state.group !== 'all' && counts.all) {
    html = `<span>Sin coincidencias en ${escapeHtml(TITLES[state.group])}.</span>
      <button type="button" class="assist-link" data-assist="all-groups">Ver ${plural(counts.all, 'resultado')} en todas</button>`;
  } else {
    html = '<span>Sin coincidencias. Revisa la ortografía o busca por número de anexo.</span>';
  }
  searchAssist.innerHTML = html;
}

function renderEmpty(counts) {
  const noFavs = state.group === 'favs' && !favoriteCount();
  const elsewhere = state.query && state.group !== 'all' && counts.all > 0;
  $('h3', emptyState).textContent = noFavs
    ? 'Aún no tienes anexos fijados'
    : elsewhere ? `Nada en ${TITLES[state.group]}` : 'No se encontraron resultados';
  $('p', emptyState).textContent = noFavs
    ? 'Toca la estrella de cualquier contacto para tenerlo siempre a mano.'
    : elsewhere ? `Hay ${plural(counts.all, 'coincidencia')} para "${state.query}" en otras dependencias.`
      : 'Prueba con otro término, o busca directamente por número de anexo.';
  $('.material-icons-round', emptyState).textContent = noFavs ? 'star_border' : 'search_off';

  const actions = [];
  if (elsewhere) actions.push(['all-groups', 'travel_explore', `Ver en todas (${counts.all})`]);
  if (state.query) actions.push(['clear-query', 'backspace', 'Limpiar búsqueda']);
  if (noFavs && !state.query) actions.push(['all-groups', 'apps', 'Ver todos los contactos']);
  emptyActions.innerHTML = actions.map(([action, iconName, text], index) => `
    <button type="button" class="${index === 0 ? 'btn-primary' : 'btn-ghost'}" data-empty="${action}">
      ${icon(iconName)}<span>${escapeHtml(text)}</span>
    </button>`).join('');
}

function render() {
  // Con búsqueda, todo va por relevancia: el primer resultado es el mejor.
  const matched = state.query ? rankContacts(allContacts, state.query) : allContacts;
  const counts = groupCounts(matched, isFavorite);
  const scoped = filterGroup(matched, state.group, isFavorite);
  const categories = categoryCounts(scoped)
    .sort((a, b) => categoryOrder.get(a.name) - categoryOrder.get(b.name));
  if (state.cat && !categories.some(c => c.name === state.cat)) state.cat = '';
  const results = applyCategory(scoped, state.cat);
  lastMatched = matched;
  lastCounts = counts;
  lastResults = results;

  // Buscando (o viendo Favoritos) el acceso rápido sobra: deja los resultados arriba.
  quickAccess.classList.toggle('hidden', Boolean(state.query) || state.group === 'favs');

  // Chips de subcategoría: aparecen cuando ya se acotó (dependencia, búsqueda o
  // unidad) y hay más de una unidad entre la que elegir. En "Todos" sin búsqueda
  // serían 15 botones que repiten los encabezados de cada grupo.
  const narrowed = state.group !== 'all' || Boolean(state.query) || Boolean(state.cat);
  const showChips = narrowed && categories.length > 1;
  chipsBar.classList.toggle('hidden', !showChips);
  if (showChips) chipsBar.innerHTML = chipsHTML(categories, state.cat, scoped.length);

  renderContacts({
    container,
    contacts: results,
    view: state.view,
    query: state.query,
    reveal: firstPaint,
    openClusters,
    openAll: Boolean(state.query || state.cat) || categories.length <= 2,
    topId: state.query && results.length ? results[0].id : '',
  });

  const empty = results.length === 0;
  container.classList.toggle('hidden', empty);
  emptyState.classList.toggle('hidden', !empty);
  if (empty) renderEmpty(counts);

  paintCounts(counts);
  paintActive();
  renderAssist(results, counts);

  animateCount(resultsMeta, results.length, (n) => (
    state.query ? `${plural(n)} para "${state.query}"` : plural(n)
  ));

  const groupTitle = state.cat || TITLES[state.group] || 'Contactos';
  const title = state.query
    ? (state.group === 'all' && !state.cat ? 'Resultados' : `Resultados · ${groupTitle}`)
    : groupTitle;
  if (resultsTitle.textContent !== title) {
    resultsTitle.textContent = title;
    replayAnimation(resultsTitle, 'is-fresh');
  }

  clearBtn.classList.toggle('hidden', !state.query);

  hero?.setFocus(state.group);
  hero?.setMatches(state.query ? matched.map(c => c.id) : null);

  writeUrlState(state);
  announce(`${plural(results.length)}${state.query ? ` para ${state.query}` : ''}`);

  if (firstPaint) {
    firstPaint = false;
    // Red de seguridad: el directorio no puede quedar invisible si el observador
    // de reveals del shell no llega a dispararse (pestaña en segundo plano).
    window.setTimeout(() => $$('[data-rv]:not(.rv-in)').forEach(el => el.classList.add('rv-in')), 1400);
  }
}

function setState(patch) {
  Object.assign(state, patch);
  render();
}

/* ── Acceso rápido (fijados) ─────────────────────── */
function renderQuick() {
  const pinned = favoriteIds().map(id => byId.get(id)).filter(Boolean);
  quickCount.textContent = pinned.length ? plural(pinned.length, 'fijado') : 'Sin fijados';

  const template = document.createElement('template');
  template.innerHTML = pinned.length
    ? pinned.map(quickTileHTML).join('')
    : `<li class="quick-empty">
         <p>Fija con <i class="material-icons-round" aria-hidden="true">star_border</i> los anexos que más usas y quedarán aquí, en este equipo. Para partir:</p>
         <div class="quick-suggest">
           ${SUGGESTED.map(s => `
             <button type="button" class="chip" data-action="pin" data-pin="${s.contact.id}">
               <i class="material-icons-round" aria-hidden="true">add</i>${escapeHtml(s.label)}
               <span class="cat-chip-count">${escapeHtml(s.contact.anexo)}</span>
             </button>`).join('')}
         </div>
       </li>`;
  quickList.replaceChildren(template.content);
}

/* Sin fijados el panel parte cerrado (una sola línea). Solo se recuerda lo que
   el usuario decide al tocar el encabezado, no los cambios automáticos. */
const storedQuickOpen = readJSON(KEYS.quickOpen, null);
quickAccess.open = storedQuickOpen == null ? favoriteCount() > 0 : storedQuickOpen !== false;
$('summary', quickAccess).addEventListener('click', () => {
  setTimeout(() => writeJSON(KEYS.quickOpen, quickAccess.open), 0);
});

/* ── Favoritos: sincronización en sitio ──────────── */
function syncFavoriteButtons(id) {
  const scope = id ? `[data-id="${CSS.escape(id)}"] .fav-btn` : '.fav-btn';
  $$(scope).forEach(button => {
    const host = button.closest('[data-id]');
    const contact = host && byId.get(host.dataset.id);
    if (!contact) return;
    const pinned = isFavorite(contact.id);
    button.classList.toggle('is-on', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    button.setAttribute('aria-label', `${pinned ? 'Quitar de' : 'Fijar en'} favoritos: ${contact.nombre}`);
    button.title = pinned ? 'Quitar de favoritos' : 'Fijar en favoritos';
    $('.material-icons-round', button).textContent = pinned ? 'star' : 'star_border';
    if (id) replayAnimation(button, 'is-pop');
  });
}

onFavoritesChange((id) => {
  renderQuick();
  if (state.group === 'favs') {
    render(); // la lista filtrada cambia de contenido
  } else {
    lastCounts = { ...lastCounts, favs: lastMatched.filter(c => isFavorite(c.id)).length };
    paintCounts(lastCounts);
  }
  syncFavoriteButtons(id); // el resto se actualiza en sitio, sin re-render
  palette?.refresh();
});

function pin(contact) {
  const pinned = toggleFavorite(contact.id);
  if (pinned && favoriteCount() === 1) quickAccess.open = true; // el primer fijado se muestra
  toast(pinned ? 'Fijado en Acceso rápido' : 'Quitado de favoritos', {
    icon: pinned ? 'star' : 'star_border',
    detail: `${contact.nombre} · ${contact.numberLabel} ${contact.anexo}`,
  });
}

/* ── Copiar ──────────────────────────────────────── */
async function copyValue(value, label, button) {
  const ok = await copyText(value);
  if (ok) flashCopied(button);
  toast(ok ? '¡Copiado!' : 'No se pudo copiar', {
    icon: ok ? 'content_copy' : 'error_outline',
    detail: ok ? label : 'Selecciona el número y usa Ctrl+C.',
  });
  return ok;
}

/* Copia el número principal de un contacto, usando su botón si está en pantalla. */
function copyPrimary(contact) {
  const button = $(`[data-id="${CSS.escape(contact.id)}"] [data-primary]`, container);
  const value = button?.dataset.copy || contact.anexo;
  return copyValue(value, `${contact.numberLabel} ${contact.anexo} · ${contact.nombre}`, button);
}

const shareUrl = () => new URL(buildUrl(state), window.location.origin).href;

/* ── Ficha rápida + QR ───────────────────────────── */
function openFicha(contact, origin = null) {
  const number = dialable(contact.standalone ? contact.anexo : contact.telefono);
  const svg = number ? qrSvg(`tel:${number}`, { label: `Código QR para llamar al ${number}` }) : '';
  fichaDialog.dataset.id = contact.id;
  $('.ficha-panel', fichaDialog).innerHTML = fichaHTML(contact, svg ? { svg, number } : null);
  // El número gigante se ajusta al ancho según cuántos dígitos tenga.
  $('.ficha-giant', fichaDialog)?.style.setProperty('--chars', String(String(contact.anexo).length));
  if (!fichaDialog.open) {
    fichaDialog.showModal();
    // La ficha nace en el control que la abrió.
    if (origin?.isConnected) {
      const from = origin.getBoundingClientRect();
      const box = fichaDialog.getBoundingClientRect();
      fichaDialog.style.setProperty('--ox', `${(from.left + from.width / 2 - box.left).toFixed(0)}px`);
      fichaDialog.style.setProperty('--oy', `${(from.top + from.height / 2 - box.top).toFixed(0)}px`);
    } else {
      fichaDialog.style.removeProperty('--ox');
      fichaDialog.style.removeProperty('--oy');
    }
  }
  state.ficha = contact.id;
  writeUrlState(state);
}

fichaDialog.addEventListener('close', () => {
  state.ficha = '';
  writeUrlState(state);
});
// Clic en el telón (fuera del panel) cierra la ficha.
fichaDialog.addEventListener('click', (event) => {
  if (event.target === fichaDialog) fichaDialog.close();
});

/* ── Acciones: un listener delegado por superficie ── */
function handleAction(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const host = trigger.closest('[data-id]');
  const contact = host ? byId.get(host.dataset.id) : null;

  switch (trigger.dataset.action) {
    case 'copy':
      copyValue(trigger.dataset.copy, trigger.dataset.copyLabel, trigger);
      break;
    case 'fav':
      if (contact) pin(contact);
      break;
    case 'pin': {
      const suggested = byId.get(trigger.dataset.pin);
      if (suggested) pin(suggested);
      break;
    }
    case 'ficha':
      if (contact) openFicha(contact, trigger);
      break;
    case 'close-ficha':
      fichaDialog.close();
      break;
    case 'share':
      copyText(shareUrl()).then(ok => toast(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace', {
        icon: 'link', detail: ok ? 'Compártelo: abre esta misma vista.' : '',
      }));
      break;
  }
}

[container, quickAccess, fichaDialog].forEach(surface => surface.addEventListener('click', handleAction));

// "toggle" no burbujea: se captura para recordar qué unidades abrió el usuario.
container.addEventListener('toggle', (event) => {
  const cluster = event.target.closest?.('.node-cluster');
  if (!cluster) return;
  if (cluster.open) openClusters.add(cluster.dataset.cluster);
  else openClusters.delete(cluster.dataset.cluster);
}, true);

initTilt(container);
initEdgeLight(container);

/* ── Teclado entre resultados ────────────────────────
   ↓ desde el buscador entra al primer resultado; ↑/↓ saltan de resultado en
   resultado (al número principal); ↑ desde el primero vuelve al buscador. */
const resultHosts = () => $$('[data-id]', container).filter(host => host.getClientRects().length);
const focusTarget = (host) => $('[data-primary]', host) || $('button', host);

function focusResult(host) {
  const target = host && focusTarget(host);
  if (!target) return false;
  target.focus(); // scroll-padding-top deja el foco libre de la barra sticky
  return true;
}

container.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const host = event.target.closest('[data-id]');
  if (!host) return;
  event.preventDefault();
  const hosts = resultHosts();
  const next = hosts[hosts.indexOf(host) + (event.key === 'ArrowDown' ? 1 : -1)];
  if (next) focusResult(next);
  else if (event.key === 'ArrowUp') focusSearch();
});

/* ── Buscador ────────────────────────────────────── */
const applyQuery = debounce(() => {
  const query = searchInput.value.trim();
  if (query !== state.query) setState({ query });
}, 160);

searchInput.addEventListener('input', () => {
  hero?.pulse(); // la red responde a cada tecla, sin esperar el debounce
  clearBtn.classList.toggle('hidden', !searchInput.value);
  applyQuery();
});

searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && searchInput.value) {
    event.preventDefault();
    clearSearch();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query !== state.query) setState({ query }); // no esperar al debounce
    const top = state.query && lastResults[0];
    if (!top) return;
    copyPrimary(top);
    // En pantallas táctiles se cierra el teclado para dejar ver el resultado.
    if (window.matchMedia('(hover: none)').matches) searchInput.blur();
    return;
  }
  if (event.key === 'ArrowDown') {
    const query = searchInput.value.trim();
    if (query !== state.query) setState({ query });
    if (focusResult(resultHosts()[0])) event.preventDefault();
  }
});

function clearSearch() {
  searchInput.value = '';
  setState({ query: '' });
}

clearBtn.addEventListener('click', () => {
  clearSearch();
  searchInput.focus();
});

function focusSearch({ select = false } = {}) {
  searchInput.focus({ preventScroll: true });
  searchInput.closest('.hero-search')?.scrollIntoView({ behavior: motion(), block: 'center' });
  if (select) searchInput.select();
}

$('#barSearch')?.addEventListener('click', () => focusSearch({ select: true }));

searchAssist.addEventListener('click', (event) => {
  const example = event.target.closest('[data-example]');
  if (example) {
    searchInput.value = example.dataset.example;
    hero?.pulse();
    setState({ query: searchInput.value });
    searchInput.focus();
    return;
  }
  if (event.target.closest('[data-assist="all-groups"]')) setGroup('all');
});

/* ── Filtros: dependencia, subcategoría, vista ───── */
function setGroup(group) {
  setState({ group, cat: '' });
}

/* Si la barra del directorio quedó bajo el pliegue, se la trae a la vista. */
function revealDirectory() {
  if (dirBar.getBoundingClientRect().top > window.innerHeight * 0.72) {
    dirBar.scrollIntoView({ behavior: motion(), block: 'start' });
  }
}

$('#groupFilter').addEventListener('click', (event) => {
  const button = event.target.closest('.seg-btn');
  if (!button) return;
  setGroup(button.dataset.group);
  button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});

chipsBar.addEventListener('click', (event) => {
  const chip = event.target.closest('[data-cat]');
  if (chip) setState({ cat: chip.dataset.cat });
});

function setView(view) {
  if (!VIEWS.includes(view)) return;
  writeJSON(KEYS.view, view);
  setState({ view });
}

$('.view-switch').addEventListener('click', (event) => {
  const button = event.target.closest('.view-btn');
  if (button) setView(button.dataset.view);
});

emptyState.addEventListener('click', (event) => {
  const action = event.target.closest('[data-empty]')?.dataset.empty;
  if (action === 'all-groups') setGroup('all');
  if (action === 'clear-query') { clearSearch(); focusSearch(); }
});

/* ── Red 3D: la leyenda y los núcleos son filtros ──
   Apuntar adelanta el enfoque de la cámara; hacer clic filtra. */
const hubKeys = $('.hub-keys');
const toggleHub = (group) => {
  setGroup(state.group === group ? 'all' : group);
  revealDirectory();
};

hubKeys.addEventListener('click', (event) => {
  const key = event.target.closest('[data-hub-key]');
  if (key) toggleHub(key.dataset.hubKey);
});
hubKeys.addEventListener('pointerover', (event) => {
  const key = event.target.closest('[data-hub-key]');
  if (key) hero?.preview(key.dataset.hubKey);
});
hubKeys.addEventListener('pointerleave', () => hero?.preview(null));
hubKeys.addEventListener('focusin', (event) => hero?.preview(event.target.closest('[data-hub-key]')?.dataset.hubKey));
hubKeys.addEventListener('focusout', () => hero?.preview(null));

let hoveredHub = null;
function setHoveredHub(group) {
  if (group === hoveredHub) return;
  hoveredHub = group;
  hero?.preview(group);
  heroSection.classList.toggle('is-hub-hover', Boolean(group));
}

heroSection.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || !hero) return;
  setHoveredHub(event.target.closest('.hero-search') ? null : hero.hitTest(event.clientX, event.clientY));
}, { passive: true });
heroSection.addEventListener('pointerleave', () => setHoveredHub(null));
heroSection.addEventListener('click', (event) => {
  if (!hero || event.target.closest('.hero-search')) return;
  const group = hero.hitTest(event.clientX, event.clientY);
  if (group) toggleHub(group);
});

/* Conteos fijos de la leyenda: unidades por dependencia. */
$$('[data-units]').forEach(node => {
  const units = new Set(allContacts.filter(c => c.dependencia === node.dataset.units).map(c => c.categoria));
  node.textContent = plural(units.size, 'unidad', 'unidades');
});
$('#heroTotal').textContent = allContacts.length;

/* ── Barra sticky: sombra al quedar fija y su alto para lo que va debajo ── */
const sentinel = document.createElement('div');
sentinel.setAttribute('aria-hidden', 'true');
sentinel.style.cssText = 'height:1px;margin-bottom:-1px';
dirBar.before(sentinel);
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    dirBar.classList.toggle('is-stuck', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }).observe(sentinel);
}
const syncBarHeight = () => root.style.setProperty('--bar-h', `${dirBar.offsetHeight}px`);
if ('ResizeObserver' in window) new ResizeObserver(syncBarHeight).observe(dirBar);
syncBarHeight();

/* ── Paleta de comandos ──────────────────────────── */
function reveal(contact) {
  searchInput.value = contact.nombre;
  setState({ query: contact.nombre, group: 'all', cat: contact.categoria });
  requestAnimationFrame(() => {
    const node = $(`[data-id="${CSS.escape(contact.id)}"]`, container);
    if (!node) return;
    node.scrollIntoView({ behavior: motion(), block: 'center' });
    node.classList.add('search-highlight');
    setTimeout(() => node.classList.remove('search-highlight'), 2200);
  });
}

const openExternal = (url) => window.open(url, '_blank', 'noopener');

const COMMANDS = [
  { id: 'tema', title: 'Cambiar tema claro / oscuro', icon: 'contrast', keywords: 'dark light modo', run: () => $('[data-portal-theme]')?.click() },
  { id: 'favoritos', title: 'Ver favoritos', icon: 'star', keywords: 'fijados acceso rapido', run: () => setGroup('favs') },
  { id: 'todos', title: 'Ver todos los contactos', icon: 'apps', run: () => setGroup('all') },
  { id: 'salud', title: 'Filtrar: Salud', icon: 'local_hospital', keywords: 'cesfam', run: () => setGroup('salud') },
  { id: 'muni', title: 'Filtrar: Municipalidad', icon: 'account_balance', run: () => setGroup('muni') },
  { id: 'daem', title: 'Filtrar: DAEM', icon: 'school', keywords: 'educacion', run: () => setGroup('daem') },
  { id: 'tarjetas', title: 'Vista: tarjetas 3D', icon: 'view_module', keywords: 'grid', run: () => setView('cards') },
  { id: 'lista', title: 'Vista: lista compacta', icon: 'view_list', keywords: 'tabla densa', run: () => setView('list') },
  { id: 'nodos', title: 'Vista: nodos por unidad', icon: 'hub', keywords: 'mapa agrupada', run: () => setView('nodes') },
  { id: 'enlace', title: 'Copiar enlace de esta vista', icon: 'link', keywords: 'compartir url', run: () => copyText(shareUrl()).then(ok => toast(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace', { icon: 'link' })) },
  { id: 'limpiar', title: 'Limpiar búsqueda y filtros', icon: 'filter_alt_off', keywords: 'reset', run: () => { searchInput.value = ''; setState({ query: '', group: 'all', cat: '' }); } },
  { id: 'soporte', title: 'Abrir Mesa de Ayuda TI', icon: 'support_agent', hint: 'soporte.cesfamtic.com', keywords: 'ticket informatica', run: () => openExternal('https://soporte.cesfamtic.com/') },
];

const palette = createCommandPalette({
  contacts: allContacts,
  commands: COMMANDS,
  onCopy: (contact) => copyValue(contact.anexo, `${contact.numberLabel} ${contact.anexo} · ${contact.nombre}`),
  onToggleFavorite: pin,
  onReveal: reveal,
});

// El pie "Ctrl K" del buscador también abre la paleta.
$('.search-kbd-hint')?.addEventListener('click', () => palette?.open());

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (fichaDialog.open) fichaDialog.close();
    palette?.toggle();
    return;
  }
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey
      && !isTypingTarget(event.target) && !fichaDialog.open) {
    event.preventDefault();
    palette?.open();
  }
});

/* ── Primera visita: pulso de atención en el buscador ── */
const searchContainer = searchInput.closest('.hero-search');
if (searchContainer && !readJSON(KEYS.searchSeen, null)) {
  searchContainer.classList.add('attract');
  setTimeout(() => searchContainer.classList.remove('attract'), 3400);
  writeJSON(KEYS.searchSeen, 1);
}

/* ── Init ────────────────────────────────────────── */
initializeAccessibility();
searchInput.value = state.query;
renderQuick();
render();

if (initial.ficha && byId.has(initial.ficha)) openFicha(byId.get(initial.ficha));
