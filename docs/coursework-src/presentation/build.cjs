// Презентація для захисту курсової SMART RESTAURANT (≈ 7 хв доповіді).
// node docs/coursework-src/presentation/build.cjs [вихідний.pptx]  (потрібні pptxgenjs, react-icons, react, react-dom, sharp)
const path = require('path');
const pptxgen = require('pptxgenjs');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const lu = require('react-icons/lu');
// applyTheme записує кольори теми в .pptx (pptxgenjs цього не вміє); шлях задається змінною APPLY_THEME
const { applyTheme } = process.env.APPLY_THEME ? require(process.env.APPLY_THEME) : { applyTheme: null };

const REPO = path.resolve(__dirname, '../../..');
const OUT = process.argv[2] || path.join(REPO, 'docs/Presentation_SMART_RESTAURANT.pptx');
const D = (f) => path.join(REPO, 'docs/diagrams', f);
const S = (f) => path.join(REPO, 'docs/screenshots', f);

const THEME = {
  name: 'Smart Restaurant',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '16130F', // фон (теплий чорний, як у застосунку)
    lt1: 'FFFFFF',
    dk2: '24201A', // картки
    lt2: 'E9E1D2', // вторинний текст
    accent1: 'D9A74A', // золото — головний акцент
    accent2: '6CC08F', // успіх
    accent3: '7FA9E8', // зал / Web
    accent4: 'B39AE3', // доставка
    accent5: 'E98B6D', // проблеми, помилки
    accent6: 'A39A8B', // приглушений текст
    hlink: 'D9A74A',
    folHlink: 'B39AE3',
  },
};
const HEX = THEME.colors;

async function icon(name, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(lu[name], { color: '#' + color, size: String(size) }));
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  return 'image/png;base64,' + buf.toString('base64');
}
async function dims(file) {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
}

