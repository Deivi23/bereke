import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'ru' | 'kk'

const ru = {
  appName: 'Береке',
  navCheck: 'Цена',
  navProducts: 'Товары',
  navReceive: 'Приход',
  navLabels: 'Ценники',
  navMore: 'Ещё',

  // Проверка цены
  checkTitle: 'Проверка цены',
  scanHint: 'Наведите камеру на штрихкод',
  startCamera: 'Включить камеру',
  stopCamera: 'Выключить камеру',
  manualCode: 'Или введите / отсканируйте код',
  find: 'Найти',
  notFound: 'Товар не найден',
  addProduct: 'Добавить товар',
  inStock: 'В наличии',
  buyPriceLabel: 'Закупка',
  margin: 'Наценка',
  edit: 'Изменить',
  cameraError: 'Нет доступа к камере. Разрешите камеру в настройках браузера.',
  code: 'Код',

  // Товары
  productsTitle: 'Товары',
  search: 'Поиск по названию или коду',
  all: 'Все',
  lowStock: 'Мало',
  noPrice: 'Без цены',
  noProducts: 'Товаров пока нет. Добавьте первый или импортируйте из файла.',
  showMore: 'Показать ещё',
  pcs: 'шт',
  kg: 'кг',
  unitPcs: 'Штучный',
  unitKg: 'На вес (кг)',
  total: 'Всего',

  // Форма товара
  newProduct: 'Новый товар',
  editProduct: 'Товар',
  name: 'Название',
  category: 'Категория',
  barcodes: 'Штрихкоды',
  addBarcode: 'Добавить код',
  scanBarcode: 'Сканировать',
  generateCode: 'Свой код',
  generateHint: 'Для товаров без штрихкода — создать свой и напечатать на ценнике',
  unit: 'Единица',
  buyPrice: 'Закупочная цена',
  sellPrice: 'Цена продажи',
  stock: 'Остаток',
  minStock: 'Минимальный остаток',
  save: 'Сохранить',
  cancel: 'Отмена',
  delete: 'Удалить',
  confirmDelete: 'Удалить товар?',
  codeExists: 'Этот код уже есть у товара:',
  nameRequired: 'Введите название',
  saved: 'Сохранено',

  // Приход
  receiveTitle: 'Приход товара',
  supplier: 'Поставщик',
  scanItems: 'Сканируйте товары по одному',
  qty: 'Кол-во',
  newSell: 'Новая цена',
  lines: 'Позиций',
  sum: 'Сумма закупки',
  commit: 'Провести приход',
  receiptDone: 'Приход проведён',
  emptyReceipt: 'Отсканируйте товары, чтобы добавить в приход',
  quickAdd: 'Новый товар — быстро добавить',
  history: 'Последние приходы',
  remove: 'Убрать',
  unknownCode: 'Код не найден в базе',

  // Ценники
  labelsTitle: 'Ценники',
  needReprint: 'Нужно напечатать (цена изменилась или ценника не было)',
  addToPrint: 'Добавить товар в печать',
  copies: 'Копий',
  print: 'Печать',
  markPrinted: 'Отметить напечатанными',
  nothingToPrint: 'Нет ценников для печати',
  labelsPerPage: 'Ценников на листе A4: 24 (3×8). Печатайте масштабом 100%.',
  perKg: 'за кг',
  clearList: 'Очистить',
  addAllNeeded: 'Добавить все новые',

  // Ещё
  moreTitle: 'Настройки',
  language: 'Язык',
  backup: 'Резервная копия',
  backupHint: 'Данные хранятся на этом устройстве. Делайте копию регулярно.',
  export: 'Скачать копию',
  import: 'Загрузить копию',
  importWarn: 'Все текущие данные будут заменены. Продолжить?',
  importDone: 'Загружено',
  importError: 'Не удалось прочитать файл',
  csvTitle: 'Импорт товаров из таблицы',
  csvHint: 'CSV-файл (из Excel: «Сохранить как → CSV»). Первая строка — заголовки: штрихкод; название; цена; закупка; остаток; категория; единица.',
  csvButton: 'Выбрать CSV',
  csvDone: 'Импортировано товаров',
  csvSkipped: 'пропущено',
  csvExport: 'Скачать товары в CSV',
  storage: 'Хранилище',
  storageOk: 'Защищено от автоочистки браузером',
  storageWarn: 'Браузер может очистить данные. Установите приложение на главный экран.',
  install: 'Установить на главный экран',
  tenge: '₸',
} as const

export type Dict = Record<keyof typeof ru, string>

