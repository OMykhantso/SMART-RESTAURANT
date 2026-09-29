/** Демонстраційні дані ресторану (меню, столики, облікові записи). */
import type { Role, TableShape, TableZone } from '@prisma/client';

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const USERS: { email: string; name: string; phone: string; role: Role; password: string }[] = [
  { email: 'admin@smartrest.ua', name: 'Ірина Коваль', phone: '+380671112233', role: 'ADMIN', password: 'Admin123!' },
  { email: 'staff@smartrest.ua', name: 'Олена Шевчук', phone: '+380672223344', role: 'STAFF', password: 'Staff123!' },
  { email: 'waiter@smartrest.ua', name: 'Андрій Бондар', phone: '+380673334455', role: 'STAFF', password: 'Staff123!' },
  { email: 'kitchen@smartrest.ua', name: 'Марко Лисенко', phone: '+380674445566', role: 'KITCHEN', password: 'Kitchen123!' },
  { email: 'client@smartrest.ua', name: 'Олександр Мельник', phone: '+380501234567', role: 'CLIENT', password: 'Client123!' },
  { email: 'maria@smartrest.ua', name: 'Марія Ткаченко', phone: '+380502345678', role: 'CLIENT', password: 'Client123!' },
];

export const CLIENT_NAMES = [
  'Дмитро Кравченко', 'Анна Олійник', 'Максим Савченко', 'Софія Руденко', 'Богдан Мороз', 'Катерина Павленко',
  'Іван Литвиненко', 'Юлія Гончаренко', 'Тарас Поліщук', 'Вікторія Марченко', 'Назар Ковальчук', 'Дарина Захарченко',
  'Роман Білоус', 'Оксана Кузьменко', 'Сергій Ткачук', 'Ліза Остапенко', 'Артем Власенко', 'Наталія Тимошенко',
  'Владислав Гриценко', 'Ірина Кириленко', 'Олег Дорошенко', 'Аліна Зінченко',
];

export const WALKIN_NAMES = ['Гість з вулиці', 'Пан Петро', 'Родина Іваненків', 'Пані Галина', 'Компанія друзів', 'Гість'];

export const CATEGORIES = [
  { slug: 'breakfast', name: 'Сніданки', emoji: '🍳', description: 'До 12:00 — повільний ранок зі смаком', sortOrder: 1 },
  { slug: 'starters', name: 'Закуски', emoji: '🥟', description: 'Щоб розпочати вечір', sortOrder: 2 },
  { slug: 'salads', name: 'Салати', emoji: '🥗', description: 'Свіжість сезону', sortOrder: 3 },
  { slug: 'soups', name: 'Супи', emoji: '🍲', description: 'Теплі та ароматні', sortOrder: 4 },
  { slug: 'main', name: 'Основні страви', emoji: '🥩', description: 'Гриль, риба та птиця', sortOrder: 5 },
  { slug: 'pasta', name: 'Паста та різото', emoji: '🍝', description: 'Італійська класика', sortOrder: 6 },
  { slug: 'pizza', name: 'Піца', emoji: '🍕', description: 'Неаполітанське тісто 48 годин', sortOrder: 7 },
  { slug: 'desserts', name: 'Десерти', emoji: '🍰', description: 'Солодкий фінал', sortOrder: 8 },
  { slug: 'drinks', name: 'Напої', emoji: '☕', description: 'Кава, лимонади, фреші', sortOrder: 9 },
  { slug: 'cocktails', name: 'Коктейлі та вино', emoji: '🍸', description: 'Бар працює до закриття', sortOrder: 10 },
];

export interface SeedDish {
  key: string;
  category: string;
  name: string;
  description: string;
  price: number; // грн
  weight?: number;
  calories?: number;
  prep: number;
  image: string;
  veg?: boolean;
  spicy?: boolean;
  chef?: boolean;
  tags?: string[];
  allergens?: string[];
}

