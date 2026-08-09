// Small DOM + formatting helpers shared by all views.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

// replaceChildren coerces arrays/null into text nodes — flatten and drop
// empties so views can pass conditional sections naturally.
export function mount(root, ...children) {
  root.replaceChildren(...children.flat(Infinity)
    .filter(c => c !== null && c !== undefined && c !== false));
}

// Top bar state: page title (where am I), back button (how do I leave),
// and the brand leaf on the home screen.
export function setHeader({ title, back = null, brand = false }) {
  document.getElementById('page-title-text').textContent = title;
  // toggleAttribute, not .hidden — SVG elements lack the hidden property
  document.getElementById('title-leaf').toggleAttribute('hidden', !brand);
  const backBtn = document.getElementById('back-btn');
  if (back) {
    backBtn.hidden = false;
    backBtn.setAttribute('href', back);
  } else {
    backBtn.hidden = true;
  }
  document.title = brand ? 'PlantDaddy · Field Journal' : `${title} · PlantDaddy`;
}

export function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

const DAY = 24 * 60 * 60 * 1000;

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function daysAgo(ts, now = Date.now()) {
  const d = Math.floor((now - ts) / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
}

export function healthChip(status) {
  const labels = { healthy: 'Healthy', watch: 'Watch', attention: 'Attention' };
  return el('span', { class: `chip ${status}` }, labels[status] || status);
}

export function dueBadge(water) {
  if (water.state === 'overdue') {
    const late = Math.floor((Date.now() - water.lateTs) / DAY);
    return el('span', { class: 'due-badge overdue' }, `water overdue ${late === 0 ? 'today' : `by ${late}d`}`);
  }
  if (water.state === 'due') return el('span', { class: 'due-badge due' }, 'water due now');
  const inDays = water.dueInDays;
  return el('span', { class: 'due-badge ok' }, inDays <= 0 ? 'water soon' : `water in ${inDays}d`);
}

export function confirmDialog(message) {
  return Promise.resolve(window.confirm(message));
}
