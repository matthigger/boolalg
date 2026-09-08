/* The light/dark switch: which of the two palettes in style.css is in
   force (SPEC.md section 3.2).

   Three-valued on purpose. 'light' or 'dark' is a choice the reader
   made and is remembered; no stored value means follow the system,
   which is what a first visit does. The head of index.html applies the
   same rule inline before first paint, so the page never flashes the
   wrong palette -- KEY is repeated there, and the two must stay in
   step. */

const KEY = 'ba-theme';

/* localStorage throws on a file:// copy in some browsers, and that copy
   has to keep working, so a failure here just means the choice is not
   remembered. */
function read() {
  try { return localStorage.getItem(KEY); } catch (_) { return null; }
}
function write(theme) {
  try { localStorage.setItem(KEY, theme); } catch (_) { /* not kept */ }
}

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');

/* The theme in force: the stored choice if there is one, else the
   system's. */
export function current() {
  const v = read();
  if (v === 'dark' || v === 'light') return v;
  return darkQuery()?.matches ? 'dark' : 'light';
}

export function apply(theme) {
  document.documentElement.dataset.theme = theme;
  const b = document.getElementById('themeToggle');
  if (b) b.setAttribute('aria-pressed', String(theme === 'dark'));
  return theme;
}

/* Flips what is on screen rather than what is stored: the button is a
   response to the page the reader is looking at, and the two can only
   differ if apply() was called without a choice being made. */
export function toggle() {
  const next = document.documentElement.dataset.theme === 'dark'
    ? 'light' : 'dark';
  write(next);
  return apply(next);
}

/* Set the theme and wire the button. */
export function init() {
  apply(current());
  const b = document.getElementById('themeToggle');
  if (b) b.onclick = () => toggle();
  // Until the reader overrides it the system stays in charge, so a
  // laptop that goes dark at sunset takes the page with it.
  darkQuery()?.addEventListener?.('change', () => {
    if (!read()) apply(current());
  });
}
