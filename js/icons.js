// One icon set for the whole page, drawn on a 24 px grid to match the aircraft glyph: solid
// shapes, 2 px lines with round ends where a shape has to be a line (rays, sound waves, trays).
// Every icon takes the text colour of its button (currentColor).
const S = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const L = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor"';

export const ICON = {
  plane: S(`<path ${F} d="M2 13.5l8.5-2.2L15 4h2.2l-2.6 6.6 4.9-1.3L21.3 7H23l-1.6 4.2L23 15h-1.7l-1.8-2.3-4.9 1.3L17.2 20H15l-4.5-6.3L2 15.9z"/>`),
  // times of day
  day: S(`<circle ${F} cx="12" cy="12" r="4.4"/><path ${L} d="M12 2.6v2.1M12 19.3v2.1M2.6 12h2.1M19.3 12h2.1M5.35 5.35l1.5 1.5M17.15 17.15l1.5 1.5M5.35 18.65l1.5-1.5M17.15 6.85l1.5-1.5"/>`),
  sunrise: S(`<path ${F} d="M6.6 17a5.4 5.4 0 0 1 10.8 0z"/><path ${L} d="M3 20.5h18M12 8.6v1.6M5.2 11.4l1.2 1.2M18.8 11.4l-1.2 1.2M2.8 17h1.4M19.8 17h1.4M9.6 4.6L12 2.3l2.4 2.3"/>`),
  sunset: S(`<path ${F} d="M6.6 17a5.4 5.4 0 0 1 10.8 0z"/><path ${L} d="M3 20.5h18M12 8.6v1.6M5.2 11.4l1.2 1.2M18.8 11.4l-1.2 1.2M2.8 17h1.4M19.8 17h1.4M9.6 2.4L12 4.7l2.4-2.3"/>`),
  afternoon: S(`<defs><mask id="ic-aft"><rect width="24" height="24" fill="#fff"/><path d="M9.2 22h9.4a4.6 4.6 0 0 0 .6-9.2 6.4 6.4 0 0 0-12.2 1.6A3.9 3.9 0 0 0 9.2 22z" fill="#000"/></mask></defs><g mask="url(#ic-aft)"><circle ${F} cx="8.6" cy="8.6" r="3.6"/><path ${L} d="M8.6 2.4v1.3M2.4 8.6h1.3M4.2 4.2l.95.95M13 4.2l-.95.95M4.2 13l.95-.95"/></g><path ${F} d="M9.4 20.5h9.1a3.4 3.4 0 0 0 .4-6.8 5 5 0 0 0-9.6 1.2 2.8 2.8 0 0 0 .1 5.6z"/>`),
  night: S(`<path ${F} d="M14.2 3.1a8.9 8.9 0 1 0 6.7 13.8A7.3 7.3 0 0 1 14.2 3.1z"/><path ${F} d="M18.6 3.2l.65 1.45 1.45.65-1.45.65-.65 1.45-.65-1.45-1.45-.65 1.45-.65z"/>`),
  rain: S(`<path ${F} d="M7.1 14.6h10.3a3.9 3.9 0 0 0 .5-7.8 5.7 5.7 0 0 0-10.9 1.4 3.2 3.2 0 0 0 .1 6.4z"/><path ${L} d="M8.6 17.4l-1.1 2.8M12.6 17.4l-1.1 2.8M16.6 17.4l-1.1 2.8"/>`),
  // the controls
  view: S(`<path ${F} d="M12 2.6l8.2 4.6L12 11.8 3.8 7.2z"/><path ${F} opacity=".72" d="M3.4 8.9l7.6 4.3v8.5l-7.6-4.3z"/><path ${F} opacity=".46" d="M13 13.2l7.6-4.3v8.5L13 21.7z"/>`),
  soundOn: S(`<path ${F} d="M3.6 9h3.5L12 4.8v14.4l-4.9-4.2H3.6a1.1 1.1 0 0 1-1.1-1.1v-3.8A1.1 1.1 0 0 1 3.6 9z"/><path ${L} d="M15.6 9a4.2 4.2 0 0 1 0 6M18.4 6.3a8 8 0 0 1 0 11.4"/>`),
  soundOff: S(`<path ${F} d="M3.6 9h3.5L12 4.8v14.4l-4.9-4.2H3.6a1.1 1.1 0 0 1-1.1-1.1v-3.8A1.1 1.1 0 0 1 3.6 9z"/><path ${L} d="M16 9.5l5 5M21 9.5l-5 5"/>`),
  share: S(`<path ${L} d="M12 3.4v10.8M8.2 7.1L12 3.3l3.8 3.8M8.3 10H6.6a2.1 2.1 0 0 0-2.1 2.1v6.8A2.1 2.1 0 0 0 6.6 21h10.8a2.1 2.1 0 0 0 2.1-2.1v-6.8a2.1 2.1 0 0 0-2.1-2.1h-1.7"/>`),
  camera: S(`<path ${F} fill-rule="evenodd" d="M9.3 4.4h5.4c.5 0 1 .25 1.3.7l1 1.4H19a2.6 2.6 0 0 1 2.6 2.6v8.3A2.6 2.6 0 0 1 19 20H5a2.6 2.6 0 0 1-2.6-2.6V9.1A2.6 2.6 0 0 1 5 6.5h2l1-1.4c.3-.45.8-.7 1.3-.7zM12 8.9a4.3 4.3 0 1 0 0 8.6 4.3 4.3 0 0 0 0-8.6z"/><circle ${F} cx="12" cy="13.2" r="2.4"/>`),
  vr: S(`<path ${F} fill-rule="evenodd" d="M4.6 6.8h14.8a2.6 2.6 0 0 1 2.6 2.6v6.1a2.6 2.6 0 0 1-2.6 2.6h-3.2a2 2 0 0 1-1.6-.8l-1.4-1.9a1.5 1.5 0 0 0-2.4 0l-1.4 1.9a2 2 0 0 1-1.6.8H4.6A2.6 2.6 0 0 1 2 15.5V9.4a2.6 2.6 0 0 1 2.6-2.6zM7.6 10a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6zm8.8 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z"/>`),
  back: S(`<path ${L} stroke-width="2.2" d="M14.6 5.4L8 12l6.6 6.6"/>`),
  close: S(`<path ${L} stroke-width="2.2" d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  caret: S(`<path ${L} d="M7 10l5 5 5-5"/>`),
  mail: S(`<rect ${L} x="3" y="5.2" width="18" height="13.6" rx="2.4"/><path ${L} d="M4.2 7.4l7.8 5.6 7.8-5.6"/>`),
  whatsapp: S(`<path ${F} fill-rule="evenodd" d="M12 2.2a9.7 9.7 0 0 0-8.4 14.6L2.3 21.7l5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6a2.5 2.5 0 0 0 1.7-1.2 2 2 0 0 0 .1-1.2c-.1-.1-.2-.2-.5-.3z"/>`),
};

// the time-of-day icon for the Sky button
export const TOD_ICON = { sunrise: ICON.sunrise, day: ICON.day, afternoon: ICON.afternoon, sunset: ICON.sunset, night: ICON.night, rain: ICON.rain };
