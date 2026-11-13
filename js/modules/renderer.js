/* renderer.js — Las tres vistas del directorio (tarjetas 3D, lista densa, nodos).
   Solo genera marcado: todas las acciones viajan como data-action y las
   resuelve UN listener delegado en app.js (cero listeners por tarjeta). */

import { escapeHtml, phoneDigits, plural } from './utils.js?v=20261112-v7';
import { GROUP_ICONS, GROUP_LABELS, highlight } from './search.js?v=20261112-v7';
import { isFavorite } from './favorites.js?v=20261112-v7';

const icon = (name) => `<i class="material-icons-round" aria-hidden="true">${name}</i>`;

/* Número que se marca con tel: — el teléfono, o el anexo si es directo/móvil. */
export const callNumber = (contact) =>
  phoneDigits(contact.standalone ? contact.anexo : contact.telefono);

/* Número que se copia al portapapeles: el anexo tal cual, el teléfono sin espacios. */
const copyValue = (value, isPhone) => (isPhone ? phoneDigits(value) || String(value) : String(value));

/* primary: el número principal del resultado. Lo usan Enter (copiar el primero)
   y las flechas (saltar de resultado en resultado). */
const copyButton = (value, { label, isPhone = false, className = '', primary = false }) => `
  <button type="button" class="copy-btn ${className}" data-action="copy"${primary ? ' data-primary' : ''}
    data-copy="${escapeHtml(copyValue(value, isPhone))}" data-copy-label="${escapeHtml(label)} ${escapeHtml(value)}"
    aria-label="Copiar ${escapeHtml(label.toLowerCase())} ${escapeHtml(value)}" title="Copiar">
    <span class="copy-btn__text">${escapeHtml(value)}</span>
    <span class="copy-btn__icon" aria-hidden="true">${icon('content_copy')}${icon('check')}</span>
  </button>`;

export const favButton = (contact) => {
  const pinned = isFavorite(contact.id);
  return `
  <button type="button" class="fav-btn${pinned ? ' is-on' : ''}" data-action="fav" aria-pressed="${pinned}"
    aria-label="${pinned ? 'Quitar de' : 'Fijar en'} favoritos: ${escapeHtml(contact.nombre)}" title="${pinned ? 'Quitar de favoritos' : 'Fijar en favoritos'}">
    ${icon(pinned ? 'star' : 'star_border')}
  </button>`;
};

const callLink = (contact, className, text = '') => {
  const digits = callNumber(contact);
  if (!digits) return '';
  return `<a class="${className}" href="tel:${digits}" aria-label="Llamar a ${escapeHtml(contact.nombre)}" title="Llamar">${icon('call')}${text}</a>`;
};

const fichaButton = (contact, className, text = '') => `
  <button type="button" class="${className}" data-action="ficha" aria-label="Abrir ficha y código QR de ${escapeHtml(contact.nombre)}" title="Ficha y código QR">${icon('qr_code_2')}${text}</button>`;

const phoneData = (label, inner) => `
  <div class="phone-data">
    <span class="phone-data-label">${escapeHtml(label)}</span>
    ${inner}
  </div>`;

const numbersHTML = (contact) => {
  if (contact.standalone) {
    return phoneData(contact.numberLabel, copyButton(contact.anexo, { label: contact.numberLabel, isPhone: true, className: 'phone-data-value', primary: true }));
  }
  return phoneData('Anexo', copyButton(contact.anexo, { label: 'Anexo', className: 'phone-data-value', primary: true }))
    + phoneData('Teléfono', copyButton(contact.telefono, { label: 'Teléfono', isPhone: true, className: 'phone-data-value' }));
};

const dot = '<span class="dep-dot" aria-hidden="true"></span>';

const groupByCategory = (contacts) => {
  const groups = new Map();
  contacts.forEach(contact => {
    if (!groups.has(contact.categoria)) groups.set(contact.categoria, []);
    groups.get(contact.categoria).push(contact);
  });
  return groups;
};

/* ── Vista 1 · Tarjetas 3D ───────────────────────── */

const topClass = (contact, topId) => (contact.id === topId ? ' is-top' : '');

const cardHTML = (contact, index, query, topId) => `
  <article class="contact-card${topClass(contact, topId)}" data-id="${contact.id}" data-dep="${contact.dependencia}" style="--card-index:${index}" aria-label="${escapeHtml(contact.nombre)}">
    <span class="card-surface" aria-hidden="true"></span>
    <div class="card-header">
      <div class="card-avatar" aria-hidden="true">${icon(GROUP_ICONS[contact.dependencia] || 'person')}</div>
      <div class="card-identity">
        <div class="card-title">${highlight(contact.nombre, query)}</div>
        <div class="card-subtitle">${dot}<span>${highlight(contact.categoria, query)}</span></div>
      </div>
      ${favButton(contact)}
    </div>
    <div class="card-body">
      <div class="card-contact${contact.standalone ? ' card-contact--single' : ''}">
        ${numbersHTML(contact)}
      </div>
      <div class="card-actions">
        ${callLink(contact, 'card-action', '<span>Llamar</span>')}
        ${fichaButton(contact, 'card-action', '<span>Ficha · QR</span>')}
      </div>
    </div>
  </article>`;

