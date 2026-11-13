/* filters.js — Filtro combinado (dependencia / favoritos / subcategoría / texto)
   y estado compartible por URL (?q=&group=&cat=&view=&ficha=). */

import { filterByQuery } from './search.js?v=20261112-v7';

export const GROUPS = ['all', 'muni', 'salud', 'daem', 'favs'];
export const VIEWS = ['cards', 'list', 'nodes'];

/* Contactos de un grupo (dependencia, favoritos o todos). */
export const filterGroup = (contacts, group, isFavorite) => {
  if (group === 'favs') return contacts.filter(c => isFavorite(c.id));
  if (group && group !== 'all') return contacts.filter(c => c.dependencia === group);
  return contacts;
};

/* Contactos del grupo activo, antes de aplicar subcategoría. */
export const scopeContacts = (contacts, { group, query }, isFavorite) =>
  filterByQuery(filterGroup(contacts, group, isFavorite), query);

/* Conteo por faceta sobre una lista ya filtrada por texto: así cada filtro
   dice cuántos resultados daría ANTES de tocarlo ("farmacia" → Salud 2, DAEM 0). */
export const groupCounts = (contacts, isFavorite) => {
  const counts = { all: contacts.length, muni: 0, salud: 0, daem: 0, favs: 0 };
  contacts.forEach(c => {
    counts[c.dependencia] = (counts[c.dependencia] || 0) + 1;
    if (isFavorite(c.id)) counts.favs += 1;
  });
  return counts;
};

export const applyCategory = (contacts, cat) =>
  cat ? contacts.filter(c => c.categoria === cat) : contacts;

/* Categorías reales presentes en el alcance, con su conteo y en orden de datos. */
export const categoryCounts = (contacts) => {
  const counts = new Map();
  contacts.forEach(c => counts.set(c.categoria, (counts.get(c.categoria) || 0) + 1));
  return [...counts].map(([name, count]) => ({ name, count }));
};

export const readUrlState = (search = window.location.search) => {
  const params = new URLSearchParams(search);
  const group = params.get('group');
  const view = params.get('view');
  return {
    query: (params.get('q') || '').trim(),
    group: GROUPS.includes(group) ? group : 'all',
    cat: params.get('cat') || '',
    view: VIEWS.includes(view) ? view : null,
    ficha: params.get('ficha') || '',
  };
};

export const buildUrl = ({ query, group, cat, view, ficha }) => {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (group && group !== 'all') params.set('group', group);
  if (cat) params.set('cat', cat);
  if (view && view !== 'cards') params.set('view', view);
  if (ficha) params.set('ficha', ficha);
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
};

export const writeUrlState = (state) => {
  const url = buildUrl(state);
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    history.replaceState(null, '', url);
  }
};
