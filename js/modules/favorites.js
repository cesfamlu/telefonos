/* favorites.js — Anexos fijados por el funcionario, persistentes en este equipo
   (localStorage "cesfam-directory-favs") y sincronizados entre pestañas. */

import { KEYS, readJSON, writeJSON } from './storage.js?v=20261112-v7';

const listeners = new Set();
let ids = load();

function load() {
  const stored = readJSON(KEYS.favs, []);
  return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
}

function emit(changedId) {
  listeners.forEach(listener => listener(changedId));
}

export const isFavorite = (id) => ids.has(id);
export const favoriteIds = () => [...ids];
export const favoriteCount = () => ids.size;

/* Devuelve true si el contacto quedó fijado, false si se quitó. */
export const toggleFavorite = (id) => {
  const pinned = !ids.has(id);
  if (pinned) ids.add(id); else ids.delete(id);
  writeJSON(KEYS.favs, [...ids]);
  emit(id);
  return pinned;
};

export const onFavoritesChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

window.addEventListener('storage', (event) => {
  if (event.key !== KEYS.favs) return;
  ids = load();
  emit(null);
});
