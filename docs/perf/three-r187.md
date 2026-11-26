# Миграция Three.js r181 → r187

Ветка для A/B-тестирования, без публикации на основной GitHub Pages. Версия Three.js зафиксирована на 0.187.0; KTX2-транскодеры совпадают с r187 по Git SHA. См. [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

## Изменения
- WebGL: нативные DepthTexture вместо упакованной RGBA-глубины; объединение статической и динамической глубины в depth attachment. Все карты кэша имеют raw depth; мягкое PCF/PCSS фильтруется после объединения. PCF и Soft PCF используют один алгоритм, как в актуальной библиотеке.
- Объёмный свет считывает нативную глубину каскадов.
- PMREM: кубические мипы; отдельный перенос последнего mip от небесного окружения для сохранения diffuse IBL. WebGPU использует CubeRenderTarget вместо WebGLCubeRenderTarget.
- Ветер WebGPU использует positionGeometry при задании positionNode.
- Диагностика содержит threeRevision. Профили графики, разрешения каскадов, дистанции, сетевой протокол и игровой контент не менялись.

## Проверка
CI: npm ci, тесты миграции и полный npm test, production build с существующими бюджетами. CI не заменяет проверку на физическом GPU.

Локальный запуск: npm ci; npm run dev (или S09_PBR_SKIP=1 при наличии готового PBR-пакета). Сравнить main и upgrade/three-r187 на одной карте, API, разрешении и пресете через ?perf: CPU avg/p95, GPU avg/p95, worldCalls, cascadeSchedule, renderStalls. Отдельно проверить вход в зоны локальных отражений, тени и рельеф, дым/объёмный свет, прицел, NVG, FSR и FG. В WebGPU не допускается fallback на WebGL. Сравнивать визуальное качество с main, так как r187 изменяет физическое освещение и PMREM.
