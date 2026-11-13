/* accessibility.js — Apoyos de accesibilidad compartidos. */

/* ¿El foco está en un campo donde el usuario escribe? (los atajos de una
   tecla, como "/", no deben dispararse ahí). */
export const isTypingTarget = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
};

let liveRegion = null;
let liveTimer = 0;

/* Anuncia un mensaje a lectores de pantalla sin mover el foco. Se agrupan los
   anuncios seguidos para no leer cada pulsación de tecla. */
export const announce = (message) => {
  if (!liveRegion) return;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { liveRegion.textContent = message; }, 400);
};

export const initializeAccessibility = () => {
  liveRegion = document.createElement('div');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  document.body.appendChild(liveRegion);
};
