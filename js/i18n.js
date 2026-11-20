// Arabic. The interface is written in English; in Arabic every piece of visible text (and the
// labels screen readers use) is translated as it appears, from this dictionary and the patterns
// below, and the page is laid out right to left. Flight codes, seat numbers and prices stay in
// Western digits, as Saudi airlines show them. Have a native speaker check the wording.
const CITY = { Johannesburg: 'جوهانسبرغ', 'Cape Town': 'كيب تاون', Jeddah: 'جدة', Madinah: 'المدينة المنورة', Doha: 'الدوحة', Istanbul: 'إسطنبول', Dubai: 'دبي' };
const REGION = { Botswana: 'بوتسوانا', Zimbabwe: 'زيمبابوي', 'South Africa': 'جنوب أفريقيا', Mozambique: 'موزمبيق', Zambia: 'زامبيا', Tanzania: 'تنزانيا', Kenya: 'كينيا', Ethiopia: 'إثيوبيا', Sudan: 'السودان', 'South Sudan': 'جنوب السودان', 'the Red Sea': 'البحر الأحمر', 'Saudi Arabia': 'السعودية', Egypt: 'مصر', Yemen: 'اليمن', Oman: 'عُمان', Qatar: 'قطر', 'the UAE': 'الإمارات', Eritrea: 'إريتريا', Malawi: 'مالاوي', Uganda: 'أوغندا', Somalia: 'الصومال', 'Türkiye': 'تركيا', 'the Mediterranean': 'البحر المتوسط', Libya: 'ليبيا', Chad: 'تشاد', 'DR Congo': 'الكونغو الديمقراطية', Angola: 'أنغولا', Namibia: 'ناميبيا', Africa: 'أفريقيا' };
const CLS = { Economy: 'السياحية', Premium: 'السياحية المميزة', Business: 'رجال الأعمال', First: 'الأولى', 'The Residence': 'ذا ريزيدنس' };
const W = {
  ...CLS,
  'Economy class': 'الدرجة السياحية', 'Premium economy': 'السياحية المميزة', 'Business class': 'درجة رجال الأعمال', 'First class': 'الدرجة الأولى',
  'First class · 6 suites': 'الدرجة الأولى · 6 أجنحة', 'The Residence · 3 rooms': 'ذا ريزيدنس · 3 غرف',
  'Preparing your aircraft': 'نجهّز طائرتك', Flight: 'الرحلة', 'Non-stop': 'رحلة مباشرة', 'Dreams to Destinations': 'من الأحلام إلى الوجهات',
  'Your Safar begins here.': 'رحلتك مع سفر تبدأ هنا.', 'Pick a seat. See the view before you pay.': 'اختر مقعدك، وشاهد الإطلالة قبل أن تدفع.',
  'All cabins': 'كل المقصورات', Available: 'متاح', Taken: 'محجوز', Yours: 'مقعدك',
  'Hover a cabin to see prices': 'مرّر فوق مقصورة لترى الأسعار',
  'Hover a cabin for prices · drag to turn the plane': 'مرّر فوق مقصورة لترى الأسعار · اسحب لتدوير الطائرة',
  'Tap a cabin · drag to turn the plane': 'اضغط على مقصورة · اسحب لتدوير الطائرة',
  'Hover a seat · click to fly in': 'مرّر فوق مقعد · انقر لتدخل إليه', 'Tap a seat to preview, tap again to fly in': 'اضغط على مقعد لمعاينته، واضغط مرة أخرى لتدخل إليه',
  'View from seat': 'الإطلالة من المقعد', 'Step inside': 'ادخل', 'Drag to look around': 'اسحب للتلفّت حولك',
  'Drag to look around · or use the arrow keys': 'اسحب للتلفّت حولك · أو استخدم مفاتيح الأسهم',
  'Cabin map': 'خريطة المقصورة', 'Living room': 'غرفة المعيشة', Bedroom: 'غرفة النوم', Shower: 'الدُش',
  'Your living room': 'غرفة معيشتك', 'Your bedroom': 'غرفة نومك', 'Your shower': 'دُشّك', 'Living · Bedroom · Shower': 'معيشة · نوم · دُش',
  'Boarding pass': 'بطاقة صعود الطائرة', Passenger: 'المسافر', You: 'أنت', Seat: 'المقعد', Seats: 'المقاعد', Suite: 'الجناح', Gate: 'البوابة', Boards: 'الصعود',
  Held: 'محجوز', 'Held for you': 'محجوز لك', '✓ Held for you': '✓ محجوز لك', 'One per flight': 'واحد في كل رحلة',
  'Not satisfied?': 'لست راضياً؟', 'See Premium': 'شاهد السياحية المميزة', 'Want more space?': 'تريد مساحة أكبر؟', 'Upgrade to Business': 'ترقية إلى رجال الأعمال',
  'Want a suite?': 'تريد جناحاً؟', 'Upgrade to First': 'ترقية إلى الأولى', 'Want even more?': 'تريد المزيد؟',
  Sunrise: 'الشروق', Day: 'النهار', Afternoon: 'العصر', Sunset: 'الغروب', Night: 'الليل', Rain: 'المطر',
  View: 'المنظر', Sky: 'السماء', Sun: 'الشمس', Moon: 'القمر', 'Flight deck': 'قمرة القيادة', Side: 'جانبي', Front: 'أمامي', Rear: 'خلفي', Below: 'من الأسفل',
  'Or drag the plane to turn it, and pinch or scroll to zoom.': 'أو اسحب الطائرة لتدويرها، واستخدم الأصابع أو عجلة الفأرة للتكبير.',
  Aircraft: 'الطائرة', Widebody: 'عريضة البدن', 'Double-decker': 'بطابقين', 'Single-aisle': 'ممر واحد',
  'Two engines · one aisle · Economy 3-3': 'محركان · ممر واحد · السياحية 3-3',
  'Wide recliner with leg rest': 'مقعد عريض قابل للإمالة بمسند للساقين', 'Hot meal served on china': 'وجبة ساخنة على أطباق خزفية', 'Priority boarding, more legroom': 'صعود بأولوية ومساحة أكبر للساقين',
  'Two engines · one deck · Economy 3-3-3': 'محركان · طابق واحد · السياحية 3-3-3', 'Four engines · two decks · Economy 3-4-3': 'أربعة محركات · طابقان · السياحية 3-4-3',
  Cruise: 'التحليق', 'Clean wing, gear up': 'الجناح نظيف والعجلات مرفوعة', Approach: 'الاقتراب', 'Slats, flaps and gear down, landing lights on': 'الشرائح والقلابات والعجلات منزلة، وأضواء الهبوط مضاءة',
  'Fly the whole route': 'حلّق في الرحلة كاملة', 'Takeoff at night, cruise into the sunrise, land in daylight': 'إقلاع ليلاً، تحليق حتى الشروق، وهبوط في وضح النهار',
  Sound: 'الصوت', Share: 'مشاركة', 'Save image': 'حفظ الصورة', 'Upper deck': 'الطابق العلوي', 'Main deck': 'الطابق الرئيسي',
  Travellers: 'المسافرون', 'Best seats together': 'أفضل مقاعد متجاورة', 'Compare cabins': 'قارن المقصورات', 'Seat list': 'قائمة المقاعد',
  'Confirm on WhatsApp': 'أكّد عبر واتساب', 'Email instead': 'أو عبر البريد', 'Share this seat': 'شارك هذا المقعد',
  'Send it to the Safar team to confirm and pay.': 'أرسله إلى فريق سفر لتأكيد الحجز والدفع.', Skip: 'تخطٍّ', Exit: 'خروج', Done: 'تم',
  Layout: 'التوزيع', 'Seat width': 'عرض المقعد', Space: 'المساحة', Bed: 'السرير', Screen: 'الشاشة', Dining: 'الطعام', Baggage: 'الأمتعة', Lounge: 'الصالة', Extras: 'إضافات',
  Recliner: 'مقعد قابل للإمالة', 'Cradle recliner with leg rest': 'مقعد مريح بمسند للساقين', 'Lie-flat suite, direct aisle access': 'جناح يتحول إلى سرير مسطح، بممر مباشر',
  'Private suite with sliding door': 'جناح خاص بباب منزلق', 'Three rooms: living room, bedroom and shower': 'ثلاث غرف: معيشة ونوم ودُش',
  'Your own aisle': 'ممر خاص بك', 'A whole suite': 'جناح كامل', 'Living room, bedroom, shower room': 'غرفة معيشة وغرفة نوم وغرفة دُش', 'Double sofa': 'أريكة مزدوجة',
  'Double bed': 'سرير مزدوج', 'Two hot meals': 'وجبتان ساخنتان', 'Premium dining on china': 'طعام مميز على أطباق خزفية', 'À la carte, dine when you like': 'قائمة طعام، تناول متى شئت',
  "Dine on demand, chef's menu": 'طعام عند الطلب من قائمة الشيف', 'Private chef and butler': 'طاهٍ خاص وخادم شخصي', 'Safar Lounge': 'صالة سفر', 'First Lounge': 'صالة الدرجة الأولى',
  'Power and USB-C at every seat': 'كهرباء ومنفذ USB-C لكل مقعد', 'Amenity kit, noise-cancelling headphones': 'حقيبة عناية وسماعات عازلة للضوضاء', 'Mini-bar, privacy divider': 'ثلاجة صغيرة وحاجز خصوصية',
  'Chauffeur, pyjamas, amenity kit': 'سائق خاص وبيجامة وحقيبة عناية', 'Private shower, chauffeur': 'دُش خاص وسائق', 'Two 81 cm screens': 'شاشتان 81 سم',
  'See seats': 'شاهد المقاعد', 'See suites': 'شاهد الأجنحة', 'See it': 'شاهده', 'Choose your flight': 'اختر رحلتك', Date: 'التاريخ', Close: 'إغلاق',
  'Makkah & Madinah': 'مكة المكرمة والمدينة المنورة', 'Madinah first': 'المدينة المنورة أولاً', 'December escape': 'عطلة ديسمبر', Dubai: 'دبي',
  'Link to this seat copied': 'تم نسخ رابط المقعد', 'Image saved': 'تم حفظ الصورة', 'Sorry, the image could not be saved': 'عذراً، تعذّر حفظ الصورة',
  'Choose the aircraft': 'اختر الطائرة', 'Time of day and weather': 'وقت اليوم والطقس', 'Change the view': 'غيّر المنظر', 'Cabin sound': 'صوت المقصورة',
  'Save this view as an image': 'احفظ هذا المنظر كصورة', 'View in a VR headset': 'شاهد بنظارة الواقع الافتراضي', VR: 'الواقع الافتراضي', 'Beside the wing': 'بجانب الجناح', 'Your seat': 'مقعدك', 'Trigger for the next view': 'اضغط الزناد للمنظر التالي', 'VR could not start on this device': 'تعذّر تشغيل الواقع الافتراضي على هذا الجهاز', 'Change route or date': 'غيّر الرحلة أو التاريخ', 'One more traveller': 'مسافر إضافي', 'One fewer traveller': 'مسافر أقل',
  Deck: 'الطابق', Cabins: 'المقصورات', 'Seat available': 'مقعد متاح', 'Seat taken': 'مقعد محجوز',
};
const c = (s) => CITY[s] || s;
const cl = (s) => CLS[s] || s;
const dur = (s) => s.replace(/(\d+)h\s*(\d+)m/, '$1س $2د');
const PATTERNS = [
  [/^(\d+) seats left$/, (m, n) => `${n} مقعداً متاحاً`],
  [/^(\d+) suites? left$/, (m, n) => (n === '1' ? 'جناح واحد متاح' : `${n} أجنحة متاحة`)],
  [/^from (R[\d,]+)$/, (m, p) => `من ${p}`],
  [/^Seat (\w+)$/, (m, id) => `مقعد ${id}`], [/^Seats (.+)$/, (m, id) => `مقاعد ${id}`], [/^Suite (\w+)$/, (m, id) => `جناح ${id}`],
  [/^(Economy|Premium|Business|The Residence) · Row (\d+)$/, (m, k, r) => `${cl(k)} · الصف ${r}`], [/^First class · Row (\d+)$/, (m, r) => `الدرجة الأولى · الصف ${r}`],
  [/^(Economy|Premium|Business) · (\d+) together$/, (m, k, n) => `${cl(k)} · ${n} متجاورة`],
  [/^No (\d+) free seats together here$/, (m, n) => `لا توجد ${n} مقاعد متجاورة هنا`],
  [/^Book seat (\w+)$/, (m, id) => `احجز المقعد ${id}`], [/^Book Suite (\w+)$/, (m, id) => `احجز الجناح ${id}`], [/^Book (\d+) seats$/, (m, n) => `احجز ${n} مقاعد`], [/^Book The Residence$/, () => 'احجز ذا ريزيدنس'],
  [/^Seat (\w+) is held for you$/, (m, id) => `المقعد ${id} محجوز لك`], [/^Suite (\w+) is held for you$/, (m, id) => `الجناح ${id} محجوز لك`], [/^Seats (.+) are held for you$/, (m, id) => `المقاعد ${id} محجوزة لك`], [/^The Residence is held for you$/, () => 'ذا ريزيدنس محجوز لك'],
  [/^Next: (.+)$/, (m, n) => `التالي: ${W[n] || n}`], [/^Reserve (.+)$/, (m, n) => `احجز ${cl(n)}`],
  [/^Class (\d+) \/ (\d+)$/, (m, a, b) => `الدرجة ${a} / ${b}`],
  [/^Takeoff from (.+)$/, (m, x) => `الإقلاع من ${c(x)}`], [/^Cruising to (.+)$/, (m, x) => `في الطريق إلى ${c(x)}`], [/^Landing in (.+)$/, (m, x) => `الهبوط في ${c(x)}`], [/^Welcome to (.+)$/, (m, x) => `أهلاً بكم في ${c(x)}`],
  [/^Over (.+) · (\d+h \d+m) to go$/, (m, r, d) => `فوق ${REGION[r] || r} · متبقٍّ ${dur(d)}`],
  [/^Climbing · (\d+) ft$/, (m, n) => `صعود · ${n} قدم`], [/^(\d+) km\/h$/, (m, n) => `${n} كم/س`], [/^(\d+) ft · (\d+) km\/h$/, (m, a, b) => `${a} قدم · ${b} كم/س`],
  [/^Local time (.+)$/, (m, t) => `التوقيت المحلي ${t}`],
  [/^(.+) to (.+)$/, (m, a, b) => (CITY[a] && CITY[b] ? `من ${c(a)} إلى ${c(b)}` : null)],
  [/^(.+) · (\d+h \d+m) non-stop · (SAF \d+)$/, (m, l, d, n) => `${W[l] || REGION[l] || CITY[l] || l} · ${dur(d)} مباشرة · ${n}`],
  [/^Flying (.+)$/, (m, d) => `السفر في ${d}`],
  [/^Click (.+) to step inside$/, (m, n) => `انقر على ${cl(n)} لتدخل`], [/^Tap (.+) to step inside$/, (m, n) => `اضغط على ${cl(n)} لتدخل`],
  [/^(Seat|Suite) (\w+) is taken\. The blue ones are free\.$/, (m, k, id) => `${k === 'Seat' ? 'المقعد' : 'الجناح'} ${id} محجوز. المقاعد الزرقاء متاحة.`],
  [/^There aren't (\d+) free seats together there\. Try "Best seats together"\.$/, (m, n) => `لا توجد ${n} مقاعد متجاورة هناك. جرّب "أفضل مقاعد متجاورة".`],
  [/^Sorry, there aren't (\d+) free seats together in (.+)\.$/, (m, n, k) => `عذراً، لا توجد ${n} مقاعد متجاورة في ${cl(k)}.`],
  [/^Seats (.+) are free together\. Tap the tag to see the view\.$/, (m, id) => `المقاعد ${id} متاحة ومتجاورة. اضغط على البطاقة لترى الإطلالة.`],
  [/^(\d+) × ([\d,]+)$/, (m, a, b) => `${a} × ${b}`],
  [/^(\d+)h (\d+)m$/, (m, a, b) => `${a}س ${b}د`],
  [/^(\d+) cm pitch$/, (m, n) => `مسافة ${n} سم`], [/^Fully flat, (\d+) cm$/, (m, n) => `مسطح بالكامل، ${n} سم`], [/^(\d+) cm$/, (m, n) => `${n} سم`], [/^(\d+) cm \(([\d.]+)"\)$/, (m, n, inch) => `${n} سم (${inch} بوصة)`],
  [/^(\d+) × (\d+) kg$/, (m, a, b) => `${a} × ${b} كغ`], [/^(\d+) × (\d+) kg, priority$/, (m, a, b) => `${a} × ${b} كغ، أولوية`],
  [/^·\s*Non-stop$/, () => '· رحلة مباشرة'],
  [/^Non-stop · (\d+h \d+m)$/, (m, d) => `رحلة مباشرة · ${dur(d)}`],
];
export function translate(s) {
  const t = s.trim();
  if (!t) return null;
  if (W[t]) return s.replace(t, W[t]);
  for (const [re, fn] of PATTERNS) { const m = t.match(re); if (m) { const r = fn(...m); if (r) return s.replace(t, r); } }
  return null;
}

// Arabic is switched off for now: the page is English only. To bring it back, set ARABIC to
// true and put the عربي button back in the top bar (see the README).
export const ARABIC = false;
let lang = 'en';
if (ARABIC) { try { lang = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : localStorage.getItem('safar-lang') === 'ar' ? 'ar' : 'en'; } catch (e) { /* private mode */ } }
const originals = new WeakMap(), attrOrig = new WeakMap();
const ATTRS = ['aria-label', 'title'];
function doNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || p.closest('script,style,[data-no-i18n]')) return;
    const cur = n.nodeValue;
    if (originals.has(n) && originals.get(n).ar === cur) return;
    const tr = translate(cur);
    if (tr != null) { originals.set(n, { en: cur, ar: tr }); n.nodeValue = tr; }
  } else if (n.nodeType === 1) {
    for (const a of ATTRS) {
      const v = n.getAttribute(a);
      if (!v) continue;
      const rec = attrOrig.get(n) || {};
      if (rec[a] && rec[a].ar === v) continue;
      const tr = translate(v);
      if (tr != null) { rec[a] = { en: v, ar: tr }; attrOrig.set(n, rec); n.setAttribute(a, tr); }
    }
    for (const ch of n.childNodes) doNode(ch);
  }
}
let observer = null;
function apply() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-ar', lang === 'ar');
  if (lang === 'ar') {
    doNode(document.body);
    if (!observer) {
      observer = new MutationObserver((list) => {
        for (const m of list) {
          if (m.type === 'characterData') doNode(m.target);
          else if (m.type === 'attributes') doNode(m.target);
          else m.addedNodes.forEach(doNode);
        }
      });
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
  } else if (observer) {
    observer.disconnect(); observer = null;
    // put the English back
    const walk = (n) => {
      if (n.nodeType === 3) { const o = originals.get(n); if (o && n.nodeValue === o.ar) n.nodeValue = o.en; }
      else if (n.nodeType === 1) { const rec = attrOrig.get(n); if (rec) for (const a in rec) if (n.getAttribute(a) === rec[a].ar) n.setAttribute(a, rec[a].en); n.childNodes.forEach(walk); }
    };
    walk(document.body);
  }
}
export const i18n = {
  get lang() { return lang; },
  init() { apply(); },
  set(l) { lang = ARABIC ? l : 'en'; try { localStorage.setItem('safar-lang', l); } catch (e) { /* private mode */ } apply(); },
  t: (s) => (lang === 'ar' ? (translate(s) ?? s) : s),
};
