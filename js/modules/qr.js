/* qr.js — Generador de códigos QR en el cliente, sin dependencias.
   Modo byte, corrección de errores nivel M, versiones 1 a 3 (hasta 42 bytes):
   suficiente para un enlace tel: y de un solo bloque Reed-Solomon. */

const VERSIONS = [
  null,
  { size: 21, data: 16, ec: 10, align: null },
  { size: 25, data: 28, ec: 16, align: 18 },
  { size: 29, data: 44, ec: 26, align: 22 },
];

// Aritmética en GF(256), polinomio 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function reedSolomon(data, ecLength) {
  let generator = [1];
  for (let i = 0; i < ecLength; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    generator.forEach((coef, j) => {
      next[j] ^= coef;
      next[j + 1] ^= gfMul(coef, EXP[i]);
    });
    generator = next;
  }
  const remainder = new Array(ecLength).fill(0);
  data.forEach(byte => {
    const factor = byte ^ remainder.shift();
    remainder.push(0);
    for (let j = 0; j < ecLength; j += 1) remainder[j] ^= gfMul(generator[j + 1], factor);
  });
  return remainder;
}

function encodeData(bytes, version) {
  const capacity = VERSIONS[version].data;
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);            // modo byte
  push(bytes.length, 8);      // largo (8 bits en versiones 1-9)
  bytes.forEach(byte => push(byte, 8));
  push(0, Math.min(4, capacity * 8 - bits.length));
  while (bits.length % 8) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  for (let pad = 0; codewords.length < capacity; pad += 1) codewords.push(pad % 2 ? 0x11 : 0xEC);
  return codewords;
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/* 15 bits de formato: nivel M (00) + máscara, con BCH(15,5) y máscara fija. */
function formatBits(mask) {
  const data = (0b00 << 3) | mask;
  let rem = data << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function buildBase(version) {
  const { size, align } = VERSIONS[version];
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    modules[r][c] = dark;
    reserved[r][c] = true;
  };

  // Patrones de posición + separadores
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r0, c0]) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(r0 + r, c0 + c, ring <= 3 && ring !== 2);
      }
    }
  });

  // Patrón de alineación (versiones 2+)
  if (align) {
    for (let r = -2; r <= 2; r += 1) {
      for (let c = -2; c <= 2; c += 1) {
        set(align + r, align + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
      }
    }
  }

  // Sincronía
  for (let i = 8; i < size - 8; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Módulo oscuro + reserva de la información de formato
  set(size - 8, 8, true);
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8][i]) set(8, i, false);
    if (!reserved[i][8]) set(i, 8, false);
  }
  for (let i = 0; i < 8; i += 1) {
    if (!reserved[8][size - 1 - i]) set(8, size - 1 - i, false);
    if (!reserved[size - 1 - i][8]) set(size - 1 - i, 8, false);
  }

  return { modules, reserved, size };
}

function placeData(base, codewords) {
  const { modules, reserved, size } = base;
  const bits = [];
  codewords.forEach(byte => {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  });
  let index = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1; // la columna de sincronía se salta
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (reserved[row][c]) continue;
        modules[row][c] = index < bits.length ? bits[index] === 1 : false;
        index += 1;
      }
    }
    upward = !upward;
  }
}

function applyMask(base, mask) {
  const { modules, reserved, size } = base;
  const out = modules.map(row => row.slice());
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!reserved[r][c] && MASKS[mask](r, c)) out[r][c] = !out[r][c];
    }
  }
  const format = formatBits(mask);
  const bit = (i) => ((format >> i) & 1) === 1;
  // Copia 1: alrededor del patrón superior izquierdo
  for (let i = 0; i <= 5; i += 1) out[8][i] = bit(14 - i);
  out[8][7] = bit(8);
  out[8][8] = bit(7);
  out[7][8] = bit(6);
  for (let i = 0; i <= 5; i += 1) out[5 - i][8] = bit(5 - i);
  // Copia 2: repartida entre los otros dos patrones
  for (let i = 0; i <= 6; i += 1) out[size - 1 - i][8] = bit(14 - i);
  for (let i = 0; i <= 7; i += 1) out[8][size - 8 + i] = bit(7 - i);
  return out;
}

/* Penalización estándar (reglas 1 a 4) para elegir la máscara más legible. */
function penalty(matrix) {
  const size = matrix.length;
  let score = 0;
  const lines = [];
  for (let i = 0; i < size; i += 1) {
    lines.push(matrix[i]);
    lines.push(matrix.map(row => row[i]));
  }
  lines.forEach(line => {
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && line[i] === line[i - 1]) { run += 1; continue; }
      if (run >= 5) score += run - 2;
      run = 1;
    }
    const text = line.map(v => (v ? '1' : '0')).join('');
    for (let i = 0; i <= size - 11; i += 1) {
      const window = text.substr(i, 11);
      if (window === '10111010000' || window === '00001011101') score += 40;
    }
  });
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c]) dark += 1;
      if (r < size - 1 && c < size - 1) {
        const v = matrix[r][c];
        if (v === matrix[r][c + 1] && v === matrix[r + 1][c] && v === matrix[r + 1][c + 1]) score += 3;
      }
    }
  }
  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
  return score;
}

/* Devuelve la matriz booleana (true = módulo oscuro) o null si el texto no cabe. */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const version = VERSIONS.findIndex((v, i) => i > 0 && bytes.length <= v.data - 2);
  if (version < 1) return null;

  const data = encodeData(bytes, version);
  const codewords = data.concat(reedSolomon(data, VERSIONS[version].ec));
  const base = buildBase(version);
  placeData(base, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(base, mask);
    const score = penalty(candidate);
    if (!best || score < best.score) best = { matrix: candidate, score };
  }
  return best.matrix;
}

/* SVG nítido a cualquier tamaño. Siempre negro sobre blanco con zona de
   silencio de 4 módulos: es lo que mejor leen las cámaras, en ambos temas. */
export function qrSvg(text, { label = 'Código QR' } = {}) {
  const matrix = qrMatrix(text);
  if (!matrix) return '';
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  let path = '';
  matrix.forEach((row, r) => {
    let start = -1;
    for (let c = 0; c <= row.length; c += 1) {
      if (c < row.length && row[c]) { if (start < 0) start = c; continue; }
      if (start >= 0) {
        path += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
        start = -1;
      }
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

export const _internals = { reedSolomon, formatBits, encodeData };