export const DISHES: SeedDish[] = [
  // Сніданки
  { key: 'syrnyky', category: 'breakfast', name: 'Сирники зі сметаною та ягодами', description: 'Ніжні сирники з домашнього сиру, лісові ягоди, сметана та мед', price: 195, weight: 280, calories: 540, prep: 12, image: img('photo-1567620905732-2d1ec7ab7445'), veg: true, chef: true, tags: ['сніданок', 'хіт'], allergens: ['лактоза', 'глютен', 'яйця'] },
  { key: 'avotoast', category: 'breakfast', name: 'Авокадо-тост з яйцем пашот', description: 'Житній хліб на заквасці, крем з авокадо, яйце пашот, мікрозелень', price: 225, weight: 250, calories: 460, prep: 10, image: img('photo-1482049016688-2d3e1b311543'), veg: true, tags: ['сніданок'], allergens: ['глютен', 'яйця'] },
  { key: 'granola', category: 'breakfast', name: 'Гранола з грецьким йогуртом', description: 'Домашня гранола, грецький йогурт, сезонні фрукти, кленовий сироп', price: 165, weight: 260, calories: 390, prep: 5, image: img('photo-1488477181946-6428a0291777'), veg: true, tags: ['сніданок', 'легке'], allergens: ['лактоза', 'горіхи'] },
  { key: 'frenchtoast', category: 'breakfast', name: 'Французькі тости з карамеллю', description: 'Бріош, солона карамель, банан, ванільне морозиво', price: 185, weight: 240, calories: 610, prep: 10, image: img('photo-1484723091739-30a097e8f929'), veg: true, tags: ['сніданок', 'солодке'], allergens: ['лактоза', 'глютен', 'яйця'] },
  // Закуски
  { key: 'varenyky', category: 'starters', name: 'Вареники з картоплею та грибами', description: 'Ручна ліпка, карамелізована цибуля, шкварки, сметана', price: 185, weight: 300, calories: 520, prep: 14, image: img('photo-1496116218417-1a781b1c416c'), chef: true, tags: ['українська', 'хіт'], allergens: ['глютен', 'лактоза'] },
  { key: 'bruschetta', category: 'starters', name: 'Брускети з томатами та страчателою', description: 'Чіабата з печі, томати конкассе, страчатела, базилік', price: 175, weight: 220, calories: 380, prep: 8, image: img('photo-1572695157366-5e585ab2b69f'), veg: true, tags: ['італійська'], allergens: ['глютен', 'лактоза'] },
  { key: 'cheese', category: 'starters', name: 'Сирна тарілка', description: 'Чотири види крафтових сирів, мед, горіхи, виноград', price: 345, weight: 320, calories: 720, prep: 6, image: img('photo-1452195100486-9cc805987862'), veg: true, tags: ['до вина'], allergens: ['лактоза', 'горіхи'] },
  { key: 'fries', category: 'starters', name: 'Картопля фрі з трюфелем', description: 'Хрустка картопля, трюфельна олія, пармезан, айолі', price: 125, weight: 200, calories: 480, prep: 8, image: img('photo-1573080496219-bb080dd4f877'), veg: true, tags: ['до бургера'], allergens: ['лактоза', 'яйця'] },
  // Салати
  { key: 'caesar', category: 'salads', name: 'Цезар з куркою гриль', description: 'Ромен, курка гриль, пармезан, крутони, класичний соус', price: 245, weight: 290, calories: 520, prep: 10, image: img('photo-1550304943-4f24f54ddde9'), tags: ['класика'], allergens: ['глютен', 'лактоза', 'яйця', 'риба'] },
  { key: 'bowl', category: 'salads', name: 'Боул з кіноа та авокадо', description: 'Кіноа, авокадо, едамаме, печений батат, кунжутна заправка', price: 235, weight: 330, calories: 480, prep: 9, image: img('photo-1546069901-ba9599a7e63c'), veg: true, tags: ['веган', 'легке'], allergens: ['кунжут', 'соя'] },
  { key: 'greek', category: 'salads', name: 'Грецький салат', description: 'Томати, огірки, фета, каламата, червона цибуля, орегано', price: 205, weight: 280, calories: 340, prep: 7, image: img('photo-1540420773420-3366772f4999'), veg: true, tags: ['легке'], allergens: ['лактоза'] },
  { key: 'beet', category: 'salads', name: 'Печений буряк з козячим сиром', description: 'Буряк з печі, козячий сир, волоський горіх, рукола, бальзамік', price: 215, weight: 250, calories: 360, prep: 8, image: img('photo-1512621776951-a57141f2eefd'), veg: true, chef: true, tags: ['сезонне'], allergens: ['лактоза', 'горіхи'] },
  // Супи
  { key: 'borsch', category: 'soups', name: 'Український борщ з пампушками', description: 'Наваристий борщ на яловичині, часникові пампушки, сало, сметана', price: 175, weight: 400, calories: 460, prep: 8, image: img('photo-1547592180-85f173990554'), chef: true, tags: ['українська', 'хіт', 'lunch'], allergens: ['глютен', 'лактоза'] },
  { key: 'pumpkin', category: 'soups', name: 'Крем-суп з гарбуза', description: 'Печений гарбуз, кокосове молоко, імбир, гарбузове насіння', price: 165, weight: 350, calories: 290, prep: 7, image: img('photo-1476718406336-bb5a9690ee2a'), veg: true, tags: ['веган', 'lunch'], allergens: [] },
  { key: 'ramen', category: 'soups', name: 'Рамен з куркою', description: 'Курячий бульйон 12 годин, локшина, яйце ajitama, норі', price: 235, weight: 450, calories: 620, prep: 12, image: img('photo-1569718212165-3a8278d5f624'), spicy: true, tags: ['азійська', 'lunch'], allergens: ['глютен', 'яйця', 'соя'] },
  // Основні
  { key: 'ribeye', category: 'main', name: 'Стейк рібай', description: 'Мармурова яловичина 300 г, соус демі-глас, печені овочі', price: 745, weight: 420, calories: 980, prep: 22, image: img('photo-1600891964092-4316c288032e'), chef: true, tags: ['гриль', 'преміум'], allergens: ['лактоза'] },
  { key: 'salmon', category: 'main', name: 'Лосось з овочами гриль', description: 'Філе лосося, спаржа, цукіні, лимонно-вершковий соус', price: 525, weight: 340, calories: 610, prep: 18, image: img('photo-1467003909585-2f8a72700288'), tags: ['риба'], allergens: ['риба', 'лактоза'] },
  { key: 'burger', category: 'main', name: 'Бургер Smart з трюфельним соусом', description: 'Яловича котлета, чеддер, карамелізована цибуля, трюфельний соус', price: 325, weight: 380, calories: 890, prep: 15, image: img('photo-1568901346375-23c9450c58cd'), tags: ['хіт'], allergens: ['глютен', 'лактоза', 'яйця'] },
  { key: 'duck', category: 'main', name: 'Качина ніжка конфі', description: 'Качка конфі, пюре з селери, вишневий соус', price: 465, weight: 350, calories: 760, prep: 20, image: img('photo-1504674900247-0877df9cc836'), tags: ['преміум'], allergens: ['лактоза'] },
  { key: 'ribs', category: 'main', name: 'Свинячі реберця BBQ', description: 'Реберця 8 годин низької температури, BBQ-соус, коул-слоу', price: 395, weight: 500, calories: 1050, prep: 18, image: img('photo-1544025162-d76694265947'), spicy: true, tags: ['гриль'], allergens: ['гірчиця'] },
  // Паста
  { key: 'carbonara', category: 'pasta', name: 'Карбонара', description: 'Спагеті, гуанчале, жовток, пекоріно романо, чорний перець', price: 285, weight: 300, calories: 780, prep: 12, image: img('photo-1612874742237-6526221588e3'), tags: ['італійська', 'хіт'], allergens: ['глютен', 'лактоза', 'яйця'] },
  { key: 'seafood', category: 'pasta', name: 'Лінгвіні з морепродуктами', description: 'Креветки, мідії, кальмар, томати чері, біле вино', price: 395, weight: 340, calories: 690, prep: 14, image: img('photo-1563379926898-05f4575a45d8'), spicy: true, tags: ['морепродукти'], allergens: ['глютен', 'молюски', 'ракоподібні'] },
  { key: 'risotto', category: 'pasta', name: 'Різото з білими грибами', description: 'Карнаролі, білі гриби, пармезан, трюфельна олія', price: 345, weight: 300, calories: 640, prep: 20, image: img('photo-1476124369491-e7addf5db371'), veg: true, chef: true, tags: ['італійська'], allergens: ['лактоза'] },
  // Піца
  { key: 'margherita', category: 'pizza', name: 'Маргарита', description: 'Томати Сан-Марцано, моцарела фіор-ді-латте, базилік', price: 235, weight: 450, calories: 820, prep: 10, image: img('photo-1574071318508-1cdbab80d002'), veg: true, tags: ['класика'], allergens: ['глютен', 'лактоза'] },
  { key: 'pepperoni', category: 'pizza', name: 'Пепероні', description: 'Гостра салямі пепероні, моцарела, томатний соус', price: 275, weight: 480, calories: 960, prep: 10, image: img('photo-1628840042765-356cda07504e'), spicy: true, tags: ['хіт'], allergens: ['глютен', 'лактоза'] },
  { key: 'fourcheese', category: 'pizza', name: 'Чотири сири', description: 'Моцарела, горгонзола, пармезан, фонтіна, мед', price: 295, weight: 460, calories: 990, prep: 10, image: img('photo-1513104890138-7c749659a591'), veg: true, tags: [], allergens: ['глютен', 'лактоза'] },
  // Десерти
  { key: 'tiramisu', category: 'desserts', name: 'Тірамісу', description: 'Маскарпоне, савоярді, еспресо, какао', price: 165, weight: 160, calories: 450, prep: 4, image: img('photo-1571877227200-a0d98ea607e9'), veg: true, chef: true, tags: ['хіт'], allergens: ['лактоза', 'глютен', 'яйця'] },
  { key: 'cheesecake', category: 'desserts', name: 'Чізкейк Нью-Йорк', description: 'Класичний запечений чізкейк, ягідний соус', price: 155, weight: 170, calories: 480, prep: 4, image: img('photo-1533134242443-d4fd215305ad'), veg: true, tags: [], allergens: ['лактоза', 'глютен', 'яйця'] },
  { key: 'fondant', category: 'desserts', name: 'Шоколадний фондан', description: 'Гарячий фондан з рідким центром, ванільне морозиво', price: 175, weight: 180, calories: 560, prep: 12, image: img('photo-1578985545062-69928b1d9587'), veg: true, tags: ['шоколад'], allergens: ['лактоза', 'глютен', 'яйця'] },
  { key: 'gelato', category: 'desserts', name: 'Джелато асорті', description: 'Три кульки: фісташка, солона карамель, манго-маракуя', price: 135, weight: 150, calories: 330, prep: 3, image: img('photo-1563805042-7684c019e1cb'), veg: true, tags: ['легке'], allergens: ['лактоза', 'горіхи'] },
  // Напої
  { key: 'cappuccino', category: 'drinks', name: 'Капучино', description: 'Спешелті-еспресо, молоко або рослинне на вибір', price: 75, weight: 250, calories: 120, prep: 3, image: img('photo-1509042239860-f550ce710b93'), veg: true, tags: ['кава'], allergens: ['лактоза'] },
  { key: 'lemonade', category: 'drinks', name: "Лимонад маракуя-м'ята", description: "Маракуя, лайм, м'ята, газована вода", price: 95, weight: 400, calories: 140, prep: 3, image: img('photo-1556679343-c7306c1976bc'), veg: true, tags: ['освіжаюче'], allergens: [] },
  { key: 'orange', category: 'drinks', name: 'Апельсиновий фреш', description: 'Свіжовичавлені апельсини', price: 105, weight: 300, calories: 130, prep: 3, image: img('photo-1600271886742-f049cd451bba'), veg: true, tags: ['вітаміни'], allergens: [] },
  { key: 'matcha', category: 'drinks', name: 'Матча лате', description: 'Японська церемоніальна матча, вівсяне молоко', price: 110, weight: 300, calories: 150, prep: 3, image: img('photo-1515823064-d6e0c04616a7'), veg: true, tags: [], allergens: [] },
  // Коктейлі та вино
  { key: 'aperol', category: 'cocktails', name: 'Апероль Шприц', description: 'Апероль, просекко, содова, апельсин', price: 195, weight: 250, calories: 170, prep: 3, image: img('photo-1560512823-829485b8bf24'), veg: true, tags: ['коктейль'], allergens: [] },
  { key: 'mojito', category: 'cocktails', name: 'Мохіто', description: "Білий ром, лайм, м'ята, тростинний цукор, содова", price: 185, weight: 300, calories: 160, prep: 3, image: img('photo-1551538827-9c037cb4f32a'), veg: true, tags: ['коктейль'], allergens: [] },
  { key: 'redwine', category: 'cocktails', name: 'Келих червоного вина', description: 'Каберне Совіньйон, Одеська обл. — 150 мл', price: 165, weight: 150, calories: 125, prep: 2, image: img('photo-1510812431401-41d2bd2722f3'), veg: true, tags: ['вино'], allergens: ['сульфіти'] },
  { key: 'whitewine', category: 'cocktails', name: 'Келих білого вина', description: 'Шардоне, Закарпаття — 150 мл', price: 155, weight: 150, calories: 120, prep: 2, image: img('photo-1566995541428-f2246c17cda1'), veg: true, tags: ['вино'], allergens: ['сульфіти'] },
];

