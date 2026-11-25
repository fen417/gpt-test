const legacy = Object.freeze({
  materials: 'auto', surfaceDetail:'off', mapWeathering:'off', vegetation:'legacy', grassDensity:'off', grassDistance:'20', vegetationWind:'off', vegetationShadows:'off', foliageTransmission:'off', relief:'off', bakedAO:'off', anisotropy: 'auto', lighting: 'legacy', gi:'off', architectureLight:'off', architectureAO:'off', ao: 'off', contact: 'off',
  bloom: 'off', atmosphere: 'off', grade: 'standard', gradeMix: '100',
  motionBlur:'off', depthOfField:'off', lensFlare:'off', chromatic:'off',
  contrast: '100', saturation: '100', vignette: 'legacy', grain: 'legacy',
  sky: 'legacy', clouds:'off', heightFog:'off', water: 'legacy', waterRefraction:'off', waterFoam:'off', reflections:'off', localReflections:'off', shadowFilter: 'auto', shadowDistance: 'auto',
  smoke:'legacy', heatDistortion:'off', softParticles:'off', explosions:'legacy', particleLighting:'off', muzzleEffects:'legacy', muzzleLights:'off', fireEffects:'legacy', fireLighting:'off', dust:'off',
  shaderWarmup:'auto',adaptiveTarget:'off',adaptiveFloor:'balanced',adaptiveMinScale:'65',adaptiveClarity:'on',
});

