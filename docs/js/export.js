/* Taking work out of the tool: the truth table as a png, csv or LaTeX
   tabular, the derivation as a LaTeX align*, the circuit as a png
   (SPEC.md section 13).

   The string builders are pure so the tests can check them without
   touching the filesystem; only save() reaches for the DOM. */

import { toText, toTeX, toTeXMarked, toTextSpans } from './text.js';
import { evalAt } from './core.js';
import { gateNodes } from './truthtable.js';
import { label } from './rules.js';

/* ---- files -------------------------------------------------------- */

export function save(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can beat the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* A filename that survives every filesystem: the expression is the
   useful part of it, but not at the price of a name that will not
   write. */
export function slug(s) {
  const t = s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (t || 'expression').slice(0, 40).toLowerCase();
}

/* ---- the table as data -------------------------------------------- */

/* One shape behind all three table exports: header strings, and a row
   per assignment. Mirrors what truthtable.js draws, working columns
   included, so an export is what the reader is looking at. */
export function tableData(opts) {
  const { expr, nv, letters, mode, mask, showWork } = opts;
  const cols = showWork ? gateNodes(expr).slice(0, -1) : [];
  const head = [
    ...letters.slice(0, nv),
    ...cols.map((n) => toText(n, mode, letters)),
    toText(expr, mode, letters),
  ];
  const headTeX = [
    ...letters.slice(0, nv),
    ...cols.map((n) => toTeX(n, mode, letters)),
    toTeX(expr, mode, letters),
  ];
  const rows = [];
  for (let r = 0; r < (1 << nv); r++) {
    const vals = new Map();
    evalAt(expr, r, nv, vals);
    rows.push([
      ...Array.from({ length: nv }, (_, i) => (r >> (nv - 1 - i)) & 1),
      ...cols.map((n) => (vals.get(n) ? 1 : 0)),
      (mask >> r) & 1,
    ]);
  }
  return { head, headTeX, rows, nv, nWork: cols.length };
}

/* ---- csv ---------------------------------------------------------- */

const csvCell = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function tableCSV(d) {
  return [d.head.map((h) => csvCell(String(h))).join(','),
          ...d.rows.map((r) => r.join(','))].join('\n') + '\n';
}

/* ---- latex -------------------------------------------------------- */

/* A rule the reader can see: variables, then working, then the answer. */
export function tableTeX(d, caption) {
  const spec = 'c'.repeat(d.nv) + '|' + 'c'.repeat(d.head.length - d.nv);
  const head = d.headTeX.map((h) => `$${h}$`).join(' & ');
  const body = d.rows.map((r) => '  ' + r.join(' & ') + ' \\\\').join('\n');
  return [
    `% ${caption}`,
    '\\begin{tabular}{' + spec + '}',
    '  ' + head + ' \\\\ \\hline',
    body,
    '\\end{tabular}',
    '',
  ].join('\n');
}

/* The derivation as an aligned chain, each step tagged with its law.
   Needs amsmath for align*. */
export function derivationTeX(lines, mode, letters, marks = null) {
  const used = new Set();
  const rows = lines.map((ln, i) => {
    const mk = marks?.[i]?.length ? new Map() : null;
    for (const m of marks?.[i] ?? []) {
      for (const path of m.paths) {
        mk.set(JSON.stringify(path), `bastep${m.step}`);
        used.add(m.step);
      }
    }
    const e = mk ? toTeXMarked(ln.expr, mode, letters, mk)
                 : toTeX(ln.expr, mode, letters);
    if (!i) return `     & ${e}`;
    const why = ln.rule ? ` && \\text{${label(ln.rule)}}` : '';
    // ={} rather than =: the empty group gives the relation a right
    // operand, so TeX puts its usual space after the sign.
    return ` ={} & ${e}${why}`;
  });
  const head = ['% Requires \\usepackage{amsmath}'];
  if (used.size) {
    head.push('% and \\usepackage{xcolor} for the step marks.',
              '% \\bastep is left redefinable: box, colour, or drop it.',
              '\\providecommand{\\bastep}[2]{{\\color{#1}\\boxed{#2}}}');
    for (const n of [...used].sort()) {
      head.push(`\\definecolor{bastep${n}}{HTML}{${STEP_HEX[n - 1]}}`);
    }
  }
  return [
    ...head,
    '\\begin{align*}',
    rows.join(' \\\\\n'),
    '\\end{align*}',
    '',
  ].join('\n');
}

/* The step palette from style.css. Repeated here because a .tex file
   leaves the page and cannot ask the stylesheet; the canvas reads the
   live custom properties instead and only falls back to these. */
const STEP_HEX = ['E0301E', 'EF7D00', '9C4BA8', 'E8639F', '00A2AD',
                  'A3691F', 'B59000'];

/* ---- png ---------------------------------------------------------- */

const PAD = 10, ROW_H = 30, HEAD_H = 34, FONT = 15;

/* Drawn on a canvas rather than rasterised from the DOM: the table is a
   grid of short strings, and going through the DOM would mean carrying
   the whole stylesheet into a foreignObject to get the same picture. */
export function tablePNG(d, scale = 2) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const face = `${FONT}px ui-sans-serif, system-ui, sans-serif`;
  ctx.font = `700 ${face}`;
  const widths = d.head.map((h, i) => {
    const w = ctx.measureText(String(h)).width;
    return Math.max(w + PAD * 2, i < d.nv ? 38 : 54);
  });
  const W = widths.reduce((a, b) => a + b, 0);
  const H = HEAD_H + d.rows.length * ROW_H;

  c.width = W * scale;
  c.height = H * scale;
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f4f7fa';
  ctx.fillRect(0, 0, W, HEAD_H);

  const x0 = [];
  let x = 0;
  for (const w of widths) { x0.push(x); x += w; }

  ctx.fillStyle = '#1f2933';
  ctx.font = `700 ${face}`;
  d.head.forEach((h, i) => {
    ctx.fillText(String(h), x0[i] + widths[i] / 2, HEAD_H / 2, widths[i] - 6);
  });

  ctx.font = face;
  d.rows.forEach((row, r) => {
    const y = HEAD_H + r * ROW_H + ROW_H / 2;
    row.forEach((v, i) => {
      const last = i === row.length - 1;
      if (last && v) {
        ctx.fillStyle = '#dbeafe';
        ctx.fillRect(x0[i], HEAD_H + r * ROW_H, widths[i], ROW_H);
      }
      ctx.fillStyle = i < d.nv ? '#6b7a8d' : '#1f2933';
      ctx.font = last ? `650 ${face}` : face;
      ctx.fillText(String(v), x0[i] + widths[i] / 2, y);
    });
  });

  ctx.strokeStyle = '#d7dee7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < widths.length; i++) {
    ctx.moveTo(x0[i] + 0.5, 0); ctx.lineTo(x0[i] + 0.5, H);
  }
  for (let r = 0; r <= d.rows.length; r++) {
    const y = HEAD_H + r * ROW_H + 0.5;
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.moveTo(0, HEAD_H + 0.5); ctx.lineTo(W, HEAD_H + 0.5);
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.stroke();
  return c;
}

