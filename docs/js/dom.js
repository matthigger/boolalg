/* Tiny DOM helpers. Enough to build the page without a framework. */

export function el(tag, attrs = {}, kids = []) {
  const n = document.createElement(tag);
  apply(n, attrs);
  add(n, kids);
  return n;
}

const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.setAttribute('class', v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  add(n, kids);
  return n;
}

function apply(n, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'data') Object.assign(n.dataset, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') n[k] = v;
    else n.setAttribute(k, v);
  }
}

function add(n, kids) {
  for (const k of [].concat(kids)) {
    if (k == null || k === false) continue;
    n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
}

export const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
