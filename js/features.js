// Panels that sit over the 3D scene: comparing the cabins, and choosing the route and date.
import { ICON } from './icons.js';
import { CONFIG, CLASS_ORDER, ROUTES, ROUTE, SPECS, priceText } from './config.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// a modal sheet with a close button; Escape and the backdrop close it too
export function sheet(id, title) {
  const back = el('div', 'sheet-back');
  back.id = id;
  back.hidden = true;
  const card = el('div', 'sheet');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', title);
  const head = el('div', 'sheet-head', `<b>${title}</b>`);
  const close = el('button', 'sheet-close', ICON.close);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  head.appendChild(close);
  const body = el('div', 'sheet-body');
  card.append(head, body);
  back.appendChild(card);
  document.body.appendChild(back);
  const hide = () => { back.hidden = true; };
  const show = () => { back.hidden = false; close.focus({ preventScroll: true }); };
  close.addEventListener('click', hide);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) hide(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !back.hidden) hide(); });
  for (const t of ['pointerdown', 'pointerup', 'click', 'wheel']) card.addEventListener(t, (e) => e.stopPropagation());
  return { back, body, show, hide, get open() { return !back.hidden; } };
}

// Compare cabins: seat, layout, width, space, bed, screen, dining, baggage, lounge and price,
// side by side, with a button to go and see each cabin
export function createCompare({ plane, current, onPick }) {
  const s = sheet('compare', 'Compare cabins');
  function render() {
    const cur = current();
    const cols = CLASS_ORDER.filter((k) => SPECS[k] && (SPECS[k].layout[plane] || '—') !== '—');
    // wide enough for each cabin's column; a phone scrolls sideways only when there are many
    let html = `<div class="cmp-wrap"><table class="cmp" style="min-width:${100 + cols.length * 112}px"><thead><tr><th></th>`;
    for (const k of cols) {
      const c = CONFIG.classes[k];
      html += `<th class="${k === cur ? 'is-cur' : ''}"><b>${c.name}</b><small>from ${priceText(c.price)}</small></th>`;
    }
    html += '</tr></thead><tbody>';
    for (const [key, label] of SPECS.rows) {
      html += `<tr><th scope="row">${label}</th>`;
      for (const k of cols) {
        const v = key === 'layout' ? SPECS[k].layout[plane] : SPECS[k][key];
        html += `<td class="${k === cur ? 'is-cur' : ''}">${v}</td>`;
      }
      html += '</tr>';
    }
    html += '<tr class="cmp-go"><th></th>';
    for (const k of cols) html += `<td class="${k === cur ? 'is-cur' : ''}"><button type="button" class="btn btn-ghost" data-cls="${k}">See ${k === 'residence' ? 'it' : k === 'first' ? 'suites' : 'seats'}</button></td>`;
    html += '</tr></tbody></table></div>';
    s.body.innerHTML = html;
    s.body.querySelectorAll('[data-cls]').forEach((b) => b.addEventListener('click', () => { s.hide(); onPick(b.dataset.cls); }));
  }
  return { show() { render(); s.show(); }, hide: s.hide };
}

// Route and date: the route chip in the top bar opens a list of Safar's routes and their dates.
// A new route reloads the page into it (prices change with it); a new date updates in place.
export function createRoutePicker({ onRoute, onDate }) {
  const chip = document.querySelector('.route-chip');
  chip.setAttribute('role', 'button');
  chip.setAttribute('tabindex', '0');
  chip.setAttribute('aria-label', 'Change route or date');
  chip.classList.add('is-picker');
  chip.insertAdjacentHTML('beforeend', ICON.caret.replace('<svg ', '<svg class="route-caret" '));
  const s = sheet('routes', 'Choose your flight');
  function render() {
    let html = '<div class="rt-list">';
    for (const r of ROUTES) {
      const cur = r.key === ROUTE.key;
      const from = Math.round((CONFIG.classes.economy.basePrice || CONFIG.classes.economy.price) * r.factor / 50) * 50;
      html += `<button type="button" class="rt-opt${cur ? ' is-cur' : ''}" data-route="${r.key}">
        <span class="rt-codes"><b>${r.from.code}</b><i>→</i><b>${r.to.code}</b></span>
        <span class="rt-mid"><b>${r.from.city} to ${r.to.city}</b><small>${r.label} · ${r.duration} non-stop · ${r.number}</small></span>
        <span class="rt-price"><small>from</small> ${priceText(from)}</span></button>`;
    }
    html += '</div><div class="rt-dates-title">Date</div><div class="rt-dates">';
    for (const d of ROUTE.dates) html += `<button type="button" class="rt-date${d === CONFIG.flight.fullDate ? ' is-cur' : ''}" data-date="${d}">${d}</button>`;
    html += '</div>';
    s.body.innerHTML = html;
    s.body.querySelectorAll('[data-route]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.route !== ROUTE.key) onRoute(b.dataset.route); else s.hide(); }));
    s.body.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => { onDate(b.dataset.date); render(); }));
  }
  const open = (e) => { if (e) e.stopPropagation(); render(); s.show(); };
  chip.addEventListener('click', open);
  chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  for (const t of ['pointerdown', 'pointerup']) chip.addEventListener(t, (e) => e.stopPropagation());
  return { hide: s.hide };
}
