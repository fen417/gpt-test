const legacy = Object.freeze({
  materials: 'auto', surfaceDetail:'off', bakedAO:'off', anisotropy: 'auto', lighting: 'legacy', ao: 'off', contact: 'off',
  bloom: 'off', atmosphere: 'off', grade: 'standard', gradeMix: '100',
  contrast: '100', saturation: '100', vignette: 'legacy', grain: 'legacy',
  sky: 'legacy', water: 'legacy', shadowFilter: 'auto', shadowDistance: 'auto',
  adaptiveTarget:'off',adaptiveFloor:'balanced',adaptiveMinScale:'65',adaptiveClarity:'on',
});

const ultra = Object.freeze({
  ...legacy, surfaceDetail:'high',bakedAO:'high',cascades:'ultra', lighting: 'enhanced', ao: 'gtao', contact: 'high', bloom: 'high',
  atmosphere: 'high', grade: 'natural', vignette: 'off', grain: 'off',
  sky: 'high', water: 'high',
});

export const GRAPHICS_PRESETS = Object.freeze({ low: legacy, medium: legacy, high: legacy, ultra });
export const baseGraphicsQuality = value => value === 'ultra' ? 'high' : Object.hasOwn(GRAPHICS_PRESETS, value) ? value : 'high';
export const isHighGraphics = value => baseGraphicsQuality(value) === 'high';

export function graphicsEffects(preset, custom) {
  return custom ?? GRAPHICS_PRESETS[preset] ?? legacy;
}

const choices = (...entries) => Object.fromEntries(entries);
const off = ['off', 'Выкл.'], auto = ['auto', 'Авто'], old = ['legacy', 'Как раньше'];
const low = ['low', 'Низкое'], medium = ['medium', 'Среднее'], high = ['high', 'Высокое'];
export const GRAPHICS_CONTROLS = [
  ['Освещение и тени', [
    ['lighting', 'Освещение', 'Меняет баланс солнечного и рассеянного света. Почти не влияет на FPS.', choices(old, ['enhanced', 'Улучшенное'])],
    ['ao', 'Экранное затенение (SSAO)', 'Делает заметнее стыки и углубления. GTAO оценивает перекрытие по горизонту.', choices(off, ['low', 'SSAO · низкое'], ['high', 'SSAO · высокое'], ['gtao', 'GTAO'])],
    ['bakedAO', 'Запечённое AO материалов', 'Добавляет затенение в порах, швах и углублениях. Расходует текстурную память.', choices(off, low, high)],
    ['contact', 'Контактные тени', 'Уточняет мелкие тени рядом с камерой. Стоимость растёт с числом шагов.', choices(off, low, medium, high)],
    ['atmosphere', 'Атмосферное рассеивание', 'Усиливает перспективу и ореол у солнца. Высокое качество проверяет перекрытие по глубине.', choices(off, low, high)],
    ['shadowFilter', 'Фильтрация теней', 'Мягкая фильтрация сглаживает края теней.', choices(auto, ['hard', 'Жёсткая'], ['pcf', 'PCF'], ['soft', 'Мягкая PCF'])],
    ['shadowDistance', 'Область динамических теней', 'Дальняя область покрывает больше сцены и снижает детализацию карты теней.', choices(auto, ['near', 'Ближе'], ['far', 'Дальше'])],
  ]],
  ['Материалы и окружение', [
    ['materials', 'Материалы', 'Высокое качество использует PBR и рельеф поверхности.', choices(auto, low, high)],
    ['surfaceDetail', 'Фактуры окружения', 'Карты цвета, рельефа и шероховатости для камня, песка, бетона и асфальта.', choices(off, ['medium', '512 px'], ['high', '1024 px'])],
    ['anisotropy', 'Анизотропная фильтрация', 'Повышает чёткость текстур под острым углом. Умеренная нагрузка.', choices(auto, ['1', 'Выкл.'], ...[2, 4, 8, 16].map(n => [String(n), n+'×']))],
    ['sky', 'Небо', 'Добавляет солнечный диск и атмосферное рассеивание. Умеренная нагрузка.', choices(old, high)],
    ['water', 'Вода', 'Добавляет нормали волн и отражение неба там, где есть вода.', choices(old, high)],
  ]],
  ['Постобработка', [
    ['bloom', 'Свечение HDR', 'Смягчает яркие блики и эмиссивные источники. Чем выше качество, тем шире свечение.', choices(off, low, medium, high, ['ultra', 'Ультра'])],
    ['grade', 'Цветокоррекция', 'Профили слегка меняют баланс цветов с учётом карты.', choices(off, ['standard', 'Стандартная'], ['natural', 'Естественная'], ['cinematic', 'Кинематографическая'])],
    ['gradeMix', 'Интенсивность цветокоррекции', 'Сила выбранного цветового профиля.', [0, 100]],
    ['contrast', 'Контраст', 'Контраст после тонального преобразования.', [75, 125]],
    ['saturation', 'Насыщенность', 'Насыщенность после тонального преобразования.', [0, 150]],
    ['vignette', 'Виньетка', 'Затемняет края изображения.', choices(old, off, low, high)],
    ['grain', 'Зерно', 'Добавляет мелкое зерно поверх изображения.', choices(old, off, low, high)],
  ]],
  ['Производительность', [
    ['adaptiveTarget', 'Адаптивное качество', 'После устойчивой нагрузки уменьшает качество отдельных эффектов.', choices(off, ...[30,45,60,90,120].map(n=>[String(n),n+' FPS']))],
    ['adaptiveFloor', 'Предел упрощения эффектов', 'Сбалансированный режим оставляет часть эффектов активными.', choices(['balanced','Сбалансированный'],['minimum','Минимальный'])],
    ['adaptiveMinScale', 'Минимальный масштаб', 'Предел для адаптивного масштаба. Действует в режимах «Авто».', [50, 100]],
    ['adaptiveClarity', 'Приоритет чёткости', 'Удерживает масштаб изображения при адаптивном качестве.', choices(['on','Вкл.'],off)],
  ]],
];

export function validateCustomGraphics(values, preset) {
  const clean = {...graphicsEffects(preset)};
  for (const [, fields] of GRAPHICS_CONTROLS) {
    for (const [key, , , options] of fields) {
      const value = values?.[key];
      if (typeof value !== 'string') continue;
      if (Array.isArray(options) ? Number.isFinite(Number(value)) && value !== '' && Number(value) >= options[0] && Number(value) <= options[1] : Object.hasOwn(options, value)) {
        clean[key] = value;
      }
    }
  }
  return clean;
}

export function gradeParameters(effects, map) {
  const cinematic = effects.grade === 'cinematic';
  const natural = effects.grade === 'natural';
  const weight = natural || cinematic ? Number(effects.gradeMix) / 100 : 0;
  let tint = [1.013, 1.005, .991];
  if (map?.theme === 'desert-village' || /desert|nahar|mazin|hadra/i.test(map?.id)) tint = [1.027, 1.007, .978];
  else if (map?.id === 'port' || map?.id === 'quarry') tint = [.985, 1.007, 1.021];
  else if (map?.theme === 'pool-day' || map?.theme === 'linden-estate') tint = [1.008, 1, .997];
  return {
    tint: tint.map(channel => 1 + (channel - 1) * weight),
    contrast: Number(effects.contrast) / 100 + (cinematic ? .1 : .035) * weight,
    saturation: Number(effects.saturation) / 100 - (cinematic ? .14 : .035) * weight,
    vignette: {legacy: .08, off: 0, low: .055, high: .14}[effects.vignette],
    grain: {legacy: null, off: 0, low: .003, high: .008}[effects.grain],
  };
}
