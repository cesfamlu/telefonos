/* ui.js — Micro-interacciones: portapapeles, toasts y física 3D de tarjetas. */

import { escapeHtml, prefersReducedMotion } from './utils.js?v=20261112-v7';

/* ── Portapapeles ────────────────────────────────── */

export async function copyText(text) {
  const value = String(text ?? '');
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    /* permiso denegado: se intenta el método clásico */
  }
  // Respaldo para http:// sin contexto seguro (intranet).
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  (document.querySelector('dialog[open]') || document.body).appendChild(area);
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
  area.remove();
  return ok;
}

/* Feedback en el mismo botón: ícono → check + insignia "¡Copiado!". */
const copiedTimers = new WeakMap();
export function flashCopied(button) {
  if (!button) return;
  clearTimeout(copiedTimers.get(button));
  button.classList.remove('is-copied');
  void button.offsetWidth;
  button.classList.add('is-copied');
  copiedTimers.set(button, setTimeout(() => button.classList.remove('is-copied'), 1500));
}

/* ── Toasts ──────────────────────────────────────── */

let stack = null;

function toastHost() {
  // Con un <dialog> modal abierto, lo que está fuera queda inerte y tapado:
  // el aviso se muestra dentro del diálogo.
  const host = document.querySelector('dialog[open]') || document.body;
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
  }
  if (stack.parentElement !== host) host.appendChild(stack);
  return stack;
}

export function toast(message, { icon = 'check_circle', detail = '', duration = 2600 } = {}) {
  const host = toastHost();
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `
    <i class="material-icons-round" aria-hidden="true">${icon}</i>
    <div class="toast-body">
      <strong>${escapeHtml(message)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
    </div>`;
  host.appendChild(node);
  while (host.children.length > 3) host.firstElementChild.remove();

  const dismiss = () => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), prefersReducedMotion() ? 0 : 260);
  };
  setTimeout(dismiss, duration);
  node.addEventListener('click', dismiss);
}

/* ── Filo que se enciende cerca del puntero ─────────
   Cada tarjeta recibe --lx / --ly (el puntero relativo a ella) y su .card-surface
   dibuja ahí un halo ámbar sobre el borde: se encienden también las vecinas.
   Solo se mide lo visible (IntersectionObserver) y una vez por cuadro. */

const EDGE_REACH = 240; // px alrededor de la tarjeta en que el filo responde

export function initEdgeLight(container, selector = '.contact-card') {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!('IntersectionObserver' in window)) return;

  const visible = new Set();
  const lit = new Set();
  let x = -1e4;
  let y = -1e4;
  let frame = 0;
  let inside = false;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
  }, { rootMargin: `${EDGE_REACH}px 0px` });

  const observeAll = () => {
    io.disconnect();
    visible.clear();
    lit.clear();
    container.querySelectorAll(selector).forEach(card => io.observe(card));
  };
  new MutationObserver(observeAll).observe(container, { childList: true });
  observeAll();

  const clear = (card) => {
    card.style.removeProperty('--lx');
    card.style.removeProperty('--ly');
  };

  function paint() {
    frame = 0;
    // Primero se lee todo, después se escribe: un solo reflow por cuadro.
    const reads = [];
    visible.forEach(card => {
      const r = card.getBoundingClientRect();
      const near = inside
        && x > r.left - EDGE_REACH && x < r.right + EDGE_REACH
        && y > r.top - EDGE_REACH && y < r.bottom + EDGE_REACH;
      reads.push([card, near, x - r.left, y - r.top]);
    });
    reads.forEach(([card, near, lx, ly]) => {
      if (near) {
        card.style.setProperty('--lx', `${lx.toFixed(0)}px`);
        card.style.setProperty('--ly', `${ly.toFixed(0)}px`);
        lit.add(card);
      } else if (lit.has(card)) {
        clear(card);
        lit.delete(card);
      }
    });
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

  container.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !finePointer.matches || container.dataset.view !== 'cards') return;
    inside = true;
    x = event.clientX;
    y = event.clientY;
    schedule();
  }, { passive: true });

  container.addEventListener('pointerleave', () => {
    inside = false;
    lit.forEach(clear);
    lit.clear();
  });

  // Al desplazarse con la rueda las tarjetas se mueven bajo el puntero quieto.
  window.addEventListener('scroll', () => { if (inside) schedule(); }, { passive: true });
}

/* ── Tilt 3D + reflejo especular ─────────────────────
   Un solo par de listeners delegados en el contenedor y un único loop rAF con
   resorte amortiguado. El loop solo corre mientras alguna tarjeta se mueve. */

const MAX_TILT = 7;      // grados
const LIFT = 14;         // px de translateZ
const STIFFNESS = 210;
const DAMPING = 20;

export function initTilt(container, selector = '.contact-card') {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const bodies = new Map();
  let active = null;
  let pointerX = 0;
  let pointerY = 0;
  let frame = 0;
  let last = 0;

  const enabled = () => finePointer.matches && !prefersReducedMotion() && container.dataset.view === 'cards';

  function body(card) {
    if (!bodies.has(card)) {
      bodies.set(card, { rx: 0, ry: 0, z: 0, vrx: 0, vry: 0, vz: 0, trx: 0, try: 0, tz: 0 });
      card.classList.add('is-tilting');
    }
    return bodies.get(card);
  }

  function release(card) {
    const b = bodies.get(card);
    if (b) { b.trx = 0; b.try = 0; b.tz = 0; }
    card.style.setProperty('--glare', '0');
  }

  function step(now) {
    frame = 0;
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;

    if (active && active.isConnected) {
      const rect = active.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (pointerX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (pointerY - rect.top) / rect.height));
      const b = body(active);
      b.try = (px - 0.5) * 2 * MAX_TILT;
      b.trx = -(py - 0.5) * 2 * MAX_TILT;
      b.tz = LIFT;
      active.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
      active.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
      active.style.setProperty('--glare', '1');
    }

    bodies.forEach((b, card) => {
      if (!card.isConnected) { bodies.delete(card); return; }
      b.vrx += ((b.trx - b.rx) * STIFFNESS - b.vrx * DAMPING) * dt;
      b.vry += ((b.try - b.ry) * STIFFNESS - b.vry * DAMPING) * dt;
      b.vz += ((b.tz - b.z) * STIFFNESS - b.vz * DAMPING) * dt;
      b.rx += b.vrx * dt;
      b.ry += b.vry * dt;
      b.z += b.vz * dt;

      const resting = card !== active
        && Math.abs(b.rx) + Math.abs(b.ry) + Math.abs(b.z) < 0.05
        && Math.abs(b.vrx) + Math.abs(b.vry) + Math.abs(b.vz) < 0.05;
      if (resting) {
        ['--rx', '--ry', '--tz', '--gx', '--gy', '--glare'].forEach(p => card.style.removeProperty(p));
        card.classList.remove('is-tilting');
        bodies.delete(card);
        return;
      }
      card.style.setProperty('--rx', `${b.rx.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${b.ry.toFixed(2)}deg`);
      card.style.setProperty('--tz', `${b.z.toFixed(2)}px`);
    });

    if (bodies.size) schedule();
  }

  function schedule() {
    if (frame) return;
    last = performance.now();
    frame = requestAnimationFrame(step);
  }

  container.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !enabled()) return;
    const card = event.target.closest(selector);
    if (card !== active) {
      if (active) release(active);
      active = card;
    }
    if (!card) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    schedule();
  }, { passive: true });

  container.addEventListener('pointerleave', () => {
    if (active) release(active);
    active = null;
    if (bodies.size) schedule();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !active) return;
    release(active);
    active = null;
  });
}
