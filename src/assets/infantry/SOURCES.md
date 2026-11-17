# Источники моделей и анимаций бойцов SECTOR 09

Исходные GLB получены из [зафиксированного экспорта cktang88/3d-fps](https://github.com/cktang88/3d-fps/tree/130ac2a5c856401ec36e7d35afcfefe40c5801f4/public/assets/models).
В [подписи к экспорту](https://github.com/cktang88/3d-fps/blob/130ac2a5c856401ec36e7d35afcfefe40c5801f4/README.md) сохранены сведения об авторах и предыдущих изменениях.
Контрольные суммы входных файлов записаны в `scripts/import-infantry.mjs`.

| Результат | Ассет и автор | Лицензия | Изменения |
| --- | --- | --- | --- |
| regular.glb | BAMEN, [FREE [Military Soldier] RIGGED](https://sketchfab.com/3d-models/free-military-soldier-rigged-e9c56308a67d4a3db62e914fafa4d198) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Палитра, текстуры ткани, объединение материалов, четыре LOD, Meshopt |
| militia.glb | DanlyVostok (1799danly), [Military tactical suit (LowPolyGameReady)](https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Ретаргетинг, оттенок формы, удаление нависающей гарнитуры, четыре LOD, Meshopt и KTX2 |
| Клипы в обоих GLB | Quaternius, [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) и [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Ретаргетинг из подготовленного экспорта, разделение на верх и низ в игре |
| Клипы `mocap_*` | Ian Mason, Sebastian Starke и Taku Komura, [100STYLE Dataset](https://zenodo.org/records/8127870) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Из исходных захватов выделены циклы Swat/Crouched, замкнуты и перенесены на оба скелета |
| m4a1, ak47, mp5a5, m24, p226 и m1911 | Экспорт [Operation Steel Tide](https://github.com/AetherRadar/operation-steel-tide) через cktang88/3d-fps. Авторы исходных мешей в атрибуции экспорта указаны как nisu, taradavies и Quaternius ([Ultimate Guns](https://quaternius.com/packs/ultimateguns.html)) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) для мешей, [MIT](https://github.com/AetherRadar/operation-steel-tide/blob/main/LICENSE) для адаптации | Меши и материалы подготовлены для третьего лица, магазин выделен для анимации, геометрия упрощена и сжата |

Атрибуция не подразумевает участия или одобрения проекта авторами.