/* The derivation as a picture: one line per step, the rule that
   justified it set off to the right in that step's colour, so the
   export carries the same reading order as the pane it came from.

   Drawn on a canvas for the same reason the table is -- rasterising the
   live DOM would mean dragging the stylesheet through a foreignObject
   to end up with the same handful of lines of text. */
const D_PAD = 18, D_ROW = 34, D_FONT = 18, D_RULE = 12.5, D_GAP = 40;

export function derivationPNG(lines, mode, letters, marks = null,
                              scale = 2) {
  const css = getComputedStyle(document.documentElement);
  const stepColour = (n) =>
    (css.getPropertyValue(`--step-${n}`) || '#' + STEP_HEX[n - 1]).trim();

  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const face = `${D_FONT}px ui-sans-serif, system-ui, sans-serif`;
  const ruleFace = `600 ${D_RULE}px ui-sans-serif, system-ui, sans-serif`;

  const laid = lines.map((ln) => toTextSpans(ln.expr, mode, letters));
  const body = laid.map((l) => l.text);
  const rules = lines.map((ln, i) => (i && ln.rule ? label(ln.rule) : ''));

  ctx.font = face;
  const eqW = ctx.measureText('= ').width;
  const exprW = Math.max(...body.map((t) => ctx.measureText(t).width));
  ctx.font = ruleFace;
  const ruleW = Math.max(0, ...rules.map((t) => ctx.measureText(t).width));

  const W = D_PAD * 2 + eqW + exprW + (ruleW ? D_GAP + ruleW : 0);
  const H = D_PAD * 2 + lines.length * D_ROW;
  c.width = W * scale;
  c.height = H * scale;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  lines.forEach((ln, i) => {
    const y = D_PAD + i * D_ROW + D_ROW / 2;
    ctx.textAlign = 'left';
    ctx.font = face;
    ctx.fillStyle = '#7b8794';
    if (i) ctx.fillText('=', D_PAD, y);
    ctx.fillStyle = '#1f2933';
    const x = D_PAD + eqW;
    // Boxes first: a dotted outline drawn over the glyphs would sit on
    // top of the very text it is pointing at.
    for (const m of marks?.[i] ?? []) {
      const runs = m.paths
        .map((path) => laid[i].at.get(JSON.stringify(path)))
        .filter(Boolean);
      if (!runs.length) continue;
      const a = Math.min(...runs.map((r) => r[0]));
      const b = Math.max(...runs.map((r) => r[1]));
      ctx.font = face;
      const x0 = x + ctx.measureText(body[i].slice(0, a)).width;
      const x1 = x + ctx.measureText(body[i].slice(0, b)).width;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = stepColour(m.step);
      ctx.fillStyle = stepColour(m.step) + '1f';
      const pad = 3;
      ctx.fillRect(x0 - pad, y - D_ROW / 2 + 3, x1 - x0 + pad * 2, D_ROW - 6);
      ctx.strokeRect(x0 - pad, y - D_ROW / 2 + 3, x1 - x0 + pad * 2,
                     D_ROW - 6);
      ctx.restore();
    }
    ctx.font = face;
    ctx.fillStyle = '#1f2933';
    ctx.fillText(body[i], x, y);
    if (!rules[i]) return;
    ctx.font = ruleFace;
    ctx.fillStyle = marks?.[i]?.length
      ? stepColour(((i - 1) % 7) + 1) : '#7b8794';
    ctx.textAlign = 'right';
    ctx.fillText(rules[i], W - D_PAD, y);
  });
  return c;
}

