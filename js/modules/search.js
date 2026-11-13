/* search.js — Modelo de contactos + búsqueda difusa.
   Tolera tildes, mayúsculas y un error de tipeo por palabra ("farmasia"). */

import { escapeHtml, normalize } from './utils.js?v=20261112-v7';

export const GROUP_LABELS = { muni: 'Municipalidad', salud: 'Salud', daem: 'DAEM' };
export const GROUP_ICONS = { muni: 'account_balance', salud: 'local_hospital', daem: 'school' };

const slug = (value) => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* Aplana la fuente de verdad (grupo → categoría → contactos) a una lista con
   id estable, usado por favoritos, deep links y la red del hero. */
export const flattenData = (grouped) => {
  const flat = [];
  const seen = new Set();
  grouped.forEach(section => {
    section.contacts.forEach(c => {
      const kind = normalize(c.detail);
      const standalone = kind === 'directo' || kind === 'movil';
      let id = `${section.group}.${slug(section.category)}.${slug(c.name)}`;
      while (seen.has(id)) id += '-2';
      seen.add(id);

      const nameNorm = normalize(c.name);
      const haystack = normalize([c.name, c.ext, c.detail, section.category, GROUP_LABELS[section.group]].join(' '));
      flat.push({
        id,
        nombre: c.name,
        anexo: c.ext,
        telefono: c.detail,
        categoria: section.category,
        dependencia: section.group,
        // "Directo" / "Movil": el número completo viene en el campo anexo.
        standalone,
        numberLabel: standalone ? (kind === 'movil' ? 'Móvil' : 'Directo') : 'Anexo',
        _name: nameNorm,
        _search: haystack,
        _words: haystack.split(/[^a-z0-9]+/).filter(Boolean),
      });
    });
  });
  return flat;
};

export const tokenize = (query) => normalize(query).split(/\s+/).filter(Boolean);

/* Distancia de edición acotada: corta apenas supera el máximo permitido. */
function withinDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return false;
    prev = row;
  }
  return prev[b.length] <= max;
}

function typoMatch(token, words) {
  if (token.length < 4 || /\d/.test(token)) return false; // un anexo mal tipeado es otro anexo
  const max = token.length >= 8 ? 2 : 1;
  return words.some(word => {
    if (word.length < token.length - max) return false;
    return withinDistance(token, word.slice(0, token.length), max);
  });
}

/* Puntaje de un contacto frente a los tokens; 0 = no coincide.
   Todos los tokens deben calzar (AND). */
export const scoreContact = (contact, tokens) => {
  if (!tokens.length) return 1;
  let total = 0;
  for (const token of tokens) {
    let score = 0;
    if (contact.anexo === token) score = 120;
    else if (contact._name.startsWith(token)) score = 90;
    else if (contact._words.some(word => word.startsWith(token))) {
      score = contact._name.includes(token) ? 70 : 50;
    } else if (contact._search.includes(token)) score = 35;
    else if (typoMatch(token, contact._words)) score = 12;
    if (!score) return 0;
    total += score;
  }
  // El nombre exacto gana a los que solo empiezan igual ("farmacia" → Farmacia).
  if (contact._name === tokens.join(' ')) total += 40;
  return total;
};

export const filterByQuery = (contacts, query) => {
  const tokens = tokenize(query);
  if (!tokens.length) return contacts;
  return contacts.filter(contact => scoreContact(contact, tokens) > 0);
};

/* Lista ordenada por relevancia (para la paleta de comandos). */
export const rankContacts = (contacts, query) => {
  const tokens = tokenize(query);
  if (!tokens.length) return contacts.slice();
  return contacts
    .map((contact, order) => ({ contact, order, score: scoreContact(contact, tokens) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(entry => entry.contact);
};

/* Envuelve en <mark> cada tramo del texto que calza con algún token.
   Trabaja carácter a carácter para que las tildes no desalineen el resaltado. */
export const highlight = (text, query) => {
  const source = String(text ?? '');
  const tokens = tokenize(query);
  if (!tokens.length) return escapeHtml(source);

  const chars = [...source];
  const norm = chars.map(ch => normalize(ch) || ch.toLowerCase());
  const map = [];
  let flat = '';
  norm.forEach((piece, index) => {
    for (const unit of piece) { flat += unit; map.push(index); }
  });

  const marked = new Array(chars.length).fill(false);
  tokens.forEach(token => {
    let from = 0;
    while (true) {
      const at = flat.indexOf(token, from);
      if (at < 0) break;
      for (let k = at; k < at + token.length; k += 1) marked[map[k]] = true;
      from = at + token.length;
    }
  });

  let html = '';
  let open = false;
  chars.forEach((ch, index) => {
    if (marked[index] && !open) { html += '<mark>'; open = true; }
    if (!marked[index] && open) { html += '</mark>'; open = false; }
    html += escapeHtml(ch);
  });
  return open ? `${html}</mark>` : html;
};
