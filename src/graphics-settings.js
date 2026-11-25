const legacy = Object.freeze({
  materials: 'auto', surfaceDetail:'off', mapWeathering:'off', relief:'off', bakedAO:'off', anisotropy: 'auto', lighting: 'legacy', ao: 'off', contact: 'off',
  bloom: 'off', atmosphere: 'off', grade: 'standard', gradeMix: '100',
  motionBlur:'off', depthOfField:'off', lensFlare:'off', chromatic:'off',
  contrast: '100', saturation: '100', vignette: 'legacy', grain: 'legacy',
  sky: 'legacy', water: 'legacy', reflections:'off', localReflections:'off', shadowFilter: 'auto', shadowDistance: 'auto',
  smoke:'legacy', heatDistortion:'off', softParticles:'off', explosions:'legacy', particleLighting:'off',
  adaptiveTarget:'off',adaptiveFloor:'balanced',adaptiveMinScale:'65',adaptiveClarity:'on',
});

const ultra = Object.freeze({
  ...legacy, surfaceDetail:'ultra',mapWeathering:'high',relief:'low',bakedAO:'high',cascades:'ultra', lighting: 'enhanced', ao: 'gtao', contact: 'high', bloom: 'high',
  atmosphere: 'ultra', grade: 'natural', vignette: 'off', grain: 'off',
  sky: 'high', water: 'high', reflections:'high', localReflections:'high', smoke:'high', heatDistortion:'high', softParticles:'high', explosions:'high', particleLighting:'high',
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
    ['atmosphere', 'Атмосферное рассеивание', 'Добавляет высотную дымку и солнечные лучи. Высокие уровни учитывают перекрытие света при включённых каскадных тенях.', choices(off, low, medium, high, ['ultra','Ультра'])],
    ['shadowFilter', 'Фильтрация теней', 'Мягкая фильтрация сглаживает края теней.', choices(auto, ['hard', 'Жёсткая'], ['pcf', 'PCF'], ['soft', 'Мягкая PCF'], ['pcss', 'Переменная мягкость · PCSS'])],
    ['shadowDistance', 'Область динамических теней', 'Дальняя область покрывает больше сцены и снижает детализацию карты теней.', choices(auto, ['near', 'Ближе'], ['far', 'Дальше'])],
  ]],
  ['Материалы и окружение', [
    ['materials', 'Материалы', 'Высокое качество использует PBR и рельеф поверхности.', choices(auto, low, high)],
    ['surfaceDetail', 'Фактуры окружения', 'Сжатые PBR-фактуры окружения. Ультра использует 4K только для крупных поверхностей; без аппаратного сжатия действует ограничение 2K.', choices(off, ['medium', '512 px'], ['standard', '1024 px'], ['high', '2048 px'], ['ultra','До 4096 px'])],
    ['mapWeathering','Износ и разнообразие поверхностей','Пыль, пятна и мелкие трещины с учётом карты.',choices(off,low,high)],
    ['relief','Параллакс-рельеф','Добавляет видимую глубину камню и бетону при включённых фактурах окружения.',choices(off,['basic','Базовый'],['low','POM · 8 шагов'],['high','POM · 16 шагов'])],
    ['anisotropy', 'Анизотропная фильтрация', 'Повышает чёткость текстур под острым углом. Умеренная нагрузка.', choices(auto, ['1', 'Выкл.'], ...[2, 4, 8, 16].map(n => [String(n), n+'×']))],
    ['sky', 'Небо', 'Добавляет солнечный диск и атмосферное рассеивание. Умеренная нагрузка.', choices(old, high)],
    ['reflections', 'Экранные отражения', 'Отражает видимое окружение на воде и отмеченных глянцевых поверхностях.', choices(off,low,medium,high)],
    ['localReflections', 'Локальные отражения', 'Отражает окружение на воде, стекле и металле в отдельных зонах порта, «Лагуны» и Linden Estate.', choices(off,high)],
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
    ['heatDistortion','Марево','Искажает воздух над огнём и вспышками. При прицеливании отключается.',choices(off,high)],
    ['explosions','Взрывы','Добавляет короткую HDR-вспышку и детализированный шлейф дыма.',choices(old,high)],
  ]],
  ['Производительность', [
    ['adaptiveTarget', 'Адаптивное качество', 'После устойчивой нагрузки уменьшает качество отдельных эффектов.', choices(off, ...[30,45,60,90,120].map(n=>[String(n),n+' FPS']))],
    ['adaptiveFloor', 'Предел упрощения эффектов', 'Сбалансированный режим оставляет часть эффектов активными.', choices(['balanced','Сбалансированный'],['minimum','Минимальный'])],
    ['adaptiveMinScale', 'Минимальный масштаб', 'Предел для адаптивного масштаба. Действует в режимах «Авто».', [50, 100]],
    ['adaptiveClarity', 'Приоритет чёткости', 'Удерживает масштаб изображения при адаптивном качестве.', choices(['on','Вкл.'],off)],
  ]],
];

