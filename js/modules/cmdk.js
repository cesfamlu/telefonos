/* cmdk.js — Paleta de comandos (Ctrl+K y "/").
   · Búsqueda difusa con resaltado <mark>
   · Enter copia el anexo · Shift+Enter fija · Ctrl+Enter muestra en el directorio
   · ">" abre los comandos del sistema (>tema, >favoritos, >soporte…)
   · Recuerda las últimas búsquedas */

import { $, escapeHtml, normalize } from './utils.js?v=20261112-v7';
import { GROUP_ICONS, GROUP_LABELS, highlight, rankContacts } from './search.js?v=20261112-v7';
import { favoriteIds, isFavorite } from './favorites.js?v=20261112-v7';
import { KEYS, readJSON, writeJSON } from './storage.js?v=20261112-v7';

const MAX_RESULTS = 40;
const MAX_RECENT = 6;

export function createCommandPalette({ contacts, commands, onCopy, onToggleFavorite, onReveal }) {
  const el = $('#cmdk');
  const input = $('#cmdk-input');
  const list = $('#cmdk-list');
  if (!el || !input || !list) return null;

  const byId = new Map(contacts.map(c => [c.id, c]));
  let items = [];
  let selected = 0;
  let returnFocus = null;

  const recent = () => {
    const stored = readJSON(KEYS.recent, []);
    return Array.isArray(stored) ? stored.filter(q => typeof q === 'string').slice(0, MAX_RECENT) : [];
  };

  const remember = (query) => {
    const clean = query.trim();
    if (!clean || clean.startsWith('>')) return;
    const next = [clean, ...recent().filter(q => normalize(q) !== normalize(clean))].slice(0, MAX_RECENT);
    writeJSON(KEYS.recent, next);
  };

  const matchCommands = (text) => {
    const q = normalize(text);
    if (!q) return commands;
    return commands.filter(cmd => normalize(`${cmd.id} ${cmd.title} ${cmd.keywords || ''}`).includes(q));
  };

  /* Arma la lista plana de ítems seleccionables, con rótulos de grupo. */
  function build(raw) {
    const query = raw.trim();
    const sections = [];

    if (query.startsWith('>')) {
      sections.push({ label: 'Comandos', items: matchCommands(query.slice(1)).map(cmd => ({ type: 'command', cmd })) });
    } else if (!query) {
      sections.push({ label: 'Búsquedas recientes', items: recent().map(q => ({ type: 'recent', query: q })) });
      sections.push({
        label: 'Fijados',
        items: favoriteIds().map(id => byId.get(id)).filter(Boolean).map(contact => ({ type: 'contact', contact })),
      });
      sections.push({ label: 'Comandos · escribe >', items: commands.map(cmd => ({ type: 'command', cmd })) });
    } else {
      sections.push({
        label: 'Contactos',
        items: rankContacts(contacts, query).slice(0, MAX_RESULTS).map(contact => ({ type: 'contact', contact })),
      });
      sections.push({ label: 'Comandos', items: matchCommands(query).map(cmd => ({ type: 'command', cmd })) });
    }
    return sections.filter(section => section.items.length);
  }

  function itemHTML(item, index, query) {
    let iconName, title, desc, tag = '';
    if (item.type === 'contact') {
      const c = item.contact;
      iconName = GROUP_ICONS[c.dependencia] || 'person';
      title = highlight(c.nombre, query);
      desc = `${highlight(c.categoria, query)} · ${escapeHtml(GROUP_LABELS[c.dependencia] || '')}`;
      tag = `${isFavorite(c.id) ? '<i class="material-icons-round cmdk-item-star" aria-label="Fijado">star</i>' : ''}
             <span class="cmdk-item-num">${highlight(c.anexo, query)}</span>`;
    } else if (item.type === 'command') {
      iconName = item.cmd.icon;
      title = highlight(item.cmd.title, query.replace(/^>/, ''));
      desc = escapeHtml(item.cmd.hint || '');
      tag = `<span class="cmdk-item-tag">&gt;${escapeHtml(item.cmd.id)}</span>`;
    } else {
      iconName = 'history';
      title = escapeHtml(item.query);
      desc = 'Repetir búsqueda';
    }
    return `
      <div class="cmdk-item" role="option" id="cmdk-item-${index}" data-idx="${index}" aria-selected="false">
        <div class="cmdk-item-icon"><i class="material-icons-round" aria-hidden="true">${iconName}</i></div>
        <div class="cmdk-item-body">
          <div class="cmdk-item-title">${title}</div>
          <div class="cmdk-item-desc">${desc}</div>
        </div>
        ${tag}
      </div>`;
  }

  function render({ keepSelection = false } = {}) {
    const raw = input.value;
    const sections = build(raw);
    items = sections.flatMap(section => section.items);
    selected = keepSelection ? Math.min(selected, Math.max(0, items.length - 1)) : 0;

    if (!items.length) {
      const message = raw.trim()
        ? `Sin resultados para "${escapeHtml(raw.trim())}"`
        : `Escribe para buscar entre ${contacts.length} contactos, o &gt; para ver comandos`;
      list.innerHTML = `<div class="cmdk-empty">${message}</div>`;
      input.removeAttribute('aria-activedescendant');
      return;
    }

    let index = 0;
    list.innerHTML = sections.map(section => `
      <div class="cmdk-group-label">${escapeHtml(section.label)}</div>
      ${section.items.map(item => itemHTML(item, index++, raw.trim())).join('')}`).join('');
    mark(false);
  }

  function mark(scroll = true) {
    list.querySelectorAll('.cmdk-item').forEach((node, i) => {
      const on = i === selected;
      node.setAttribute('aria-selected', String(on));
      if (!on) return;
      input.setAttribute('aria-activedescendant', node.id);
      if (scroll) node.scrollIntoView({ block: 'nearest' });
    });
  }

  function move(delta) {
    if (!items.length) return;
    selected = (selected + delta + items.length) % items.length;
    mark();
  }

  function open(prefill = '') {
    if (!el.hidden) { input.focus(); return; }
    returnFocus = document.activeElement;
    el.hidden = false;
    input.value = prefill;
    input.setAttribute('aria-expanded', 'true');
    render();
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => input.focus());
  }

  function close({ restoreFocus = true } = {}) {
    if (el.hidden) return;
    el.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
    if (restoreFocus && returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  /* mode: 'primary' (Enter) · 'pin' (Shift+Enter) · 'reveal' (Ctrl+Enter) */
  function run(mode = 'primary') {
    const item = items[selected];
    if (!item) return;

    if (item.type === 'recent') {
      input.value = item.query;
      render();
      return;
    }
    if (item.type === 'command') {
      close({ restoreFocus: !item.cmd.movesFocus });
      item.cmd.run();
      return;
    }

    const contact = item.contact;
    if (mode === 'pin') {
      onToggleFavorite(contact);
      render({ keepSelection: true });
      mark();
      return;
    }
    remember(input.value);
    close({ restoreFocus: mode !== 'reveal' });
    if (mode === 'reveal') onReveal(contact);
    else onCopy(contact);
  }

  // ── Eventos (delegados: un listener por tipo) ──
  input.addEventListener('input', () => render());

  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(1); break;
      case 'ArrowUp':   event.preventDefault(); move(-1); break;
      case 'Home':      if (items.length) { event.preventDefault(); selected = 0; mark(); } break;
      case 'End':       if (items.length) { event.preventDefault(); selected = items.length - 1; mark(); } break;
      case 'Tab':       event.preventDefault(); break; // el foco no sale de la paleta
      case 'Enter':
        event.preventDefault();
        run(event.shiftKey ? 'pin' : (event.ctrlKey || event.metaKey) ? 'reveal' : 'primary');
        break;
      case 'Escape':
        event.preventDefault();
        if (input.value) { input.value = ''; render(); } else close();
        break;
    }
  });

  list.addEventListener('click', (event) => {
    const node = event.target.closest('.cmdk-item');
    if (!node) return;
    selected = Number(node.dataset.idx);
    run(event.shiftKey ? 'pin' : (event.ctrlKey || event.metaKey) ? 'reveal' : 'primary');
  });

  list.addEventListener('mousemove', (event) => {
    const node = event.target.closest('.cmdk-item');
    if (!node) return;
    const index = Number(node.dataset.idx);
    if (index === selected) return;
    selected = index;
    mark(false);
  });

  el.addEventListener('click', (event) => {
    if (event.target.closest('[data-cmdk-close]')) close();
  });

  return {
    open,
    close,
    toggle: () => (el.hidden ? open() : close()),
    isOpen: () => !el.hidden,
    refresh: () => { if (!el.hidden) render({ keepSelection: true }); },
  };
}