/** Типові пари для генерації історії — на них recommendation engine вивчає «часто замовляють разом» */
export const PAIRINGS: Record<string, { key: string; p: number }[]> = {
  ribeye: [{ key: 'redwine', p: 0.75 }, { key: 'fries', p: 0.3 }],
  duck: [{ key: 'redwine', p: 0.6 }],
  salmon: [{ key: 'whitewine', p: 0.65 }],
  seafood: [{ key: 'whitewine', p: 0.55 }],
  burger: [{ key: 'fries', p: 0.75 }, { key: 'lemonade', p: 0.4 }],
  ribs: [{ key: 'fries', p: 0.5 }],
  margherita: [{ key: 'lemonade', p: 0.5 }],
  pepperoni: [{ key: 'lemonade', p: 0.45 }, { key: 'mojito', p: 0.25 }],
  fourcheese: [{ key: 'aperol', p: 0.35 }],
  carbonara: [{ key: 'aperol', p: 0.4 }, { key: 'tiramisu', p: 0.35 }],
  risotto: [{ key: 'whitewine', p: 0.4 }],
  borsch: [{ key: 'varenyky', p: 0.45 }],
  syrnyky: [{ key: 'cappuccino', p: 0.8 }],
  frenchtoast: [{ key: 'cappuccino', p: 0.6 }],
  avotoast: [{ key: 'matcha', p: 0.4 }, { key: 'orange', p: 0.4 }],
  granola: [{ key: 'orange', p: 0.5 }],
  tiramisu: [{ key: 'cappuccino', p: 0.6 }],
  fondant: [{ key: 'cappuccino', p: 0.4 }],
  cheese: [{ key: 'redwine', p: 0.6 }],
  bruschetta: [{ key: 'aperol', p: 0.4 }],
};

