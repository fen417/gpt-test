# М03 «Колонна» — промпты для Suno

Для всех шести дорожек включи **Instrumental**. Промпты рассчитаны на поле стиля. Общая палитра — сдержанная оркестровая музыка для военного шутера в ре миноре. Основной мотив — три нисходящие ноты. Под голосом мелодия и ударные остаются на втором плане.

## `convoy.ogg` — путь к Тель-Мазину

> Instrumental cinematic military underscore for an armored column at dawn on a desert road. D minor, 72 BPM, 4/4. Low cello and bass clarinet, restrained frame drum, distant muted French horn on a three-note descending motif. Begin intimate and weary, with room for people talking over the engine. Gradually let the pulse and harmonic tension grow as the village approaches, then hold unresolved tension. Sparse foreground, warm acoustic room, no voices, radio chatter, vehicle effects, EDM or bombastic climax.

Возьми отрезок около **100 секунд**. Игра сама приглушит его между 1:20 и 1:40. Избегай отчётливой кульминации до 1:20.

## `ambush-hit.ogg` — первый удар

> Instrumental orchestral stinger for the instant an armored convoy is ambushed. One very short inhaling reverse swell followed by one dry, tight low-string and muted brass impact with a single low drum accent. Dark D minor color, abrupt cutoff, extremely short release. No melody after the hit, no repeating hits, no other instruments, no voices, no gunfire, no explosion, no radio sounds.

Из генерации вырежи один акцент с коротким хвостом. Игра запускает файл вместе со взрывом ведущего танка, так что атака нужна с первых миллисекунд. Основная боевая тема включается через **0,4 с**.

## `combat.ogg` — основной бой

> Seamless instrumental tactical shooter combat loop, D minor, exactly 140 BPM, 4/4. Enter immediately on beat one. Dry spiccato cello ostinato, staccato violas, tense low bass and sparse muted brass calls using a descending three-note motif. Relentless, controlled urgency for street fights and room clearing. Keep the middle frequencies open for shouting and gunfire. Steady groove and harmonic tension throughout; no intro, breakdown, final cadence, tempo drift, prominent drums, vocals or sound effects. End where the first bar can repeat naturally.

Удобная длина — **40 тактов, 1:08.57**. Начало точно на первой доле. Стык нужно проверить повтором в редакторе.

## `combat-drums.ogg` — слой для открытого боя

> Isolated instrumental percussion stem for the same tactical combat cue, exactly 140 BPM, 4/4, 40 bars. Same tight first downbeat and bar grid as the underlying orchestral loop. Low field drums, restrained military snare, short tom syncopation and occasional dry rim clicks. Keep a consistent pulse and leave empty space between accents. Drums only, no melody, no bass line, no sustained cymbals, no vocal chants, no effects, no fills across the loop seam.

В игре слой звучит одновременно с `combat.ogg`. Самый надёжный вариант — сделать оба файла из одной сессии и выгнать ударные отдельной дорожкой. При независимой генерации подгони в редакторе первую долю, сетку и длину до полного совпадения. Оба файла должны начинаться и заканчиваться на тех же семплах при одинаковой частоте дискретизации.

## `interior.ogg` — зачистка комнат

> Seamless instrumental stealth-tension loop for entering shuttered rooms in a desert town after a firefight. D minor, 70 BPM, 4/4. Close low viola tremolo, bass clarinet breath textures, a barely audible cloth-muted frame drum and fragmented descending three-note motif. Quiet, dry and close, with intervals of space for footsteps and directional sound. Uneasy anticipation without obvious horror stings. No vocals, no gunfire, no Foley, no big percussion, no resolved ending.

Возьми ровную петлю **60–90 секунд**. Уровень ощутимо тише боевой дорожки, чтобы внутри было слышно, где ходят враги.

## `finale.ogg` — карта у Харранти

> Restrained instrumental orchestral aftermath for a tired squad holding a village headquarters at a cost. D minor, 64 BPM, 4/4. Start with solo cello and soft sustained strings, bring in distant muted horn answering the same three-note descending motif. Convey relief and loss at the same time; end with quiet forward momentum toward the next mission. Dialogue-friendly from the first second, with no triumphant fanfare, choir, vocals, giant percussion, or loud final hit.

Главный характер должен читаться в первые **8–12 секунд** под диалогом. Оставь спокойную петлю без паузы в начале и без громкой концовки. Готовые OGG положи в `public/campaign/m03/music/`. Общий бюджет шести файлов — **3 МБ**.