const cardsHTML = (contacts, { query, reveal, topId }) => {
  // Con búsqueda: una sola grilla en orden de relevancia (la unidad va en cada tarjeta).
  if (query) {
    return `
      <section class="directory-group directory-group--flat">
        <h3 class="sr-only">Resultados por relevancia</h3>
        <div class="directory-group-list">
          ${contacts.map((contact, index) => cardHTML(contact, index, query, topId)).join('')}
        </div>
      </section>`;
  }
  let html = '';
  groupByCategory(contacts).forEach((items, category) => {
    html += `
      <section class="directory-group" data-dep="${items[0].dependencia}"${reveal ? ' data-rv' : ''}>
        <div class="directory-group-head">
          <h3 class="directory-group-title">${dot}${escapeHtml(category)}</h3>
          <span class="directory-group-meta">${plural(items.length)}</span>
        </div>
        <div class="directory-group-list">
          ${items.map((contact, index) => cardHTML(contact, index, query, topId)).join('')}
        </div>
      </section>`;
  });
  return html;
};

/* ── Vista 2 · Lista de alta densidad ────────────── */

const rowHTML = (contact, index, query, topId) => `
  <tr class="${topClass(contact, topId).trim()}" data-id="${contact.id}" data-dep="${contact.dependencia}" style="--card-index:${index}">
    <td class="col-fav">${favButton(contact)}</td>
    <th scope="row" class="col-name">
      <span class="row-name">${highlight(contact.nombre, query)}</span>
      <span class="row-unit">${dot}<span>${highlight(contact.categoria, query)}</span></span>
    </th>
    <td class="col-unit"><span class="unit-cell">${dot}<span>${highlight(contact.categoria, query)}</span></span></td>
    <td class="col-ext">${contact.standalone
      ? '<span class="row-dash" aria-label="Sin anexo">—</span>'
      : copyButton(contact.anexo, { label: 'Anexo', className: 'row-num is-ext', primary: true })}</td>
    <td class="col-phone">${contact.standalone
      ? `${copyButton(contact.anexo, { label: contact.numberLabel, isPhone: true, className: 'row-num', primary: true })}<span class="row-tag">${contact.numberLabel}</span>`
      : copyButton(contact.telefono, { label: 'Teléfono', isPhone: true, className: 'row-num' })}</td>
    <td class="col-act">
      ${callLink(contact, 'icon-btn')}
      ${fichaButton(contact, 'icon-btn')}
    </td>
  </tr>`;

const listHTML = (contacts, { query, topId }) => `
  <div class="table-shell dir-table">
    <table>
      <thead>
        <tr>
          <th class="col-fav"><span class="sr-only">Favorito</span></th>
          <th scope="col">Contacto</th>
          <th scope="col" class="col-unit">Unidad</th>
          <th scope="col">Anexo</th>
          <th scope="col">Teléfono</th>
          <th scope="col" class="col-act"><span class="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        ${contacts.map((contact, index) => rowHTML(contact, index, query, topId)).join('')}
      </tbody>
    </table>
  </div>`;

/* ── Vista 3 · Nodos por unidad ──────────────────── */

const nodeItemHTML = (contact, query, topId) => `
  <li class="node-item${topClass(contact, topId)}" data-id="${contact.id}">
    <span class="node-item-name">${highlight(contact.nombre, query)}</span>
    ${copyButton(contact.anexo, { label: contact.numberLabel, isPhone: contact.standalone, className: 'row-num is-ext', primary: true })}
    ${favButton(contact)}
    ${fichaButton(contact, 'icon-btn')}
  </li>`;