export const TABLES: { number: number; seats: number; zone: TableZone; shape: TableShape; posX: number; posY: number; description?: string }[] = [
  { number: 1, seats: 2, zone: 'HALL', shape: 'ROUND', posX: 11, posY: 16, description: 'Біля вікна' },
  { number: 2, seats: 2, zone: 'HALL', shape: 'ROUND', posX: 11, posY: 42, description: 'Біля вікна' },
  { number: 3, seats: 4, zone: 'HALL', shape: 'SQUARE', posX: 30, posY: 16 },
  { number: 4, seats: 4, zone: 'HALL', shape: 'SQUARE', posX: 30, posY: 42 },
  { number: 5, seats: 6, zone: 'HALL', shape: 'RECT', posX: 51, posY: 16, description: 'Великий стіл у центрі зали' },
  { number: 6, seats: 4, zone: 'HALL', shape: 'SQUARE', posX: 51, posY: 42 },
  { number: 7, seats: 8, zone: 'VIP', shape: 'RECT', posX: 84, posY: 18, description: 'VIP-зала, приватна атмосфера' },
  { number: 8, seats: 6, zone: 'VIP', shape: 'RECT', posX: 84, posY: 45, description: 'VIP-зала з каміном' },
  { number: 9, seats: 2, zone: 'BAR', shape: 'ROUND', posX: 9, posY: 80, description: 'За барною стійкою' },
  { number: 10, seats: 2, zone: 'BAR', shape: 'ROUND', posX: 24, posY: 80, description: 'За барною стійкою' },
  { number: 11, seats: 4, zone: 'TERRACE', shape: 'SQUARE', posX: 46, posY: 81, description: 'Тераса з видом на площу' },
  { number: 12, seats: 4, zone: 'TERRACE', shape: 'SQUARE', posX: 61, posY: 81 },
  { number: 13, seats: 2, zone: 'TERRACE', shape: 'ROUND', posX: 75, posY: 81 },
  { number: 14, seats: 6, zone: 'TERRACE', shape: 'RECT', posX: 89, posY: 81, description: 'Великий стіл на терасі' },
];

