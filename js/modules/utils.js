/* utils.js — Utilidades puras, sin estado ni DOM global. */

export const $ = (selector, parent = document) => parent.querySelector(selector);
export const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

export const debounce = (callback, delay = 250) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(...args), delay);
  };
};

export const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Sin tildes, en minúsculas: "Dirección" y "direccion" son lo mismo al buscar. */
export const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim();

export const phoneDigits = (value) => String(value ?? '').replace(/\D/g, '');

/* Número marcable desde un celular (se usa en el código QR).
   Los datos traen el fijo en tres formas: 9 dígitos, "64 2 xxxxxx" o solo los
   6 dígitos locales de La Unión. Los 6 dígitos se completan con el prefijo 64 2. */
const COUNTRY_CODE = '+56';
const LOCAL_PREFIX = '642';

export const dialable = (value) => {
  const digits = phoneDigits(value);
  if (digits.length === 9) return `${COUNTRY_CODE}${digits}`;
  if (digits.length === 6) return `${COUNTRY_CODE}${LOCAL_PREFIX}${digits}`;
  return digits;
};

export const plural = (count, singular = 'contacto', pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