/* Properties an SVG needs carried inline: the export leaves the page,
   and with it the stylesheet that was drawing it. */
const SVG_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke',
  'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'opacity', 'font-family', 'font-size',
  'font-weight', 'text-anchor', 'dominant-baseline'];

export function inlineStyles(src, clone) {
  const a = [src, ...src.querySelectorAll('*')];
  const b = [clone, ...clone.querySelectorAll('*')];
  a.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const out = SVG_PROPS
      .map((p) => `${p}:${cs.getPropertyValue(p)}`)
      .filter((s) => !s.endsWith(':'))
      .join(';');
    if (out) b[i].setAttribute('style', out);
  });
  return clone;
}

/* Rasterise an on-page SVG. Resolves once the image has decoded, since
   a canvas drawn from an undecoded image is blank. */
export function svgPNG(src, scale = 2) {
  const box = src.viewBox.baseVal;
  const w = box && box.width ? box.width : src.clientWidth;
  const h = box && box.height ? box.height : src.clientHeight;
  const clone = inlineStyles(src, src.cloneNode(true));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', w);
  clone.setAttribute('height', h);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#fff');
  clone.insertBefore(bg, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      res(c);
    };
    img.onerror = () => rej(new Error('could not rasterise the svg'));
    img.src = url;
  });
}

export function canvasPNG(canvas, name) {
  canvas.toBlob((b) => b && save(name, b, 'image/png'), 'image/png');
}