export const VISIT_COMMENTS: { rating: number; text: string }[] = [
  { rating: 5, text: 'Неймовірний вечір! Замовлення з телефона прямо за столиком — це дуже зручно.' },
  { rating: 5, text: 'Борщ як у бабусі, а сервіс — європейський. Обовʼязково повернемось.' },
  { rating: 5, text: 'Забронювали столик за хвилину, QR check-in спрацював миттєво. Стейк — топ!' },
  { rating: 5, text: 'Дуже сподобалось бачити статус страви в реальному часі. Все принесли гарячим.' },
  { rating: 4, text: 'Смачно і затишно, трохи довелось почекати на десерт у пʼятницю.' },
  { rating: 5, text: 'Найкраще тірамісу в місті. Офіціант Андрій — просто супер.' },
  { rating: 4, text: 'Гарна тераса та коктейлі. Музика могла б бути тихішою.' },
  { rating: 5, text: 'Оплата карткою прямо в застосунку — не треба чекати на рахунок. Геніально!' },
  { rating: 3, text: 'Їжа смачна, але в суботу було галасливо і довго чекали на гарячу страву.' },
  { rating: 5, text: 'Святкували день народження у VIP-залі — все ідеально організовано.' },
  { rating: 4, text: 'Рекомендації в меню влучили — взяли вино до стейку, і не пошкодували.' },
  { rating: 5, text: 'Сирники на сніданок і капучино — ідеальний початок дня.' },
];
