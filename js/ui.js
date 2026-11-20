import { CONFIG, CLASS_ORDER, money, priceText } from './config.js';
import { hashStr, mulberry32 } from './geo.js';

const gsap = window.gsap;
const $ = (s, r = document) => r.querySelector(s);

export function createUI() {
  const F = CONFIG.flight;
  const body = document.body;

  // ---- static copy ----
  document.querySelectorAll('[data-flight-no]').forEach((e) => (e.textContent = F.number));
  $('[data-from-code]').textContent = F.from.code;
  $('[data-to-code]').textContent = F.to.code;
  $('[data-date]').textContent = F.date;
  $('[data-duration]').textContent = F.duration;
  const sub = $('[data-brand-sub]');
  if (sub && CONFIG.brand.sub) sub.textContent = CONFIG.brand.sub;
  const tagline = $('[data-tagline]');
  if (tagline) tagline.textContent = CONFIG.brand.tagline || '';
  $('[data-credit]').textContent = CONFIG.brand.credit || '';
  $('.room-brand').textContent = CONFIG.classes.residence.name;
  document.title = `${CONFIG.brand.name} · ${F.from.code} → ${F.to.code} · Choose your seat`;

  // ---- loader ----
  const loader = $('#loader');
  const loaderBar = $('.loader-bar i');
  const setLoader = (p) => { loaderBar.style.width = `${Math.round(p * 100)}%`; };
  const hideLoader = () => loader.classList.add('done');

  // ---- hint + pills ----
  const hintEl = $('#hint');
  const hint = (t) => { hintEl.textContent = t; };
  const pillsEl = $('#cabins');
  const pills = {};
  function buildPills({ onPick, onHover }) {
    pillsEl.innerHTML = '';
    for (const cls of CLASS_ORDER) {
      const c = CONFIG.classes[cls];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cabin-pill';
      b.innerHTML = `<b>${c.name}</b><small>from ${priceText(c.price)}</small>`;
      b.addEventListener('click', () => onPick(cls));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') onHover(cls); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') onHover(null); });
      pillsEl.appendChild(b);
      pills[cls] = b;
    }
  }
  pillsEl.addEventListener('scroll', () => {
    pillsEl.classList.toggle('at-end', pillsEl.scrollLeft + pillsEl.clientWidth >= pillsEl.scrollWidth - 4);
  }, { passive: true });
  const setActivePill = (cls) => {
    for (const k in pills) pills[k].classList.toggle('is-active', k === cls);
    const b = cls && pills[cls];
    if (b && pillsEl.scrollWidth > pillsEl.clientWidth) {
      pillsEl.scrollTo({ left: b.offsetLeft - (pillsEl.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
  };
  const pillHover = (cls) => { for (const k in pills) pills[k].classList.toggle('is-hover', k === cls); };

  // ---- floating tag ----
  const tag = $('#tag');
  const tagEls = {
    kicker: $('.tag-kicker', tag), title: $('.tag-title', tag), status: $('.tag-status', tag),
    cur: $('.tag-cur', tag), price: $('.tag-price', tag), go: $('.tag-go', tag),
  };
  let tagSize = { w: 0, h: 0 };
  let tagKey = '';
  function setTag({ key, kicker, title, status, statusKind = 'free', price, go = false, goLabel }) {
    if (key === tagKey && tag.classList.contains('show')) return;
    tagKey = key;
    tagEls.kicker.textContent = kicker;
    tagEls.title.textContent = title;
    tagEls.status.textContent = status;
    tagEls.status.className = `tag-status${statusKind === 'booked' ? ' is-booked' : statusKind === 'yours' ? ' is-yours' : ''}`;
    tagEls.cur.textContent = F.currency;
    tagEls.price.textContent = money(price);
    tag.classList.toggle('has-go', !!go);
    if (goLabel) tagEls.go.innerHTML = `${goLabel} <span aria-hidden="true">→</span>`;
    tag.classList.add('show');
    tagSize = { w: tag.offsetWidth, h: tag.offsetHeight };
  }
  function showClassTag(cls, free) {
    const c = CONFIG.classes[cls];
    const status = cls === 'residence' ? c.tagline : cls === 'first' ? `${free} suite${free === 1 ? '' : 's'} left` : `${free} seats left`;
    setTag({ key: `c:${cls}:${free}`, kicker: c.kicker, title: c.name, status, statusKind: free > 0 ? 'free' : 'booked', price: c.price });
  }
  function showSeatTag(seat, { go = false } = {}) {
    const c = CONFIG.classes[seat.cls];
    let title, kicker;
    if (seat.cls === 'residence') { title = c.name; kicker = 'Living · Bedroom · Shower'; }
    else if (seat.cls === 'first') { title = `Suite ${seat.id}`; kicker = `First class · Row ${seat.row}`; }
    else { title = `Seat ${seat.id}`; kicker = `${c.name} · Row ${seat.row}`; }
    const kind = seat.yours ? 'yours' : seat.booked ? 'booked' : 'free';
    const status = seat.yours ? 'Yours' : seat.booked ? 'Taken' : seat.cls === 'residence' ? c.tagline : 'Available';
    setTag({
      key: `s:${seat.id}:${kind}:${go}`, kicker, title, status, statusKind: kind, price: c.price,
      go: go && !(seat.booked && !seat.yours), goLabel: seat.cls === 'residence' ? 'Step inside' : 'View from seat',
    });
  }
  function hideTag() { tag.classList.remove('show', 'has-go'); tagKey = ''; }
  function placeTag(x, y) {
    const w = tagSize.w, h = tagSize.h;
    const left = Math.max(10, Math.min(innerWidth - w - 10, x - w / 2));
    const top = Math.max(10, y - h - 16);
    tag.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }
  function shakeTag() { tag.classList.remove('shake'); void tag.offsetWidth; tag.classList.add('shake'); }

  // ---- toast ----
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  // ---- seat view (the live 3D cabin shows through; this layer only holds the ticket and buttons) ----
  const sceneEl = $('#scene');

  // ---- boarding pass ----
  const pass = $('#pass');
  const P = {};
  pass.querySelectorAll('[data-p]').forEach((e) => { P[e.dataset.p] = e; });
  function barcode(seed) {
    const rng = mulberry32(hashStr(seed));
    let html = '';
    for (let i = 0; i < 44; i++) {
      const w = rng() < 0.35 ? 3 : rng() < 0.5 ? 2 : 1;
      html += `<i style="width:${w}px;opacity:${rng() < 0.08 ? 0 : 1}"></i>`;
    }
    return html;
  }
  function fillPass(cls, seat) {
    const c = CONFIG.classes[cls];
    pass.className = `pass theme-${c.theme}`;
    sceneEl.dataset.theme = c.theme;
    const sid = cls === 'residence' ? 'RES' : seat.id;
    P.classLabel.textContent = c.name;
    P.fromCode.textContent = F.from.code; P.fromCity.textContent = F.from.city; P.fromTime.textContent = F.from.time;
    P.toCode.textContent = F.to.code; P.toCity.textContent = F.to.city; P.toTime.textContent = F.to.time;
    P.duration.textContent = `${F.stops} · ${F.duration}`;
    P.passenger.textContent = F.passenger;
    P.seatWord.textContent = c.seatWord; P.seatWord2.textContent = c.seatWord;
    P.seat.textContent = sid; P.seatBig.textContent = sid;
    P.gate.textContent = c.gate; P.boards.textContent = c.boards;
    P.flight.textContent = F.number;
    P.currency.textContent = F.currency; P.price.textContent = money(c.price);
    P.barcode.innerHTML = barcode(`${F.number}-${sid}`);
    let status = 'Available';
    if (seat && seat.yours) status = 'Confirmed';
    else if (cls === 'first') { const n = Math.max(1, c.available); status = `${n} suite${n === 1 ? '' : 's'} left`; }
    else if (cls === 'residence') status = c.tagline;
    P.status.textContent = status;
    pass.classList.toggle('is-booked', !!(seat && seat.yours));
  }

  // ---- title card ----
  const tc = $('#titlecard');
  const tcK = $('#tcKicker'), tcT = $('#tcTitle'), tcS = $('#tcSub');
  function titleCard({ kicker, title, sub = '', gold = false, hold = 1.0 }) {
    tcK.textContent = kicker; tcT.textContent = title; tcS.textContent = sub;
    tc.classList.toggle('lux', gold);
    return new Promise((res) => {
      const tl = gsap.timeline({ onComplete: res });
      tl.set(tc, { opacity: 1 });
      tl.fromTo([tcK, tcT, tcS], { y: 28, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out', stagger: 0.08 });
      tl.to([tcK, tcT, tcS], { y: -18, opacity: 0, filter: 'blur(6px)', duration: 0.6, ease: 'power2.in', stagger: 0.04 }, `+=${hold}`);
      tl.set(tc, { opacity: 0 });
    });
  }

  return {
    body, setLoader, hideLoader, hint, buildPills, setActivePill, pillHover,
    showClassTag, showSeatTag, hideTag, placeTag, shakeTag, tag, tagGo: tagEls.go,
    toast, sceneEl,
    pass, fillPass, titleCard,
    els: {
      btnAll: $('#btnAllCabins'), legend: $('#legend'), btnSceneBack: $('#btnSceneBack'),
      sceneUi: $('#sceneUi'), actions: $('#actions'), btnBook: $('#btnBook'), upsellLabel: $('#upsellLabel'), btnUpsell: $('#btnUpsell'),
      roomNav: $('#roomNav'), roomName: $('#roomName'), roomTabs: $('#roomTabs'), roomBar: $('#roomBar'), roomBarLabel: $('#roomBarLabel'), btnRoomNext: $('#btnRoomNext'),
      shade: sceneEl.querySelector('.scene-shade'), lookHint: $('#lookHint'),
    },
  };
}