(async () => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.title = 'SMART RESTAURANT — захист курсової роботи';
  pres.subject = 'Курсова робота «Інтернет-проєкт», 2026';
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  // ───────── макети ─────────
  pres.defineSlideMaster({
    title: 'TITLE_DARK',
    background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.7, y: 1.55, w: 6.6, h: 1.3, fontSize: 48, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', x: 0.7, y: 3.0, w: 6.4, h: 1.6, fontSize: 20, color: C.background2, valign: 'top', margin: 0 }, text: '' } },
    ],
  });
  pres.defineSlideMaster({
    title: 'CONTENT',
    background: { color: C.text1 },
    margin: [0.5, 0.6, 0.6, 0.6],
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.35, w: 12.1, h: 0.85, fontSize: 30, bold: true, color: C.background1, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
      { text: { text: 'SMART RESTAURANT · курсова робота «Інтернет-проєкт» · 2026', options: { x: 0.6, y: 6.98, w: 8, h: 0.3, fontSize: 10, color: C.accent6, margin: 0 } } },
    ],
    slideNumber: { x: 12.2, y: 6.98, w: 0.5, h: 0.3, fontSize: 10, color: C.accent6, align: 'right' },
  });

  const card = (slide, x, y, w, h, name, fill = C.text2) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: fill }, line: { type: 'none' }, objectName: name });
  const whiteCard = (slide, x, y, w, h, name) =>
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.1, fill: { color: 'FFFFFF' }, line: { type: 'none' }, objectName: name });
  async function picture(slide, file, box, name, pad = 0.12, white = true) {
    const d = await dims(file);
    const bw = box.w - 2 * pad, bh = box.h - 2 * pad;
    const k = Math.min(bw / d.w, bh / d.h);
    const w = d.w * k, h = d.h * k;
    if (white) whiteCard(slide, box.x, box.y, box.w, box.h, name + ' — підкладка');
    slide.addImage({ path: file, x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h, objectName: name, altText: name });
  }
  async function iconCircle(slide, x, y, d, name, color, fill, objectName) {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' }, objectName: objectName + ' — коло' });
    const s = d * 0.52;
    slide.addImage({ data: await icon(name, color), x: x + (d - s) / 2, y: y + (d - s) / 2, w: s, h: s, objectName });
  }
  const text = (slide, t, o) => slide.addText(t, { isTextBox: true, margin: 0, fontFace: THEME.bodyFontFace, color: C.background1, ...o });

  // ───────── 1. Титул ─────────
  pres.addSection({ title: 'Вступ' });
  let s = pres.addSlide({ masterName: 'TITLE_DARK', sectionTitle: 'Вступ' });
  s.addText('SMART RESTAURANT', { placeholder: 'title' });
  s.addText('Інформаційна система ресторану з онлайн-бронюванням, QR check-in, замовленням зі смартфона, оплатою та доставкою', { placeholder: 'body' });
  text(s, [
    { text: 'Курсова робота «Інтернет-проєкт» · 2026', options: { breakLine: true, color: C.accent1, bold: true } },
    { text: 'Керівник: доцент, к.т.н. Машевська М. В.', options: { breakLine: true } },
    { text: 'Виконав: студент гр. ________' },
  ], { x: 0.7, y: 5.2, w: 6.4, h: 1.1, fontSize: 15, color: C.accent6, paraSpaceAfter: 4, objectName: 'Автор і керівник' });
  const phones = [S('mobile-home.jpg'), S('mobile-delivery-tracking.jpg'), S('mobile-courier-active.jpg')];
  for (const [i, f] of phones.entries()) {
    const w = 1.72, h = (w * 844) / 390;
    s.addImage({ path: f, x: 7.5 + i * 1.86, y: 1.6 + (i === 1 ? -0.35 : 0.15), w, h, objectName: `Екран застосунку ${i + 1}`, altText: 'Екран мобільного застосунку' });
  }
  s.addNotes(
    'Доброго дня. Тема моєї курсової роботи — інформаційна система ресторану SMART RESTAURANT. ' +
      'Це завершена клієнт-серверна система: Web-застосунок, нативний мобільний застосунок, дві серверні системи і одна база даних PostgreSQL. ' +
      'Вона автоматизує повний цикл обслуговування гостя — від бронювання до оплати — і власну службу доставки.',
  );

  // ───────── 2. Проблема і мета ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Вступ' });
  s.addText('Проблема: процеси ресторану розірвані', { placeholder: 'title' });
  const problems = [
    ['LuPhoneOff', 'Бронювання телефоном', 'записи в зошиті, подвійні бронювання'],
    ['LuUsers', 'Черга на вході', 'хостес шукає бронювання вручну'],
    ['LuHourglass', 'Очікування офіціанта', 'у години пік гальмує весь зал'],
    ['LuFileText', 'Паперові чеки на кухні', 'позиції губляться, час не контролюється'],
    ['LuClock', 'Невідомий статус', 'гість не знає, коли буде страва'],
    ['LuStore', 'Доставка через агрегатор', 'комісія і немає контролю часу'],
  ];
  for (const [i, [ic, t, d]] of problems.entries()) {
    const x = 0.6 + (i % 3) * 4.1, y = 1.45 + Math.floor(i / 3) * 1.55;
    card(s, x, y, 3.85, 1.3, `Проблема ${i + 1}`);
    await iconCircle(s, x + 0.25, y + 0.3, 0.7, ic, HEX.accent5, '3A2620', `Іконка проблеми ${i + 1}`);
    text(s, [
      { text: t, options: { bold: true, fontSize: 16, breakLine: true } },
      { text: d, options: { fontSize: 13, color: C.accent6 } },
    ], { x: x + 1.15, y: y + 0.2, w: 2.55, h: 0.9, valign: 'middle', objectName: `Текст проблеми ${i + 1}` });
  }
  card(s, 0.6, 4.75, 12.05, 1.85, 'Мета роботи', '2E2716');
  await iconCircle(s, 0.95, 5.2, 0.95, 'LuSparkles', HEX.text1 || HEX.dk1, HEX.accent1, 'Іконка мети');
  text(s, [
    { text: 'Мета: ', options: { bold: true, color: C.accent1 } },
    { text: 'автоматизувати процес «бронювання → check-in → замовлення → кухня → оплата» і власну доставку, обʼєднавши гостя, зал, кухню й курʼєрів в одну систему реального часу' },
  ], { x: 2.2, y: 4.95, w: 10.2, h: 1.45, fontSize: 19, valign: 'middle', objectName: 'Формулювання мети' });
  s.addNotes(
    'Проблема: у типовому ресторані бронювання ведуть телефоном, на вході черга, гість чекає офіціанта й рахунок, кухня працює з паперовими чеками, ' +
      'гість не знає статусу замовлення, а доставка віддана агрегаторам з комісією. Мета — обʼєднати всі ці процеси в одну систему реального часу.',
  );

  // ───────── 3. Аналоги ─────────
  pres.addSection({ title: 'Аналіз і вимоги' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Аналіз і вимоги' });
  s.addText('Аналоги не покривають повний цикл', { placeholder: 'title' });
  const yes = { text: '✓', color: HEX.accent2 }, no = { text: '—', color: HEX.accent6 }, part = { text: 'частково', color: HEX.lt2 };
  const rowsData = [
    ['Онлайн-бронювання', yes, yes, part, no],
    ['QR check-in за бронюванням', no, no, no, no],
    ['Замовлення зі смартфона', no, yes, part, yes],
    ['Kitchen display', no, no, yes, no],
    ['Статус у реальному часі', no, part, no, yes],
    ['Власна доставка закладу', no, part, yes, no],
  ];
  const hdr = (t, gold) => ({ text: t, options: { bold: true, color: gold ? HEX.dk1 : HEX.lt1, fill: { color: gold ? HEX.accent1 : '2B2620' }, align: 'center', valign: 'middle' } });
  const rows = [[hdr('Функція'), hdr('OpenTable'), hdr('Choice QR'), hdr('Poster POS'), hdr('Glovo'), hdr('Smart Restaurant', true)]];
  for (const [f, ...cells] of rowsData) {
    rows.push([
      { text: f, options: { color: HEX.lt1, fill: { color: HEX.dk2 }, valign: 'middle' } },
      ...cells.map((c) => ({ text: c.text, options: { color: c.color, fill: { color: HEX.dk2 }, align: 'center', valign: 'middle' } })),
      { text: '✓', options: { color: HEX.dk1, bold: true, fill: { color: 'E7C27A' }, align: 'center', valign: 'middle' } },
    ]);
  }
  s.addTable(rows, {
    x: 0.6, y: 1.45, w: 12.1, colW: [3.6, 1.7, 1.7, 1.7, 1.7, 1.7], rowH: 0.52, fontSize: 15, fontFace: THEME.bodyFontFace,
    border: { type: 'solid', color: HEX.dk1, pt: 2 }, objectName: 'Порівняння з аналогами',
  });
  text(s, [
    { text: 'Висновок: ', options: { bold: true, color: C.accent1 } },
    { text: 'кожен аналог закриває лише частину процесу — Smart Restaurant поєднує зал, кухню, оплату й доставку в одній системі без посередника' },
  ], { x: 0.6, y: 5.35, w: 12.1, h: 0.9, fontSize: 17, objectName: 'Висновок аналізу' });
  s.addNotes(
    'Я розглянув чотири аналоги. OpenTable — бронювання. Choice QR — QR-меню, замовлення й оплата зі смартфона, бронювання за заявкою і сайт для доставки, але без check-in і kitchen display. ' +
      'Poster POS — система для персоналу з kitchen display і застосунком курʼєра, але без застосунку для гостя. Glovo — агрегатор доставки з комісією. ' +
      'Кожен покриває лише частину процесу. Звідси ніша: повний цикл у залі разом із власною доставкою в одній системі.',
  );

  // ───────── 4. Ролі та процеси ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Аналіз і вимоги' });
  s.addText('5 ролей і 2 бізнес-процеси', { placeholder: 'title' });
  const roles = [
    ['LuSmartphone', 'Клієнт', 'бронює, замовляє, платить, доставка', HEX.accent1],
    ['LuUtensils', 'Працівник залу', 'бронювання, check-in, замовлення', HEX.accent3],
    ['LuChefHat', 'Кухар', 'kitchen display, стоп-лист', HEX.accent2],
    ['LuBike', 'Курʼєр', 'черга, маршрут, вручення', HEX.accent4],
    ['LuShieldCheck', 'Адміністратор', 'меню, столи, зони, аналітика', HEX.accent6],
  ];
  for (const [i, [ic, t, d, col]] of roles.entries()) {
    const x = 0.6 + i * 2.45;
    card(s, x, 1.45, 2.2, 2.25, `Роль ${t}`);
    await iconCircle(s, x + 0.7, 1.65, 0.8, ic, HEX.dk1, col, `Іконка ролі ${t}`);
    text(s, [
      { text: t, options: { bold: true, fontSize: 16, breakLine: true } },
      { text: d, options: { fontSize: 12.5, color: C.accent6 } },
    ], { x: x + 0.15, y: 2.6, w: 1.9, h: 1.0, align: 'center', valign: 'top', objectName: `Опис ролі ${t}` });
  }
  const flow = (y, label, steps, col, name) => {
    text(s, label, { x: 0.6, y, w: 1.6, h: 0.55, fontSize: 15, bold: true, color: col, valign: 'middle', objectName: name + ' — підпис' });
    const sw = (12.1 - 1.7 - (steps.length - 1) * 0.12) / steps.length;
    steps.forEach((st, k) => {
      const x = 2.3 + k * (sw + 0.12);
      s.addShape(pres.shapes.CHEVRON, { x, y, w: sw, h: 0.55, fill: { color: k === steps.length - 1 ? col : HEX.dk2 }, line: { type: 'none' }, objectName: `${name} — крок ${k + 1}` });
      text(s, st, { x: x + 0.14, y, w: sw - 0.2, h: 0.55, fontSize: 11.5, align: 'center', valign: 'middle', color: k === steps.length - 1 ? HEX.dk1 : HEX.lt1, bold: k === steps.length - 1, objectName: `${name} — текст ${k + 1}` });
    });
  };
  flow(4.25, 'Зал', ['Бронювання', 'Підтвердження', 'QR check-in', 'Замовлення', 'Кухня', 'Подача', 'Оплата'], HEX.accent1, 'Процес залу');
  flow(5.15, 'Доставка', ['Оформлення', 'Оплата', 'Кухня', 'Курʼєр забрав', 'Доставлено'], HEX.accent4, 'Процес доставки');
  text(s, 'Права перевіряє сервер: RBAC на кожному endpoint + права переходів в автоматах станів', { x: 0.6, y: 6.05, w: 12.1, h: 0.45, fontSize: 14, color: C.accent6, objectName: 'Примітка про права' });
  s.addNotes(
    'У системі пʼять ролей: клієнт, працівник залу, кухар, курʼєр і технічна роль адміністратора. Вони відрізняються операціями, даними і правами, ' +
      'а перевіряє права лише сервер. Автоматизовано два процеси: обслуговування в залі та доставку — з однією кухнею і однією базою даних.',
  );

  // ───────── 5. Use Case ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Аналіз і вимоги' });
  s.addText('Use Case: модель для кожної ролі', { placeholder: 'title' });
  await picture(s, D('use-case-client.png'), { x: 0.6, y: 1.35, w: 6.4, h: 5.45 }, 'Діаграма варіантів використання клієнта');
  const ucPoints = [
    ['LuUsers', '5 діаграм — по одній на роль', 'актори, варіанти використання, «include» і «extend»'],
    ['LuFileText', '7 специфікацій ключових UC', 'актор, передумови, тригер, основний і альтернативні сценарії, постумови'],
    ['LuRoute', 'Наскрізне трасування', 'вимога → UC → API → таблиці → екран → тест'],
    ['LuCircleCheck', 'Відповідає реалізації', 'кожен UC має endpoint, екран і автотест'],
  ];
  for (const [i, [ic, t, d]] of ucPoints.entries()) {
    const y = 1.45 + i * 1.32;
    await iconCircle(s, 7.4, y + 0.08, 0.72, ic, HEX.dk1, HEX.accent1, `Іконка пункту ${i + 1}`);
    text(s, [
      { text: t, options: { bold: true, fontSize: 17, breakLine: true } },
      { text: d, options: { fontSize: 13.5, color: C.accent6 } },
    ], { x: 8.35, y, w: 4.4, h: 1.1, valign: 'top', objectName: `Пункт про use case ${i + 1}` });
  }
  s.addNotes(
    'Модель варіантів використання побудовано окремо для кожної ролі; на слайді — діаграма клієнта: ліворуч процес у залі, праворуч доставка. ' +
      'Для семи ключових варіантів є повні специфікації, а кожна вимога трасується до API, таблиць, екранів і тестів.',
  );

  // ───────── 6. Архітектура ─────────
  pres.addSection({ title: 'Проєктування і реалізація' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('Архітектура: дві системи — одна база даних', { placeholder: 'title' });
  await picture(s, D('architecture.png'), { x: 0.6, y: 1.35, w: 8.3, h: 4.55 }, 'Діаграма архітектури');
  const archStats = [
    ['59', 'endpoint Restaurant API (зал, кухня, оплата)', HEX.accent2],
    ['27', 'endpoint Delivery API (доставка, курʼєри)', HEX.accent4],
    ['1', 'PostgreSQL для обох систем, єдиний вхід JWT', HEX.accent1],
  ];
  for (const [i, [n, d, col]] of archStats.entries()) {
    const y = 1.35 + i * 1.55;
    card(s, 9.2, y, 3.5, 1.35, `Показник архітектури ${i + 1}`);
    text(s, n, { x: 9.4, y: y + 0.12, w: 1.1, h: 1.1, fontSize: 40, bold: true, color: col, fontFace: THEME.headFontFace, valign: 'middle', objectName: `Число ${i + 1}` });
    text(s, d, { x: 10.5, y: y + 0.15, w: 2.05, h: 1.05, fontSize: 13, color: C.background2, valign: 'middle', objectName: `Підпис числа ${i + 1}` });
  }
  text(s, [
    { text: 'Події між системами: ', options: { bold: true, color: C.accent1 } },
    { text: 'PostgreSQL LISTEN/NOTIFY — подія доходить лише після COMMIT, тож ніколи не випереджає дані. Клієнти не мають доступу до БД напряму.' },
  ], { x: 0.6, y: 6.1, w: 12.1, h: 0.75, fontSize: 15, objectName: 'Пояснення подій' });
  s.addNotes(
    'Архітектура: Web працює з Restaurant API, мобільний застосунок — з обома системами. Restaurant API обслуговує зал і кухню, Delivery API — доставку; ' +
      'це окремі процеси й Docker-контейнери з власним Swagger і Socket.IO, але з однією базою даних. Коли доставку оплачено, подія через LISTEN/NOTIFY ' +
      'потрапляє в Restaurant API — і кухар одразу бачить тікет.',
  );

  // ───────── 7. База даних ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('База даних: 14 таблиць, обмеження в PostgreSQL', { placeholder: 'title' });
  await picture(s, D('er-diagram.png'), { x: 0.6, y: 1.35, w: 7.2, h: 5.45 }, 'Логічна модель бази даних');
  const constraints = [
    ['EXCLUDE', 'один столик не можна забронювати двічі на час, що перетинається'],
    ['Частковий UNIQUE', 'рівно одна успішна оплата на замовлення'],
    ['CHECK', 'зал — зі столиком, доставка — без; телефон +380; суми в копійках'],
    ['Тригер', 'запис доставки лише для замовлення типу DELIVERY'],
    ['Індекси', 'черга кухні, диспетчерська, бронювання столика за часом'],
  ];
  for (const [i, [k, d]] of constraints.entries()) {
    const y = 1.4 + i * 1.07;
    card(s, 8.1, y, 4.6, 0.92, `Обмеження ${k}`);
    text(s, [
      { text: k, options: { bold: true, color: C.accent1, fontSize: 15, breakLine: true } },
      { text: d, options: { fontSize: 12.5, color: C.background2 } },
    ], { x: 8.3, y: y + 0.08, w: 4.25, h: 0.78, valign: 'middle', objectName: `Опис обмеження ${i + 1}` });
  }
  s.addNotes(
    'Логічна модель — 14 таблиць у третій нормальній формі. Центр — замовлення: у залі воно повʼязане з бронюванням і столиком, у доставці — з адресою, зоною і курʼєром. ' +
      'Найважливіші правила гарантує сама база: EXCLUDE проти перетину бронювань, частковий унікальний індекс проти подвійної оплати, CHECK і тригер для доставки.',
  );

  // ───────── 8. Бізнес-логіка ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('Бізнес-логіка: автомати станів', { placeholder: 'title' });
  await picture(s, D('state-machines.png'), { x: 0.6, y: 1.3, w: 8.2, h: 5.5 }, 'Діаграма станів');
  const checks = [
    ['409', 'перехід не існує', 'наприклад, PENDING → COMPLETED'],
    ['403', 'роль не має права', 'офіціант не може «готувати», клієнт — підтверджувати'],
    ['422', 'умову не виконано', 'оплата до подачі, бронювання поза годинами'],
  ];
  text(s, 'Сервер перевіряє кожен перехід', { x: 9.1, y: 1.35, w: 3.6, h: 0.5, fontSize: 18, bold: true, objectName: 'Заголовок перевірок' });
  for (const [i, [code, t, d]] of checks.entries()) {
    const y = 2.0 + i * 1.45;
    card(s, 9.1, y, 3.6, 1.25, `Перевірка ${code}`);
    text(s, code, { x: 9.3, y: y + 0.15, w: 0.95, h: 0.95, fontSize: 30, bold: true, color: C.accent5, fontFace: THEME.headFontFace, valign: 'middle', objectName: `Код ${code}` });
    text(s, [
      { text: t, options: { bold: true, fontSize: 14.5, breakLine: true } },
      { text: d, options: { fontSize: 12, color: C.accent6 } },
    ], { x: 10.25, y: y + 0.1, w: 2.35, h: 1.05, valign: 'middle', objectName: `Опис перевірки ${code}` });
  }
  text(s, 'Кожна зміна → журнал status_changes + подія в реальному часі', { x: 9.1, y: 6.4, w: 3.6, h: 0.45, fontSize: 12.5, color: C.accent6, objectName: 'Примітка про журнал' });
  s.addNotes(
    'Бізнес-логіка — це скінченні автомати для бронювання, замовлення в залі й доставки. Для кожного переходу задано, хто може його виконати: власник, роль або лише система. ' +
      'Недопустимий перехід дає 409, перехід не для цієї ролі — 403, невиконана умова — 422. Кожна зміна потрапляє в журнал і розсилається в реальному часі.',
  );

  // ───────── 9. Web ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('Web: робоче місце залу і kitchen display', { placeholder: 'title' });
  for (const [i, [f, cap]] of [
    ['web-staff-dashboard.jpg', 'Огляд зміни: показники, живий план залу, «потребує уваги»'],
    ['web-kitchen-display.jpg', 'Kitchen display: спільна черга залу й доставки з таймерами'],
  ].entries()) {
    const x = 0.6 + i * 6.2, w = 5.9, h = (w * 800) / 1280;
    s.addImage({ path: S(f), x, y: 1.4, w, h, objectName: `Скриншот Web ${i + 1}`, altText: cap });
    text(s, cap, { x, y: 1.5 + h, w, h: 0.6, fontSize: 14, color: C.background2, objectName: `Підпис скриншота Web ${i + 1}` });
  }
  text(s, [
    { text: 'Також у Web: ', options: { bold: true, color: C.accent1 } },
    { text: 'меню, бронювання з планом залу, кабінет гостя, kanban замовлень, сканер QR, адміністрування й аналітика. Кожна вкладка — окрема сесія.' },
  ], { x: 0.6, y: 5.95, w: 12.1, h: 0.8, fontSize: 15, objectName: 'Інші функції Web' });
  s.addNotes(
    'Web — повноцінний клієнт: для гостя меню, бронювання з планом залу й кабінет, для персоналу — огляд зміни, план залу, kanban замовлень і сканер QR, ' +
      'для кухні — kitchen display, де замовлення залу й доставки в одній черзі, для адміністратора — меню, столики, користувачі й аналітика.',
  );

  // ───────── 10. Mobile ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('Mobile: гість, доставка, курʼєр', { placeholder: 'title' });
  const mob = [
    ['mobile-qr-checkin.jpg', 'QR check-in камерою'],
    ['mobile-order-status.jpg', 'Статус наживо'],
    ['mobile-delivery-geolocation.jpg', 'Район за GPS'],
    ['mobile-delivery-tracking.jpg', 'Відстеження курʼєра'],
    ['mobile-courier-active.jpg', 'Робоче місце курʼєра'],
  ];
  for (const [i, [f, cap]] of mob.entries()) {
    const w = 2.0, h = (w * 844) / 390, x = 0.75 + i * 2.48;
    s.addImage({ path: S(f), x, y: 1.3, w, h, objectName: `Екран Mobile ${i + 1}`, altText: cap });
    text(s, cap, { x, y: 1.4 + h, w, h: 0.4, fontSize: 13.5, align: 'center', color: C.background2, objectName: `Підпис екрана Mobile ${i + 1}` });
  }
  text(s, 'Нативний застосунок (React Native, Expo), не WebView: камера, GPS, сповіщення, вібрація, власна навігація для кожної ролі', {
    x: 0.6, y: 6.45, w: 12.1, h: 0.45, fontSize: 14, color: C.accent6, objectName: 'Про мобільний застосунок',
  });
  s.addNotes(
    'Мобільний застосунок — нативний, на React Native і Expo. Гість бронює, робить check-in камерою за QR столика, замовляє і бачить статус наживо; ' +
      'для доставки застосунок визначає район за GPS і показує, де курʼєр. Курʼєр має свою чергу, маршрут у картах і дзвінок клієнту.',
  );

  // ───────── 11. ADVANCED і BONUS ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Проєктування і реалізація' });
  s.addText('ADVANCED і BONUS-компоненти', { placeholder: 'title' });
  const adv = [
    ['LuCalendarCheck', 'Booking engine', 'слоти, буфер 15 хв, best-fit зі штрафом за фрагментацію, альтернативи', 'ADVANCED'],
    ['LuQrCode', 'QR-коди', 'QR бронювання для хостес, QR столика для гостя, walk-in, перевипуск', 'ADVANCED'],
    ['LuCreditCard', 'Sandbox payment', 'алгоритм Луна, 3-D Secure, ідемпотентність, повернення коштів', 'ADVANCED'],
    ['LuChefHat', 'Kitchen display + ETA', 'черга з таймерами, автоперехід «Готово», прогноз часу', 'BONUS'],
    ['LuBrainCircuit', 'Рекомендації', 'асоціативні правила, персоналізація, байєсівський рейтинг', 'BONUS'],
    ['LuMapPin', 'Доставка + геолокація', 'окрема система, курʼєри, район за GPS (гаверсинус)', 'BONUS'],
  ];
  for (const [i, [ic, t, d, tag]] of adv.entries()) {
    const x = 0.6 + (i % 3) * 4.1, y = 1.4 + Math.floor(i / 3) * 2.65;
    const col = tag === 'ADVANCED' ? HEX.accent1 : HEX.accent4;
    card(s, x, y, 3.85, 2.4, `Компонент ${t}`);
    await iconCircle(s, x + 0.3, y + 0.3, 0.8, ic, HEX.dk1, col, `Іконка ${t}`);
    text(s, tag, { x: x + 2.2, y: y + 0.4, w: 1.4, h: 0.35, fontSize: 11, bold: true, color: col, align: 'right', objectName: `Мітка ${t}` });
    text(s, [
      { text: t, options: { bold: true, fontSize: 17, breakLine: true } },
      { text: d, options: { fontSize: 13, color: C.accent6 } },
    ], { x: x + 0.3, y: y + 1.2, w: 3.3, h: 1.1, valign: 'top', objectName: `Опис ${t}` });
  }
  s.addNotes(
    'ADVANCED для моєї теми — booking engine, QR і sandbox-оплата. Booking engine підбирає столик штрафною функцією, яка уникає «мертвих» проміжків у розкладі. ' +
      'Оплата перевіряє картку алгоритмом Луна, підтримує 3-D Secure, ідемпотентність і повернення коштів. Понад вимоги — kitchen display з прогнозом часу, ' +
      'пояснювані рекомендації та служба доставки як окрема система з геолокацією.',
  );

  // ───────── 12. Тестування ─────────
  pres.addSection({ title: 'Результати' });
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Результати' });
  s.addText('Тестування: автоматичне і на кожен push', { placeholder: 'title' });
  const stats = [
    ['118', 'тестів backend', 'зал — 77, доставка — 41', HEX.accent2],
    ['× 7', 'днів тижня', 'увесь набір «ніби сьогодні» кожен день', HEX.accent1],
    ['4', 'E2E у браузері', 'захист і доставка через UI', HEX.accent3],
    ['0', 'зауважень ESLint', 'TypeScript strict, Prettier', HEX.accent4],
  ];
  for (const [i, [n, t, d, col]] of stats.entries()) {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.4, 2.85, 2.5, `Показник тестування ${i + 1}`);
    text(s, n, { x: x + 0.25, y: 1.55, w: 2.4, h: 1.1, fontSize: 54, bold: true, color: col, fontFace: THEME.headFontFace, objectName: `Число тестів ${i + 1}` });
    text(s, [
      { text: t, options: { bold: true, fontSize: 16, breakLine: true } },
      { text: d, options: { fontSize: 12.5, color: C.accent6 } },
    ], { x: x + 0.25, y: 2.75, w: 2.45, h: 1.0, valign: 'top', objectName: `Опис показника ${i + 1}` });
  }
  text(s, 'GitHub Actions на кожен push', { x: 0.6, y: 4.3, w: 6, h: 0.45, fontSize: 17, bold: true, objectName: 'Заголовок CI' });
  const ci = ['Lint і формат', 'Backend: типи, тести × 7, збірка', 'Web: збірка', 'Mobile: типи', 'E2E: Playwright + PostgreSQL'];
  ci.forEach((t, k) => {
    const sw = (12.1 - 4 * 0.12) / 5, x = 0.6 + k * (sw + 0.12);
    s.addShape(pres.shapes.CHEVRON, { x, y: 4.9, w: sw, h: 0.75, fill: { color: k === 4 ? HEX.accent2 : HEX.dk2 }, line: { type: 'none' }, objectName: `Етап CI ${k + 1}` });
    text(s, t, { x: x + 0.25, y: 4.9, w: sw - 0.45, h: 0.75, fontSize: 12.5, align: 'center', valign: 'middle', color: k === 4 ? HEX.dk1 : HEX.lt1, bold: k === 4, objectName: `Текст етапу CI ${k + 1}` });
  });
  text(s, 'Перевірено: ролі й заборонені операції, валідація, конфлікти бронювань, 3-D Secure, подвійна оплата, обмеження БД, події між системами, геолокація на контрольних даних', {
    x: 0.6, y: 5.95, w: 12.1, h: 0.8, fontSize: 14, color: C.background2, objectName: 'Що перевірено',
  });
  s.addNotes(
    'Тестування автоматичне: 118 модульних та інтеграційних тестів серверної частини на реальній PostgreSQL, і весь набір проганяється сім разів — ніби сьогодні кожен день тижня, ' +
      'бо графік роботи різний. Ще чотири наскрізні тести в браузері проходять сценарій захисту й доставку. Усе це виконує GitHub Actions на кожен push.',
  );

  // ───────── 13. Демонстрація ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Результати' });
  s.addText('План демонстрації', { placeholder: 'title' });
  const demo = [
    ['Web', 'вхід офіціанта → бронювання → підтвердження'],
    ['Mobile', 'новий клієнт → слот → план залу → бронювання з QR'],
    ['Mobile → Web', 'бронювання миттєво зʼявляється в залі'],
    ['Web → Mobile', 'підтвердження → сповіщення на телефоні'],
    ['Повний цикл', 'QR check-in → замовлення → кухня → оплата 3-D Secure → відгук'],
    ['Доставка', 'геолокація → оплата → тікет на кухні → курʼєр → «Доставлено»'],
    ['API та ADVANCED', 'Swagger, заборонені операції, booking engine, гарантія БД'],
  ];
  for (const [i, [t, d]] of demo.entries()) {
    const col = i < 4 ? 0 : 1, row = i < 4 ? i : i - 4;
    const x = 0.6 + col * 6.15, y = 1.4 + row * 1.32;
    card(s, x, y, 5.9, 1.12, `Сценарій ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.22, y: y + 0.21, w: 0.7, h: 0.7, fill: { color: HEX.accent1 }, line: { type: 'none' }, objectName: `Номер сценарію ${i + 1} — коло` });
    text(s, String(i + 1), { x: x + 0.22, y: y + 0.21, w: 0.7, h: 0.7, fontSize: 20, bold: true, color: HEX.dk1, align: 'center', valign: 'middle', objectName: `Номер сценарію ${i + 1}` });
    text(s, [
      { text: t, options: { bold: true, fontSize: 16, breakLine: true } },
      { text: d, options: { fontSize: 13, color: C.accent6 } },
    ], { x: x + 1.15, y: y + 0.1, w: 4.6, h: 0.92, valign: 'middle', objectName: `Опис сценарію ${i + 1}` });
  }
  card(s, 6.75, 5.36, 5.9, 1.12, 'Тестові облікові записи', '2E2716');
  text(s, [
    { text: 'Облікові записи: ', options: { bold: true, color: C.accent1 } },
    { text: 'client@ / staff@ / kitchen@ / courier@ / admin@smartrest.ua; картка 3-D Secure 4000 0000 0000 3220, код 123456' },
  ], { x: 6.95, y: 5.45, w: 5.55, h: 0.95, fontSize: 13, valign: 'middle', objectName: 'Облікові записи для демо' });
  s.addNotes(
    'Далі — жива демонстрація за сценаріями методички: Web, Mobile, інтеграція в обидва боки, повний цикл у залі, доставка через дві системи, API та ADVANCED-компоненти. ' +
      'Система працює і на нових даних: можу створити нового користувача, страву чи столик за вашим проханням.',
  );

  // ───────── 14. Висновки ─────────
  s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Результати' });
  s.addText('Висновки', { placeholder: 'title' });
  const results = [
    ['LuCircleCheck', 'Мету досягнуто', 'повний цикл залу й власна доставка в одній системі реального часу'],
    ['LuServer', 'Завершена система', 'Web + Mobile + Restaurant API + Delivery API + PostgreSQL'],
    ['LuWorkflow', 'Бізнес-логіка', 'автомати станів, права ролей і цілісність на рівні БД'],
    ['LuActivity', 'Якість', '118 тестів × 7 днів, E2E, CI, ESLint, Docker'],
  ];
  for (const [i, [ic, t, d]] of results.entries()) {
    const y = 1.4 + i * 1.2;
    await iconCircle(s, 0.6, y + 0.05, 0.8, ic, HEX.dk1, HEX.accent2, `Іконка висновку ${i + 1}`);
    text(s, [
      { text: t, options: { bold: true, fontSize: 18, breakLine: true } },
      { text: d, options: { fontSize: 14, color: C.accent6 } },
    ], { x: 1.65, y, w: 5.6, h: 1.0, valign: 'middle', objectName: `Висновок ${i + 1}` });
  }
  card(s, 7.6, 1.4, 5.05, 4.55, 'Розвиток системи', '2E2716');
  text(s, 'Подальший розвиток', { x: 7.9, y: 1.6, w: 4.5, h: 0.5, fontSize: 18, bold: true, color: C.accent1, objectName: 'Заголовок розвитку' });
  text(s, [
    { text: 'реальний платіжний провайдер', options: { bullet: true, breakLine: true } },
    { text: 'серверні push-сповіщення', options: { bullet: true, breakLine: true } },
    { text: 'точні межі зон доставки (полігони)', options: { bullet: true, breakLine: true } },
    { text: 'оптимізація маршрутів курʼєрів', options: { bullet: true, breakLine: true } },
    { text: 'публікація в App Store і Google Play', options: { bullet: true } },
  ], { x: 7.9, y: 2.25, w: 4.5, h: 3.4, fontSize: 16, paraSpaceAfter: 10, valign: 'top', color: C.background2, objectName: 'Напрями розвитку' });
  text(s, 'Дякую за увагу!', { x: 0.6, y: 6.2, w: 7, h: 0.6, fontSize: 24, bold: true, color: C.accent1, fontFace: THEME.headFontFace, objectName: 'Подяка' });
  s.addNotes(
    'Підсумовуючи: мету досягнуто — розроблено завершену систему, у якій гість бронює, замовляє й платить зі смартфона, персонал бачить зал і кухню в реальному часі, ' +
      'а доставка працює без агрегатора. Подальший розвиток — реальний платіжний провайдер, push-сповіщення і точні межі зон. Дякую за увагу, готовий відповісти на запитання.',
  );

  await pres.writeFile({ fileName: OUT });
  if (applyTheme) await applyTheme(OUT, THEME);
  else console.warn('APPLY_THEME не задано: кольори теми не записано, відкрийте готовий docs/Presentation_SMART_RESTAURANT.pptx');
  console.log('saved', OUT);
})();
