const legacy = Object.freeze({
  materials: 'auto', surfaceDetail:'off', relief:'off', bakedAO:'off', anisotropy: 'auto', lighting: 'legacy', ao: 'off', contact: 'off',
  bloom: 'off', atmosphere: 'off', grade: 'standard', gradeMix: '100',
  motionBlur:'off', depthOfField:'off', lensFlare:'off', chromatic:'off',
  contrast: '100', saturation: '100', vignette: 'legacy', grain: 'legacy',
  sky: 'legacy', water: 'legacy', reflections:'off', shadowFilter: 'auto', shadowDistance: 'auto',
  smoke:'legacy', softParticles:'off', explosions:'legacy', particleLighting:'off',
  adaptiveTarget:'off',adaptiveFloor:'balanced',adaptiveMinScale:'65',adaptiveClarity:'on',
});

const ultra = Object.freeze({
  ...legacy, surfaceDetail:'high',relief:'low',bakedAO:'high',cascades:'ultra', lighting: 'enhanced', ao: 'gtao', contact: 'high', bloom: 'high',
  atmosphere: 'ultra', grade: 'natural', vignette: 'off', grain: 'off',
  sky: 'high', water: 'high', reflections:'high', smoke:'high', softParticles:'high', explosions:'high', particleLighting:'high',
});

export const GRAPHICS_PRESETS = Object.freeze({ legacy, low: legacy, medium: legacy, high: legacy, ultra });
export const LEGACY_GRAPHICS_DEFAULTS = Object.freeze({
  shadows:'auto',resolution:'auto',detail:'auto',fsr:'off',fsrQuality:'quality',fsrSharpness:40,frameGeneration:'off',aa:'auto',
});
export const baseGraphicsQuality = value => value === 'ultra' || value === 'legacy' ? 'high' : Object.hasOwn(GRAPHICS_PRESETS, value) ? value : 'high';
export const GEOMETRY_QUALITY = Object.freeze(['low','medium','high']);
export const geometryQuality = (preset, detail='auto') =>
  GEOMETRY_QUALITY.includes(detail)?detail:baseGraphicsQuality(preset);

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
    ['atmosphere', 'Атмосферное рассеивание', 'Добавляет высотную дымку и экранные солнечные лучи. Дорогой эффект на высоких уровнях.', choices(off, low, medium, high, ['ultra','Ультра'])],
    ['shadowFilter', 'Фильтрация теней', 'Мягкая фильтрация сглаживает края теней.', choices(auto, ['hard', 'Жёсткая'], ['pcf', 'PCF'], ['soft', 'Мягкая PCF'], ['pcss', 'Переменная мягкость · PCSS'])],
    ['shadowDistance', 'Область динамических теней', 'Дальняя область покрывает больше сцены и снижает детализацию карты теней.', choices(auto, ['near', 'Ближе'], ['far', 'Дальше'])],
  ]],
  ['Материалы и окружение', [
    ['materials', 'Материалы', 'Высокое качество использует PBR и рельеф поверхности.', choices(auto, low, high)],
    ['surfaceDetail', 'Фактуры окружения', 'Карты цвета, рельефа и шероховатости для камня, песка, бетона и асфальта.', choices(off, ['medium', '512 px'], ['high', '1024 px'])],
    ['relief','Параллакс-рельеф','Добавляет видимую глубину камню и бетону при включённых фактурах окружения.',choices(off,['basic','Базовый'],['low','POM · 8 шагов'],['high','POM · 16 шагов'])],
    ['anisotropy', 'Анизотропная фильтрация', 'Повышает чёткость текстур под острым углом. Умеренная нагрузка.', choices(auto, ['1', 'Выкл.'], ...[2, 4, 8, 16].map(n => [String(n), n+'×']))],
    ['sky', 'Небо', 'Добавляет солнечный диск и атмосферное рассеивание. Умеренная нагрузка.', choices(old, high)],
    ['reflections', 'Экранные отражения воды', 'Отражает близкое окружение на воде в порту. Другие карты используют отражение неба.', choices(off,low,medium,high)],
    ['water', 'Вода', 'Добавляет нормали волн и отражение неба там, где есть вода.', choices(old, high)],
  ]],
  ['Постобработка', [
    ['bloom', 'Свечение HDR', 'Смягчает яркие блики и эмиссивные источники. Чем выше качество, тем шире свечение.', choices(off, low, medium, high, ['ultra', 'Ультра'])],
    ['grade', 'Цветокоррекция', 'Профили слегка меняют баланс цветов с учётом карты.', choices(off, ['standard', 'Стандартная'], ['natural', 'Естественная'], ['cinematic', 'Кинематографическая'])],
    ['gradeMix', 'Интенсивность цветокоррекции', 'Сила выбранного цветового профиля.', [0, 100]],
    ['contrast', 'Контраст', 'Контраст после тонального преобразования.', [75, 125]],
    ['saturation', 'Насыщенность', 'Насыщенность после тонального преобразования.', [0, 150]],
    ['vignette', 'Виньетка', 'Затемняет края изображения.', choices(old, off, low, high)],
    ['motionBlur','Смаз движения камеры','Смазывает быстрое движение камеры в заставках и меню.',choices(off,low,medium,high)],
    ['depthOfField','Глубина резкости','Фокусируется по центру кадра в сюжетных и свободных камерах.',choices(off,['cinematics','В заставках'],['on','В заставках и меню'])],
    ['lensFlare','Блики объектива','Добавляет блик от солнца, если его видно в кадре.',choices(off,low,high)],
    ['chromatic','Цветовое разделение','Слегка разделяет цветовые каналы по краям кадра.',choices(off,low)],
    ['grain', 'Зерно', 'Добавляет мелкое зерно поверх изображения.', choices(old, off, low, high)],
  ]],
  ['Эффекты', [
    ['smoke','Дым','Добавляет неоднородность и движение мелких облаков дыма.',choices(old,high)],
    ['softParticles','Мягкие частицы','Плавно скрывает дым при пересечении с поверхностями. Добавляет проход при наличии дыма.',choices(off,high)],
    ['particleLighting','Освещение дыма','Имитирует рассеивание света на частицах со стороны солнца.',choices(off,high)],
    ['explosions','Взрывы','Добавляет короткую HDR-вспышку и детализированный шлейф дыма.',choices(old,high)],
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
