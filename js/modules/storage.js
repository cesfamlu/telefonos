/* storage.js — localStorage tolerante a fallos (modo privado, cuota, JSON roto).
   El tema NO se guarda acá: lo maneja portal-shell.js con "cesfam-portal-theme". */

export const KEYS = {
  favs: 'cesfam-directory-favs',
  view: 'cesfam-directory-view',
  recent: 'cesfam-directory-recent',
  quickOpen: 'cesfam-directory-quick-open',
  searchSeen: 'directorio-search-seen',
};

export const readJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
};

export const writeJSON = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false; // sin persistencia: el valor vive solo en esta sesión
  }
};
