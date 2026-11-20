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

export const CLASS_ORDER = ['economy', 'premium', 'business', 'first', 'residence'];

export function money(n) {
  return n.toLocaleString('en-US');
}
// price with the currency symbol, e.g. R9,450
export function priceText(n) {
  return `${CONFIG.flight.symbol || ''}${money(n)}`;
}
