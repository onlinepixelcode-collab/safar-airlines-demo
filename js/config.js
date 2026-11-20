// Everything you are likely to edit lives here: copy, prices and flight details.
// The view from every seat and room is the live 3D cabin (js/cabin.js), not a photo.

export const CONFIG = {
  brand: {
    name: 'Safar Airlines',
    sub: 'AIRLINES',                          // spaced line under the SAFAR wordmark
    tagline: 'Dreams to Destinations',        // from safartravelagency.com
    credit: 'Concept · Pixel Code',
    // logo artwork lives in assets/brand/ (safar-wordmark.png, favicon.png)
    colors: {
      primary: '#16aed4',   // Safar blue, sampled from the logo
      deep: '#0b6f8f',
      hover: '#a6ecff',     // hovered seat (bright, reads against navy and white seats)
      fin: '#0e8fb5',       // slightly deeper blue for the fin and engine shading
      ink: '#0d0f12',       // logo black
    },
  },

  // where "Book" hands over: Safar's WhatsApp and email (from safartravelagency.com)
  contact: {
    whatsapp: '27645246004',
    email: 'info@safartravelagency.com',
  },
  // the address the demo is published at, used for "share this seat" links. Leave it empty to
  // use the page's own address (right once it is uploaded, e.g. to demo.pixelcode.co.za/safar)
  site: { url: '' },

  flight: {
    number: 'SAF 001',
    date: 'Wed 10 Feb',
    from: { code: 'JNB', city: 'Johannesburg', time: '21:40' },
    to: { code: 'JED', city: 'Jeddah', time: '06:45' },
    duration: '8h 05m',
    stops: 'Non-stop',
    passenger: 'You',
    currency: 'ZAR',
    symbol: 'R',
  },

  // 'day' matches the reference reel. 'sunset' is also built in. Override with ?tod=sunset
  timeOfDay: 'day',

  classes: {
    economy: {
      name: 'Economy',
      kicker: 'Economy class',
      price: 9450,
      available: 58,
      featured: '32A',
      gate: 'A12',
      boards: '20:55',
      theme: 'safar',
      seatWord: 'Seat',
      upsell: { label: 'Not satisfied?', cta: 'See Premium', to: 'premium' },
    },
    premium: {
      name: 'Premium',
      kicker: 'Premium economy',
      price: 18900,
      available: 17,
      featured: '12A',
      gate: 'A12',
      boards: '20:50',
      theme: 'safar',
      seatWord: 'Seat',
      upsell: { label: 'Want more space?', cta: 'Upgrade to Business', to: 'business' },
    },
    business: {
      name: 'Business',
      kicker: 'Business class',
      price: 46500,
      available: 7,
      featured: '5A',
      gate: 'A12',
      boards: '20:40',
      theme: 'graphite',
      seatWord: 'Seat',
      upsell: { label: 'Want a suite?', cta: 'Upgrade to First', to: 'first' },
    },
    first: {
      name: 'First',
      kicker: 'First class · 6 suites',
      price: 89000,
      available: 2,
      featured: '2A',
      gate: 'A10',
      boards: '20:30',
      theme: 'ink',
      seatWord: 'Suite',
      upsell: { label: 'Want even more?', cta: 'The Residence', to: 'residence' },
    },
    residence: {
      name: 'The Residence',
      kicker: 'The Residence · 3 rooms',
      price: 215000,
      available: 1,
      gate: 'A10',
      boards: '20:20',
      theme: 'noir',
      seatWord: 'Suite',
      tagline: 'One per flight',
      rooms: [
        { id: 'living', name: 'Living room', label: 'Your living room' },
        { id: 'bedroom', name: 'Bedroom', label: 'Your bedroom' },
        { id: 'shower', name: 'Shower', label: 'Your shower' },
      ],
    },
  },
};