export const GRAPHICS_GROUPS = [
  ['smallShadows','Мелкие тени','Экранное и запечённое затенение, контактные тени.', ['ao','contact','bakedAO'], {
    off:['Выкл.','off','off','off'], low:['Низкие','low','low','low'],
    high:['Высокие','high','medium','high'], ultra:['Ультра','gtao','high','high'],
  }],
  ['shadowStyle','Мягкость и дальность теней','Фильтр и размер области динамических теней.', ['shadowFilter','shadowDistance'], {
    auto:['Авто','auto','auto'], fast:['Ближние', 'hard','near'], soft:['Мягкие','soft','auto'], far:['Мягкие дальние','pcss','far'],
  }],
  ['surfaceQuality','Качество поверхностей','Материалы, чёткость фактур и глубина рельефа.', ['materials','surfaceDetail','relief','mapWeathering'], {
    auto:['Как раньше','auto','off','off','off'], low:['Облегчённое','low','off','off','off'], medium:['Среднее','auto','standard','basic','low'],
    high:['Высокое','auto','high','low','high'], ultra:['Ультра','auto','ultra','high','high'],
  }],
  ['skyQuality','Небо и атмосфера','Облака, солнечный диск, лучи и дымка.', ['sky','atmosphere'], {
    legacy:['Как раньше','legacy','off'], low:['Низкое','high','low'], medium:['Среднее','high','medium'], high:['Высокое','high','high'], ultra:['Ультра','high','ultra'],
  }],
  ['reflectionQuality','Вода и отражения','Волны, экранные отражения и местное окружение.', ['reflections','localReflections','water'], {
    legacy:['Как раньше','off','off','legacy'], local:['Локальные','off','high','high'],
    low:['Низкие','low','high','high'], medium:['Средние','medium','high','high'], high:['Высокие','high','high','high'],
  }],
  ['cinematicCamera','Камера в заставках','Смаз движения и глубина резкости.', ['motionBlur','depthOfField'], {
    off:['Выкл.','off','off'], low:['Лёгкий эффект','low','cinematics'], high:['Заставки и меню','medium','on'],
  }],
  ['lens','Эффекты объектива','Солнечные блики и цветное разделение по краям кадра.', ['lensFlare','chromatic'], {
    off:['Выкл.','off','off'], low:['Слабые','low','off'], high:['Выраженные','high','low'],
  }],
  ['film','Виньетка и зерно','Затемнение краёв и текстура кадра.', ['vignette','grain'], {
    legacy:['Как раньше','legacy','legacy'], off:['Выкл.','off','off'], low:['Слабые','low','low'], high:['Выраженные','high','high'],
  }],
  ['smokeQuality','Качество дыма','Детализация, освещение и мягкие края частиц.', ['smoke','softParticles','particleLighting'], {
    legacy:['Как раньше','legacy','off','off'], medium:['Среднее','high','off','high'], high:['Высокое','high','high','high'],
  }],
  ['explosionQuality','Взрывы и марево','Вспышки, шлейфы и искажение воздуха над огнём.', ['explosions','heatDistortion'], {
    legacy:['Как раньше','legacy','off'], medium:['Среднее','high','off'], high:['Высокое','high','high'],
  }],
  ['adaptivePolicy','Приоритет адаптации','До какого уровня можно упрощать эффекты и масштаб.', ['adaptiveFloor','adaptiveMinScale','adaptiveClarity'], {
    clarity:['Чёткость','balanced','65','on'], balanced:['Баланс','balanced','65','off'], fps:['Частота кадров','minimum','50','off'],
  }],
];

export function graphicsGroupValue(fields, modes, settings) {
  return Object.keys(modes).find(mode=>fields.every((field,index)=>settings[field]===modes[mode][index+1]))??'mixed';
}

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
