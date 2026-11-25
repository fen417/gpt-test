# Производительность

`?perf` открывает панель диагностики: FPS, CPU/GPU frame time, p95/p99, draw calls, треугольники, сеть, разрешение и PBR. GPU-тайминги доступны только при поддержке запросов времени. Сравнивайте реальные, а не сгенерированные кадры.

```sh
npm run bench -- --output .perf-local/baseline.json
npm run bench -- --baseline .perf-local/baseline.json --output .perf-local/comparison.json
npm run build
```

Фиксируйте карту, число ботов, камеру, разрешение, пресет, API, FSR и FG. Сравнивайте одинаковые сцены, отдельно тестируйте слабые GPU. `scripts/capture-graphics-remaster.mjs` и браузерные smoke-проверки сохраняют результаты локально или в CI. `scripts/check-budgets.mjs` проверяет размер начального JS/аудио и упаковку solo worker.

Отчёты и скриншоты не коммитить. [Графический ремастер](graphics-remaster.md).