// the single-aisle jet has two cabins: Business (2-2) and Economy (3-3)
const PLANE_NOW = (() => { try { const q = new URLSearchParams(location.search).get('plane'); return q || localStorage.getItem('safar-plane') || 'twin'; } catch (e) { return 'twin'; } })();
export const CLASS_ORDER = PLANE_NOW === 'narrow' ? ['economy', 'business'] : ['economy', 'premium', 'business', 'first', 'residence'];
if (PLANE_NOW === 'narrow') {
  CONFIG.classes.economy.upsell = { label: 'Want more space?', cta: 'Upgrade to Business', to: 'business' };
  CONFIG.classes.business.upsell = null;
  CONFIG.classes.business.kicker = 'Business class';
  CONFIG.classes.business.price = 24500;
  CONFIG.classes.economy.featured = '12A';
  CONFIG.classes.business.featured = '2A';
}

export function money(n) {
  return n.toLocaleString('en-US');
}
// price with the currency symbol, e.g. R9,450
export function priceText(n) {
  return `${CONFIG.flight.symbol || ''}${money(n)}`;
}

// ---------------------------------------------------------------- routes and dates
// Safar's routes (from the packages on safartravelagency.com). Times are local; the flight time
// is block time. `factor` scales every cabin's price. `ll` is [longitude, latitude] for the
// moving map on the seat screens. Edit, add or remove routes freely.
export const ROUTES = [
  { key: 'jnb-jed', number: 'SAF 001', from: { code: 'JNB', city: 'Johannesburg', time: '21:40', ll: [28.24, -26.13] }, to: { code: 'JED', city: 'Jeddah', time: '06:45', ll: [39.17, 21.68] },
    duration: '8h 05m', mins: 485, label: 'Makkah & Madinah', dates: ['Wed 10 Feb 2027', 'Wed 24 Mar 2027', 'Wed 13 Jan 2027'], factor: 1 },
  { key: 'jnb-med', number: 'SAF 003', from: { code: 'JNB', city: 'Johannesburg', time: '22:10', ll: [28.24, -26.13] }, to: { code: 'MED', city: 'Madinah', time: '07:30', ll: [39.70, 24.55] },
    duration: '8h 20m', mins: 500, label: 'Madinah first', dates: ['Thu 11 Feb 2027', 'Thu 25 Mar 2027'], factor: 1.04 },
  { key: 'jnb-doh', number: 'SAF 101', from: { code: 'JNB', city: 'Johannesburg', time: '20:15', ll: [28.24, -26.13] }, to: { code: 'DOH', city: 'Doha', time: '05:30', ll: [51.61, 25.27] },
    duration: '8h 15m', mins: 495, label: 'December escape', dates: ['Mon 21 Dec 2026', 'Tue 22 Dec 2026'], factor: 0.92 },
  { key: 'jnb-ist', number: 'SAF 201', from: { code: 'JNB', city: 'Johannesburg', time: '19:40', ll: [28.24, -26.13] }, to: { code: 'IST', city: 'Istanbul', time: '06:55', ll: [28.75, 41.26] },
    duration: '10h 15m', mins: 615, label: 'Türkiye', dates: ['Tue 22 Dec 2026', 'Sat 3 Apr 2027'], factor: 1.12 },
  { key: 'jnb-dxb', number: 'SAF 301', from: { code: 'JNB', city: 'Johannesburg', time: '18:45', ll: [28.24, -26.13] }, to: { code: 'DXB', city: 'Dubai', time: '04:45', ll: [55.36, 25.25] },
    duration: '8h 00m', mins: 480, label: 'Dubai', dates: ['Fri 18 Dec 2026', 'Fri 5 Feb 2027'], factor: 0.95 },
  { key: 'cpt-jed', number: 'SAF 011', from: { code: 'CPT', city: 'Cape Town', time: '20:30', ll: [18.60, -33.97] }, to: { code: 'JED', city: 'Jeddah', time: '07:05', ll: [39.17, 21.68] },
    duration: '9h 35m', mins: 575, label: 'Makkah & Madinah', dates: ['Wed 10 Feb 2027', 'Wed 24 Mar 2027'], factor: 1.08 },
];
const pick = (key, list, fallback) => {
  try {
    const q = new URLSearchParams(location.search).get(key);
    if (q && list(q)) return q;
    const s = localStorage.getItem(`safar-${key}`);
    if (s && list(s)) return s;
  } catch (e) { /* private mode */ }
  return fallback;
};
export const ROUTE = ROUTES.find((r) => r.key === pick('route', (k) => ROUTES.some((r) => r.key === k), 'jnb-jed'));
{
  const date = pick('date', (d) => ROUTE.dates.includes(d), ROUTE.dates[0]);
  Object.assign(CONFIG.flight, { number: ROUTE.number, from: { ...ROUTE.from }, to: { ...ROUTE.to }, duration: ROUTE.duration, date: date.replace(/ \d{4}$/, '') });
  CONFIG.flight.fullDate = date;
  for (const k of CLASS_ORDER) {
    const c = CONFIG.classes[k];
    c.basePrice = c.basePrice || c.price;
    c.price = Math.round((c.basePrice * ROUTE.factor) / 50) * 50;
  }
}