const ultra = Object.freeze({
  ...legacy, shaderWarmup:'full',surfaceDetail:'ultra',mapWeathering:'high',vegetation:'ultra',grassDensity:'100',grassDistance:'100',vegetationWind:'high',vegetationShadows:'high',foliageTransmission:'high',relief:'low',bakedAO:'high',cascades:'ultra', lighting: 'enhanced', gi:'high', architectureLight:'high', architectureAO:'high', ao: 'gtao', contact: 'high', bloom: 'high',
  atmosphere: 'ultra', grade: 'natural', vignette: 'off', grain: 'off',
  sky: 'high', clouds:'high', heightFog:'high', water: 'high', waterRefraction:'high', waterFoam:'high', reflections:'high', localReflections:'high', smoke:'high', heatDistortion:'high', softParticles:'high', explosions:'high', particleLighting:'high', muzzleEffects:'high', muzzleLights:'high', fireEffects:'high', fireLighting:'high', dust:'high',
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
    ['gi','Глобальное освещение (GI)','Запечённый непрямой свет и затенение от стен и крыш. Низкое — ближайший слой проб, высокое — плавное смешивание по высоте.',choices(off,low,high)],
    ['ao', 'Экранное затенение (SSAO)', 'Делает заметнее стыки и углубления. GTAO оценивает перекрытие по горизонту.', choices(off, ['low', 'SSAO · низкое'], ['high', 'SSAO · высокое'], ['gtao', 'GTAO'])],
    ['architectureLight','Карты освещения архитектуры','Запечённый рассеянный свет по реальным треугольникам зданий. Не требует дополнительного экранного прохода.',choices(off,low,high)],
    ['architectureAO','Запечённое AO архитектуры','Статические углы, стыки и затенение под крышами. Дополняет AO фактур; работает с PBR и рельефом.',choices(off,low,high)],
    ['bakedAO', 'Запечённое AO материалов', 'Добавляет затенение в порах, швах и углублениях. Расходует текстурную память.', choices(off, low, high)],
    ['contact', 'Контактные тени', 'Уточняет мелкие тени рядом с камерой. Стоимость растёт с числом шагов.', choices(off, low, medium, high)],
    ['atmosphere', 'Атмосферное рассеивание', 'Добавляет высотную дымку и солнечные лучи. Высокие уровни учитывают перекрытие света при включённых каскадных тенях.', choices(off, low, medium, high, ['ultra','Ультра'])],
    ['shadowFilter', 'Фильтрация теней', 'Мягкая фильтрация сглаживает края теней.', choices(auto, ['hard', 'Жёсткая'], ['pcf', 'PCF'], ['soft', 'Мягкая PCF'], ['pcss', 'Переменная мягкость · PCSS'])],
    ['shadowDistance', 'Область динамических теней', 'Дальняя область покрывает больше сцены и снижает детализацию карты теней.', choices(auto, ['near', 'Ближе'], ['far', 'Дальше'])],
  ]],
  ['Материалы и окружение', [
    ['materials', 'Материалы', 'Высокое качество использует PBR и рельеф поверхности.', choices(auto, low, high)],
    ['surfaceDetail', 'Фактуры окружения', 'Сжатые PBR-фактуры окружения. Ультра использует 4K только для крупных поверхностей; без аппаратного сжатия действует ограничение 2K.', choices(off, ['medium', '512 px'], ['standard', '1024 px'], ['high', '2048 px'], ['ultra','До 4096 px'])],
    ['mapWeathering','Износ и разнообразие поверхностей','Профили карт, минеральная пыль, потёки, сколы, окисление и шероховатость. Высокое — локальные детали и обочины дорог.',choices(off,low,high)],
    ['relief','Параллакс-рельеф','Добавляет видимую глубину камню и бетону при включённых фактурах окружения.',choices(off,['basic','Базовый'],['low','POM · 8 шагов'],['high','POM · 16 шагов'])],
    ['anisotropy', 'Анизотропная фильтрация', 'Повышает чёткость текстур под острым углом. Умеренная нагрузка.', choices(auto, ['1', 'Выкл.'], ...[2, 4, 8, 16].map(n => [String(n), n+'×']))],
    ['sky', 'Небо', 'Добавляет солнечный диск, воздушную перспективу горизонта и цвет неба с учётом карты.', choices(old, high)],
    ['clouds','Облака','Движущиеся облака в улучшенном небе: низкие — один слой, средние — второй слой, высокие — детализация и подсветка.',choices(off,low,medium,high)],
    ['heightFog','Высотный туман','Дополнительная дымка у земли с затуханием по высоте и расстоянию. Независимо от лучей.',choices(off,low,high)],
    ['reflections', 'Экранные отражения', 'Отражает видимое окружение на воде и отмеченных глянцевых поверхностях.', choices(off,low,medium,high)],
    ['localReflections', 'Локальные отражения', 'Кэшированные пробы окружения на стекле и металле. Средние 64, высокие 128 px.', choices(off,medium,high)],
    ['water', 'Вода', 'Два масштаба волн, цвет по глубине и отражение неба. Старый режим сохраняет исходный материал.', choices(old,low,medium,high)],
    ['waterRefraction','Преломление воды','Физическая передача света через поверхность бассейнов на высоком качестве воды. Дополнительный проход.',choices(off,high)],
    ['waterFoam','Береговая пена','Нерегулярные светлые полосы на мелководье и у берега. Высокое качество воды.',choices(off,high)],
  ]],
  ['Растительность', [
    ['vegetation','Качество растительности','Новые пальмовые кроны, кустарники и листья с дистанционным LOD. Исходное сохраняет прежнюю карту.',choices(old,low,medium,high,['ultra','Ультра'])],
    ['grassDensity','Густота травы','Количество небольших пучков на подходящей земле.',choices(off,['25','25%'],['50','50%'],['100','100%'])],
    ['grassDistance','Дальность травы','Дальность потоковой загрузки секторов вокруг камеры.',choices(['20','20 м'],['45','45 м'],['70','70 м'],['100','100 м'])],
    ['vegetationWind','Ветер','Колебание вершин на GPU, с неподвижными корнями.',choices(off,low,high)],
    ['vegetationShadows','Тени растительности','Ближние тени крупных растений или полные с ближней травой.',choices(off,low,high)],
    ['foliageTransmission','Просвечивание листвы','Приближённая подсветка тонких листьев со стороны солнца.',choices(off,high)],
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
    ['smoke','Дым','Неоднородные клубы, дрейф и многослойная турбулентность. Высокое качество использует дополнительную выборку текстуры.',choices(old,medium,high)],
    ['muzzleEffects','Дульная вспышка','Нерегулярная яркая вспышка и короткий пороховой дым.',choices(old,high)],
    ['muzzleLights','Освещение от выстрелов','Реальные точечные источники света без теней. Низкое — свои выстрелы, высокое — также ближайшие бойцы и техника (до трёх источников).',choices(off,low,high)],
    ['fireEffects','Огонь','Текстурированные языки пламени и горящие обломки.',choices(old,high)],
    ['fireLighting','Освещение от огня','Локальный мерцающий свет от близких очагов. Общий ограниченный пул света.',choices(off,high)],
    ['dust','Пыль и обломки','Пыль от техники и попаданий, вытянутые искры. Ограничено расстоянием.',choices(off,medium,high)],
    ['softParticles','Мягкие частицы','Плавно скрывает дым при пересечении с поверхностями. Добавляет проход при наличии дыма.',choices(off,high)],
    ['particleLighting','Освещение дыма','Имитирует рассеивание света на частицах со стороны солнца.',choices(off,high)],
    ['heatDistortion','Марево','Искажает воздух над огнём и вспышками. При прицеливании отключается.',choices(off,high)],
    ['explosions','Взрывы','HDR-огненный шар, расходящаяся пыль, искры и клубы дыма.',choices(old,medium,high)],
  ]],
  ['Производительность', [
    ['shaderWarmup','Предкомпиляция шейдеров','Авто — ограниченная подготовка выбранной сцены при загрузке матча. Полная — дольше ждёт PBR/GI и загружает больше текстур. Выкл. — исходный прогрев первого кадра.',choices(off,auto,['full','Полная'])],
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
  ['vegetationQuality','Растительность','Кроны, трава, ветер и тени.', ['vegetation','grassDensity','grassDistance','vegetationWind','vegetationShadows','foliageTransmission'], {
    legacy:['Как раньше','legacy','off','20','off','off','off'],low:['Низкое','low','25','20','off','off','off'],medium:['Среднее','medium','50','45','low','low','off'],high:['Высокое','high','100','70','high','low','high'],ultra:['Ультра','ultra','100','100','high','high','high'],
  }],
  ['skyQuality','Небо и атмосфера','Облака, солнечный диск, лучи и дымка.', ['sky','atmosphere','clouds','heightFog'], {
    legacy:['Как раньше','legacy','off','off','off'], low:['Низкое','high','low','low','off'], medium:['Среднее','high','medium','medium','low'], high:['Высокое','high','high','high','low'], ultra:['Ультра','high','ultra','high','high'],
  }],
  ['reflectionQuality','Вода и отражения','Волны, экранные отражения и местное окружение.', ['reflections','localReflections','water','waterRefraction','waterFoam'], {
    legacy:['Как раньше','off','off','legacy','off','off'], local:['Локальные','off','medium','medium','off','off'],
    low:['Низкие','low','off','low','off','off'], medium:['Средние','medium','medium','medium','off','off'], high:['Высокие','high','high','high','high','high'],
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
    legacy:['Как раньше','legacy','off','off'], medium:['Среднее','medium','off','high'], high:['Высокое','high','high','high'],
  }],
  ['explosionQuality','Взрывы и марево','Вспышки, шлейфы и искажение воздуха над огнём.', ['explosions','heatDistortion','fireEffects','dust'], {
    legacy:['Как раньше','legacy','off','legacy','off'], medium:['Среднее','medium','off','high','medium'], high:['Высокое','high','high','high','high'],
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
