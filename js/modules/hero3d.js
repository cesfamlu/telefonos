/* hero3d.js — Red nodal 3D del hero, dibujada sobre [data-hero-canvas].
   Motor propio de proyección en perspectiva sobre Canvas 2D: sin dependencias,
   sin CDN, ~170 nodos a 60fps.

   La red ES el directorio: 3 núcleos (Municipalidad, Salud, DAEM), un nodo por
   unidad y un punto por contacto real. Reacciona a:
     · puntero  → parallax 3D
     · tipeo    → pulso de energía (acelera la órbita y lanza una onda)
     · búsqueda → los contactos que calzan se encienden
     · filtro   → la cámara enfoca el núcleo activo y la red toma su acento
   Se pausa sola fuera de pantalla, con la pestaña oculta o con
   prefers-reduced-motion (en ese caso dibuja cuadros estáticos). */

import { GROUP_LABELS } from './search.js?v=20261112-v7';

const HUB_ORDER = ['muni', 'salud', 'daem'];
const HUB_TOKEN = { muni: '--gold', salud: '--ok', daem: '--ink' };
const FOCAL = 640;
const TAU = Math.PI * 2;

/* PRNG determinista: la red es idéntica en cada carga. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(value, fallback) {
  const hex = String(value || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

const rgba = (rgb, alpha) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const ease = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

function unit(x, y, z) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

/* Direcciones repartidas de forma pareja sobre una esfera. */
function fibonacci(index, total) {
  const y = total === 1 ? 0 : 1 - (2 * (index + 0.5)) / total;
  const radius = Math.sqrt(1 - y * y);
  const angle = index * 2.399963;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function buildModel(contacts) {
  const rand = mulberry32(20260830);
  return HUB_ORDER.map((group, hubIndex) => {
    const categories = [];
    contacts.filter(c => c.dependencia === group).forEach(contact => {
      let category = categories.find(cat => cat.name === contact.categoria);
      if (!category) { category = { name: contact.categoria, contacts: [] }; categories.push(category); }
      category.contacts.push(contact);
    });

    const nodes = [];
    categories.forEach((category, index) => {
      const dir = fibonacci(index, categories.length);
      const catNode = { kind: 'cat', dir, radius: 0.46, parent: -1 };
      const catIndex = nodes.push(catNode) - 1;
      category.contacts.forEach(contact => {
        const spread = 0.62;
        const d = unit(
          dir[0] + (rand() - 0.5) * spread * 2,
          dir[1] + (rand() - 0.5) * spread * 2,
          dir[2] + (rand() - 0.5) * spread * 2,
        );
        nodes.push({ kind: 'contact', id: contact.id, dir: d, radius: 0.74 + rand() * 0.26, parent: catIndex, size: 0.8 + rand() * 0.9 });
      });
    });

    return {
      group,
      label: GROUP_LABELS[group].toUpperCase(),
      nodes,
      spin: (hubIndex % 2 ? -1 : 1) * (0.10 + rand() * 0.05),
      tilt: (rand() - 0.5) * 0.7,
      angle: rand() * TAU,
      weight: 1,
      // posiciones proyectadas del último cuadro
      sx: 0, sy: 0, ss: 1,
    };
  });
}

export function createHero3D(canvas, contacts) {
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return null;

  const hubs = buildModel(contacts);
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  let width = 0;
  let height = 0;
  let clearLeft = 0;       // borde derecho del buscador, en px del canvas
  const searchBox = canvas.parentElement?.querySelector('.hero-search');
  let colors = null;
  let focus = 'all';
  let previewGroup = null; // foco temporal mientras se apunta un núcleo o su leyenda
  let compactLayout = false;
  let matches = null;
  let energy = 0;
  let ripple = 1;          // 0 → 1; 1 = sin onda activa
  let pulseT = 0;
  let accent = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let panX = 0;

  let frame = 0;
  let last = 0;
  let inView = true;

  function readColors() {
    const style = getComputedStyle(root);
    const token = (name, fallback) => hexToRgb(style.getPropertyValue(name), fallback);
    const ink = token('--ink', [238, 242, 246]);
    colors = {
      ink,
      gold: token('--gold', [245, 185, 66]),
      hub: {
        muni: token(HUB_TOKEN.muni, [245, 185, 66]),
        salud: token(HUB_TOKEN.salud, [52, 211, 153]),
        daem: ink,
      },
      light: root.getAttribute('data-theme') === 'light',
    };
    if (!accent) accent = colors.gold.slice();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    clearLeft = searchBox ? searchBox.getBoundingClientRect().right - rect.left : 0;
  }

  function project(x, y, z, cx, cy) {
    const scale = FOCAL / (FOCAL + z);
    return [cx + x * scale, cy + y * scale, scale];
  }

  function draw(dt) {
    if (width < 2 || height < 2) return;
    ctx.clearRect(0, 0, width, height);

    // Si a la derecha del buscador queda espacio, la red vive ahí, nítida.
    // Si no (tablet, móvil), ocupa todo el ancho como fondo atenuado.
    const free = width - clearLeft;
    const compact = free < 460;
    compactLayout = compact;
    const spread = compact ? width * 0.31 : Math.min((free - 190) / 2, 400);
    const clusterR = Math.min(height * 0.62, compact ? width * 0.2 : spread * 0.56);
    const cx = compact ? width * 0.5 : clearLeft + free / 2 + 8;
    const cy = height * 0.5;
    const base = compact ? 0.5 : 1;

    // Estado suavizado
    pointer.x = ease(pointer.x, pointer.tx, 4, dt);
    pointer.y = ease(pointer.y, pointer.ty, 4, dt);
    energy = Math.max(0, energy - dt * 0.9);
    if (ripple < 1) ripple = Math.min(1, ripple + dt * 1.1);
    pulseT = (pulseT + dt * (0.14 + energy * 0.5)) % 1;

    const activeGroup = previewGroup || focus;
    const focusIndex = HUB_ORDER.indexOf(activeGroup);
    const targetAccent = focusIndex >= 0 ? colors.hub[activeGroup] : colors.gold;
    accent = accent.map((v, i) => ease(v, targetAccent[i], 5, dt));
    panX = ease(panX, focusIndex >= 0 ? -(focusIndex - 1) * spread * 0.55 : 0, 3.2, dt);

    const rotY = pointer.x * 0.5;
    const rotX = -pointer.y * 0.32;
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    /* Mundo → cámara: rotación global por el puntero. */
    const toCamera = (x, y, z) => {
      const x1 = x * cosY + z * sinY;
      const z1 = -x * sinY + z * cosY;
      const y1 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      return [x1, y1, z2];
    };

    const searching = matches !== null;
    const lineRgb = colors.ink;
    const accentRgb = accent.map(Math.round);

    hubs.forEach((hub, hubIndex) => {
      const focused = focusIndex < 0 || focusIndex === hubIndex;
      hub.weight = ease(hub.weight, focused ? 1 : 0.28, 4, dt);
      hub.angle += hub.spin * (1 + energy * 3.2) * dt;

      const hx = (hubIndex - 1) * spread + panX;
      const hz = hubIndex === 1 ? -40 : 30;
      const grow = clusterR * (0.82 + 0.3 * hub.weight) * (focusIndex === hubIndex ? 1.12 : 1);
      const [hcx, hcy, hcz] = toCamera(hx, 0, hz);
      const [sx, sy, ss] = project(hcx, hcy, hcz, cx, cy);
      hub.sx = sx; hub.sy = sy; hub.ss = ss;
      hub.reach = Math.max(34, grow * ss * 0.9); // radio clicable en pantalla

      const cosA = Math.cos(hub.angle), sinA = Math.sin(hub.angle);
      const cosT = Math.cos(hub.tilt), sinT = Math.sin(hub.tilt);
      const hubRgb = colors.hub[hub.group];
      const alpha = hub.weight * base;

      // 1) proyectar nodos
      const points = hub.nodes.map(node => {
        const r = node.radius * grow;
        let x = node.dir[0] * r, y = node.dir[1] * r, z = node.dir[2] * r;
        const xr = x * cosA + z * sinA;          // órbita propia del núcleo
        const zr = -x * sinA + z * cosA;
        const yt = y * cosT - zr * sinT;         // inclinación del plano orbital
        const zt = y * sinT + zr * cosT;
        const [px, py, pz] = toCamera(hx + xr, yt, hz + zt);
        return project(px, py, pz, cx, cy);
      });

      // 2) aristas
      ctx.lineWidth = 1;
      hub.nodes.forEach((node, index) => {
        const [px, py, ps] = points[index];
        const depth = Math.min(1.25, ps);
        if (node.kind === 'cat') {
          ctx.strokeStyle = rgba(mix(lineRgb, hubRgb, 0.6), 0.3 * alpha * depth);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(px, py); ctx.stroke();
        } else {
          const hit = searching && matches.has(node.id);
          const [qx, qy] = points[node.parent];
          ctx.strokeStyle = hit
            ? rgba(colors.gold, 0.5 * base)
            : rgba(lineRgb, (searching ? 0.05 : 0.11) * alpha * depth);
          ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
        }
      });

      // 3) nodos
      hub.nodes.forEach((node, index) => {
        const [px, py, ps] = points[index];
        const depth = Math.min(1.25, ps);
        if (node.kind === 'cat') {
          ctx.fillStyle = rgba(hubRgb, 0.9 * alpha);
          ctx.beginPath(); ctx.arc(px, py, 2.6 * depth, 0, TAU); ctx.fill();
          return;
        }
        const hit = searching && matches.has(node.id);
        if (hit) {
          const glow = 9 * depth;
          const gradient = ctx.createRadialGradient(px, py, 0, px, py, glow);
          gradient.addColorStop(0, rgba(colors.gold, 0.55 * base));
          gradient.addColorStop(1, rgba(colors.gold, 0));
          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(px, py, glow, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(colors.gold, Math.min(1, base + 0.3));
          ctx.beginPath(); ctx.arc(px, py, 2.4 * depth, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = rgba(lineRgb, (searching ? 0.16 : 0.42) * alpha * depth);
          ctx.beginPath(); ctx.arc(px, py, node.size * depth, 0, TAU); ctx.fill();
        }
      });

      // 4) núcleo + onda de tipeo
      const halo = (18 + 10 * hub.weight + energy * 10) * ss;
      const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, halo);
      gradient.addColorStop(0, rgba(hubRgb, 0.42 * alpha));
      gradient.addColorStop(1, rgba(hubRgb, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(sx, sy, halo, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(hubRgb, Math.min(1, alpha + 0.15));
      ctx.beginPath(); ctx.arc(sx, sy, (4 + hub.weight * 1.6) * ss, 0, TAU); ctx.fill();

      if (ripple < 1 && focused) {
        ctx.strokeStyle = rgba(accentRgb, (1 - ripple) * 0.5 * base);
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(sx, sy, (8 + ripple * grow * 0.95) * ss, 0, TAU); ctx.stroke();
      }
    });

    // 5) enlaces entre núcleos + pulsos viajeros
    for (let i = 0; i < hubs.length; i += 1) {
      const a = hubs[i];
      const b = hubs[(i + 1) % hubs.length];
      const linkAlpha = Math.min(a.weight, b.weight) * base;
      ctx.strokeStyle = rgba(accentRgb, 0.2 * linkAlpha);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      ctx.setLineDash([]);

      const t = (pulseT + i / hubs.length) % 1;
      const px = a.sx + (b.sx - a.sx) * t;
      const py = a.sy + (b.sy - a.sy) * t;
      const fade = Math.sin(t * Math.PI) * linkAlpha;
      const radius = 16 + energy * 12;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, radius);
      glow.addColorStop(0, rgba(accentRgb, 0.5 * fade));
      glow.addColorStop(1, rgba(accentRgb, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(px, py, radius, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(accentRgb, 0.9 * fade);
      ctx.beginPath(); ctx.arc(px, py, 1.6, 0, TAU); ctx.fill();
    }

    // 6) rótulos — en el diseño compacto la red queda detrás del buscador:
    // sus nombres chocarían con el texto, y la leyenda (.hub-keys) ya los dice.
    if (compact) return;
    ctx.font = `700 ${width < 720 ? 9 : 10.5}px Quantico, "Arial Narrow", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    hubs.forEach(hub => {
      ctx.fillStyle = rgba(colors.ink, (0.25 + 0.6 * hub.weight) * (compact ? 0.6 : 0.9));
      const spaced = hub.label.split('').join(' ');
      ctx.fillText(spaced, hub.sx, hub.sy + 13 * hub.ss);
    });
  }

  function tick(now) {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    draw(dt);
    schedule();
  }

  function schedule() {
    if (frame || !inView || document.hidden || motionQuery.matches) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  /* Con movimiento reducido no hay loop: se asienta el estado y se dibuja un cuadro. */
  function settle() {
    if (!motionQuery.matches) { schedule(); return; }
    energy = 0; ripple = 1;
    pointer.x = pointer.tx = 0; pointer.y = pointer.ty = 0;
    for (let i = 0; i < 40; i += 1) draw(0.05);
  }

  // ── Entradas ──
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    pointer.tx = event.clientX / window.innerWidth - 0.5;
    pointer.ty = event.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  if ('ResizeObserver' in window) {
    // Redimensionar borra el canvas: se repinta en el acto, sin esperar al loop.
    new ResizeObserver(() => { resize(); settle(); draw(0); }).observe(canvas);
  } else {
    window.addEventListener('resize', () => { resize(); settle(); draw(0); });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) schedule(); else stop();
    }, { threshold: 0 }).observe(canvas);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else schedule();
  });

  motionQuery.addEventListener?.('change', () => { stop(); settle(); });

  new MutationObserver(() => { readColors(); settle(); draw(0); })
    .observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // Quantico llega después del primer cuadro: se redibuja el rótulo estático.
  document.fonts?.ready.then(() => { if (!frame) settle(); });

  readColors();
  resize();
  settle();

  return {
    setFocus(group) {
      focus = HUB_ORDER.includes(group) ? group : 'all';
      settle();
    },
    setMatches(ids) {
      matches = ids ? new Set(ids) : null;
      settle();
    },
    /* Foco temporal (hover sobre la leyenda o el núcleo); null lo devuelve al filtro. */
    preview(group) {
      const next = HUB_ORDER.includes(group) ? group : null;
      if (next === previewGroup) return;
      previewGroup = next;
      settle();
    },
    /* ¿Qué núcleo hay bajo este punto de la pantalla? En el diseño compacto
       (móvil) la red es fondo, no control: devuelve null. */
    hitTest(clientX, clientY) {
      if (compactLayout) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      let best = null;
      let bestDistance = Infinity;
      hubs.forEach(hub => {
        const distance = Math.hypot(hub.sx - x, hub.sy - y);
        if (distance < (hub.reach || 0) && distance < bestDistance) {
          best = hub.group;
          bestDistance = distance;
        }
      });
      return best;
    },
    pulse() {
      if (motionQuery.matches) return;
      energy = Math.min(1, energy + 0.45);
      ripple = 0;
      schedule();
    },
    isRunning: () => frame !== 0,
  };
}