// ---------------------------------------------------------------- comparing the cabins
// One line per row of the comparison table. `layout` depends on the aircraft.
export const SPECS = {
  rows: [
    ['seat', 'Seat'], ['layout', 'Layout'], ['width', 'Seat width'], ['space', 'Space'], ['bed', 'Bed'],
    ['screen', 'Screen'], ['dining', 'Dining'], ['bags', 'Baggage'], ['lounge', 'Lounge'], ['extras', 'Extras'],
  ],
  economy: { seat: 'Recliner', layout: { twin: '3-3-3', dd: '3-4-3', narrow: '3-3' }, width: '46 cm', space: '81 cm pitch', bed: '—', screen: '33 cm (13")', dining: 'Two hot meals', bags: '2 × 23 kg', lounge: '—', extras: 'Power and USB-C at every seat' },
  premium: { seat: 'Cradle recliner with leg rest', layout: { twin: '2-4-2', dd: '2-4-2', narrow: '2-2' }, width: '50 cm', space: '97 cm pitch', bed: '—', screen: '40 cm (15.6")', dining: 'Premium dining on china', bags: '2 × 23 kg, priority', lounge: '—', extras: 'Amenity kit, noise-cancelling headphones' },
  business: { seat: 'Lie-flat suite, direct aisle access', layout: { twin: '1-2-1', dd: '1-2-1', narrow: '2-2' }, width: '56 cm', space: 'Your own aisle', bed: 'Fully flat, 200 cm', screen: '46 cm (18")', dining: 'À la carte, dine when you like', bags: '2 × 32 kg', lounge: 'Safar Lounge', extras: 'Mini-bar, privacy divider' },
  first: { seat: 'Private suite with sliding door', layout: { twin: '1-1-1', dd: '1-1-1', narrow: '—' }, width: '76 cm', space: 'A whole suite', bed: 'Fully flat, 210 cm', screen: '81 cm (32")', dining: "Dine on demand, chef's menu", bags: '3 × 32 kg', lounge: 'First Lounge', extras: 'Chauffeur, pyjamas, amenity kit' },
  residence: { seat: 'Three rooms: living room, bedroom and shower', layout: { twin: 'One per flight', dd: 'One per flight', narrow: '—' }, width: 'Double sofa', space: 'Living room, bedroom, shower room', bed: 'Double bed', screen: 'Two 81 cm screens', dining: 'Private chef and butler', bags: '3 × 32 kg', lounge: 'First Lounge', extras: 'Private shower, chauffeur' },
};
// the single-aisle jet's Business is a wide recliner, not a lie-flat suite
if (PLANE_NOW === 'narrow') Object.assign(SPECS.business, { seat: 'Wide recliner with leg rest', width: '53 cm', space: '102 cm pitch', bed: '—', screen: '33 cm (13")', dining: 'Hot meal served on china', extras: 'Priority boarding, more legroom' });