const nodesHTML = (contacts, { query, openAll, openClusters, reveal, topId }) => {
  const hubs = new Map();
  contacts.forEach(contact => {
    if (!hubs.has(contact.dependencia)) hubs.set(contact.dependencia, []);
    hubs.get(contact.dependencia).push(contact);
  });

  let html = '';
  let index = 0;
  hubs.forEach((items, group) => {
    const clusters = groupByCategory(items);
    html += `
      <section class="node-hub" data-hub="${group}"${reveal ? ' data-rv' : ''}>
        <div class="directory-group-head">
          <h3 class="directory-group-title node-hub-title">
            <span class="node-hub-core" aria-hidden="true">${icon(GROUP_ICONS[group] || 'hub')}</span>
            ${escapeHtml(GROUP_LABELS[group] || group)}
          </h3>
          <span class="directory-group-meta">${plural(clusters.size, 'unidad', 'unidades')} · ${plural(items.length)}</span>
        </div>
        <div class="node-grid">`;
    clusters.forEach((members, category) => {
      const open = openAll || openClusters.has(category);
      html += `
          <details class="node-cluster" data-cluster="${escapeHtml(category)}" style="--card-index:${index}"${open ? ' open' : ''}>
            <summary>
              <span class="node-dot" aria-hidden="true"></span>
              <span class="node-name">${highlight(category, query)}</span>
              <span class="node-count">${members.length}</span>
              ${icon('expand_more')}
            </summary>
            <ul class="node-list">
              ${members.map(contact => nodeItemHTML(contact, query, topId)).join('')}
            </ul>
          </details>`;
      index += 1;
    });
    html += `
        </div>
      </section>`;
  });
  return html;
};

/* ── API ─────────────────────────────────────────── */

const VIEW_RENDERERS = { cards: cardsHTML, list: listHTML, nodes: nodesHTML };

/* Pinta la vista con un único reflow: el HTML se parsea fuera del documento
   (template → DocumentFragment) y se intercambia de una vez. */
export const renderContacts = ({ container, contacts, view = 'cards', ...options }) => {
  const template = document.createElement('template');
  template.innerHTML = (VIEW_RENDERERS[view] || cardsHTML)(contacts, options);
  container.dataset.view = view;
  container.replaceChildren(template.content);
};

/* Ficha compacta para "Acceso rápido": una fila, el número y la ficha.
   Llamar, QR y quitar el fijado viven dentro de la ficha. */
export const quickTileHTML = (contact, index) => `
  <li class="quick-tile" data-id="${contact.id}" data-dep="${contact.dependencia}" style="--card-index:${index}">
    <div class="quick-tile-id">
      <span class="quick-tile-name">${escapeHtml(contact.nombre)}</span>
      <span class="quick-tile-unit">${dot}${escapeHtml(contact.categoria)}</span>
    </div>
    ${copyButton(contact.anexo, { label: contact.numberLabel, isPhone: contact.standalone, className: 'row-num is-ext' })}
    <div class="quick-tile-actions">
      ${fichaButton(contact, 'icon-btn')}
    </div>
  </li>`;

/* Chips de subcategoría con su conteo. */
export const chipsHTML = (categories, active, total) => {
  const chip = (name, count, value) => `
    <button type="button" class="chip cat-chip${value === active ? ' is-active' : ''}" data-cat="${escapeHtml(value)}" aria-pressed="${value === active}">
      ${escapeHtml(name)}<span class="cat-chip-count">${count}</span>
    </button>`;
  return chip('Todas', total, '') + categories.map(c => chip(c.name, c.count, c.name)).join('');
};

/* Contenido del modal de ficha rápida. */
export const fichaHTML = (contact, qr) => `
  <div class="ficha-head">
    <div class="ficha-id">
      <p class="eyebrow">${escapeHtml(GROUP_LABELS[contact.dependencia] || '')} · ${escapeHtml(contact.categoria)}</p>
      <h2 class="ficha-name" id="fichaTitle">${escapeHtml(contact.nombre)}</h2>
    </div>
    <div class="ficha-head-actions">
      ${favButton(contact)}
      <button type="button" class="icon-btn" data-action="close-ficha" aria-label="Cerrar ficha" title="Cerrar (Esc)">${icon('close')}</button>
    </div>
  </div>
  <div class="ficha-body">
    <div class="ficha-number">
      <span class="phone-data-label">${escapeHtml(contact.numberLabel)}</span>
      ${copyButton(contact.anexo, { label: contact.numberLabel, isPhone: contact.standalone, className: 'ficha-giant' })}
      ${contact.standalone ? '' : `
      <div class="ficha-phone">
        <span class="phone-data-label">Teléfono</span>
        ${copyButton(contact.telefono, { label: 'Teléfono', isPhone: true, className: 'phone-data-value' })}
      </div>`}
    </div>
    ${qr ? `
    <figure class="ficha-qr">
      <div class="ficha-qr-code">${qr.svg}</div>
      <figcaption>Escanea para marcar<br><strong>${escapeHtml(qr.number)}</strong></figcaption>
    </figure>` : ''}
  </div>
  <div class="ficha-actions">
    ${callLink(contact, 'btn-primary ficha-call', '<span>Llamar</span>')}
    <button type="button" class="btn-ghost" data-action="share">${icon('link')}<span>Copiar enlace</span></button>
  </div>`;