const kk: Dict = {
  appName: 'Береке',
  navCheck: 'Баға',
  navProducts: 'Тауарлар',
  navReceive: 'Кіріс',
  navLabels: 'Бағалар',
  navMore: 'Тағы',

  checkTitle: 'Бағаны тексеру',
  scanHint: 'Камераны штрихкодқа бағыттаңыз',
  startCamera: 'Камераны қосу',
  stopCamera: 'Камераны өшіру',
  manualCode: 'Немесе кодты енгізіңіз / сканерлеңіз',
  find: 'Іздеу',
  notFound: 'Тауар табылмады',
  addProduct: 'Тауар қосу',
  inStock: 'Қалдық',
  buyPriceLabel: 'Сатып алу',
  margin: 'Үстеме',
  edit: 'Өзгерту',
  cameraError: 'Камераға рұқсат жоқ. Браузер баптауларында камераға рұқсат беріңіз.',
  code: 'Код',

  productsTitle: 'Тауарлар',
  search: 'Атауы немесе коды бойынша іздеу',
  all: 'Барлығы',
  lowStock: 'Аз',
  noPrice: 'Бағасыз',
  noProducts: 'Әзірге тауар жоқ. Біріншісін қосыңыз немесе файлдан импорттаңыз.',
  showMore: 'Тағы көрсету',
  pcs: 'дана',
  kg: 'кг',
  unitPcs: 'Данамен',
  unitKg: 'Салмақпен (кг)',
  total: 'Барлығы',

  newProduct: 'Жаңа тауар',
  editProduct: 'Тауар',
  name: 'Атауы',
  category: 'Санат',
  barcodes: 'Штрихкодтар',
  addBarcode: 'Код қосу',
  scanBarcode: 'Сканерлеу',
  generateCode: 'Өз кодым',
  generateHint: 'Штрихкоды жоқ тауарға өз кодыңызды жасап, бағалыққа басып шығарыңыз',
  unit: 'Өлшем бірлігі',
  buyPrice: 'Сатып алу бағасы',
  sellPrice: 'Сату бағасы',
  stock: 'Қалдық',
  minStock: 'Ең аз қалдық',
  save: 'Сақтау',
  cancel: 'Болдырмау',
  delete: 'Жою',
  confirmDelete: 'Тауарды жою керек пе?',
  codeExists: 'Бұл код мына тауарда бар:',
  nameRequired: 'Атауын енгізіңіз',
  saved: 'Сақталды',

  receiveTitle: 'Тауар кірісі',
  supplier: 'Жеткізуші',
  scanItems: 'Тауарларды бір-бірлеп сканерлеңіз',
  qty: 'Саны',
  newSell: 'Жаңа баға',
  lines: 'Позиция',
  sum: 'Сатып алу сомасы',
  commit: 'Кірісті өткізу',
  receiptDone: 'Кіріс өткізілді',
  emptyReceipt: 'Кіріске қосу үшін тауарларды сканерлеңіз',
  quickAdd: 'Жаңа тауар — жылдам қосу',
  history: 'Соңғы кірістер',
  remove: 'Алып тастау',
  unknownCode: 'Код базада жоқ',

  labelsTitle: 'Бағалықтар',
  needReprint: 'Басып шығару керек (баға өзгерген немесе бағалық жоқ)',
  addToPrint: 'Тауарды баспаға қосу',
  copies: 'Дана',
  print: 'Басып шығару',
  markPrinted: 'Басылған деп белгілеу',
  nothingToPrint: 'Басып шығаратын бағалық жоқ',
  labelsPerPage: 'A4 парағында 24 бағалық (3×8). Масштабы 100% болуы керек.',
  perKg: 'кг үшін',
  clearList: 'Тазалау',
  addAllNeeded: 'Барлық жаңаларын қосу',

  moreTitle: 'Баптаулар',
  language: 'Тіл',
  backup: 'Сақтық көшірме',
  backupHint: 'Деректер осы құрылғыда сақталады. Көшірмені жиі жасап тұрыңыз.',
  export: 'Көшірмені жүктеу',
  import: 'Көшірмені жүктеп салу',
  importWarn: 'Қазіргі барлық деректер ауыстырылады. Жалғастыру керек пе?',
  importDone: 'Жүктелді',
  importError: 'Файлды оқу мүмкін болмады',
  csvTitle: 'Кестеден тауар импорттау',
  csvHint: 'CSV файл (Excel: «Басқаша сақтау → CSV»). Бірінші жол — тақырыптар: штрихкод; название; цена; закупка; остаток; категория; единица.',
  csvButton: 'CSV таңдау',
  csvDone: 'Импортталған тауар',
  csvSkipped: 'өткізілді',
  csvExport: 'Тауарларды CSV-ға жүктеу',
  storage: 'Жад',
  storageOk: 'Браузердің автотазалауынан қорғалған',
  storageWarn: 'Браузер деректерді тазалауы мүмкін. Қолданбаны басты экранға орнатыңыз.',
  install: 'Басты экранға орнату',
  tenge: '₸',
}

const dicts: Record<Lang, Dict> = { ru: ru as unknown as Dict, kk }

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: keyof Dict) => string
}

const Ctx = createContext<I18n>(null as never)

function loadLang(): Lang {
  try {
    const v = localStorage.getItem('lang')
    if (v === 'ru' || v === 'kk') return v
  } catch {
    /* ignore */
  }
  return 'ru'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang)
  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('lang', l)
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l
  }
  const t = (key: keyof Dict) => dicts[lang][key]
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)

/** 1250 -> «1 250 ₸» */
export function money(n: number): string {
  const v = Math.round(n * 100) / 100
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₸'
}

export function qtyText(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}
