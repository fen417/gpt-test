import './style.css';
import { BASE_MAPS, MAP_EDITS } from '../shared/world.js';
import { applyMapEdits, canCloneItem, canRemoveItem, constrainPosition, mapItems, validMapEdits } from '../shared/map-edits.js';
import { MapViewport } from './viewport.js';
import { loadMap, publishMap } from './github.js';

const $ = id => document.getElementById(id);
const option = (value, text) => new Option(text, value);
const labels = {
  box: 'Препятствие', structure: 'Здание', objective: 'Точка захвата', spawn: 'База',
  vehicle: 'Техника', route: 'Узел маршрута', segment: 'Участок маршрута', road: 'Дорога',
  landform: 'Рельеф', landmark: 'Ориентир', sign: 'Табличка', crane: 'Кран', rail: 'Рельсы', ship: 'Судно',
  crate: 'Ящик', wall: 'Стена', barrier: 'Барьер', sandbags: 'Мешки с песком', rock: 'Скала',
  warehouse: 'Склад', truck: 'Грузовик', car: 'Автомобиль', tent: 'Палатка', tree: 'Дерево',
  kiosk: 'Киоск', generator: 'Генератор', fueltank: 'Резервуар', factory: 'Цех',
  pillar: 'Опора', roof: 'Крыша', 'pump-manifold': 'Коллектор',
  'port-container': 'Контейнер', 'port-wall': 'Портовая стена', 'port-rack': 'Стеллаж',
  'port-forklift': 'Погрузчик', 'port-railcar': 'Вагон', 'port-lintel': 'Перемычка',
};
const layerOptions = {
  all: ['Все объекты', ['box', 'structure', 'objective', 'spawn', 'vehicle', 'route', 'segment', 'road', 'landmark', 'sign', 'crane', 'rail', 'ship']],
  objects: ['Препятствия', ['box']],
  buildings: ['Здания и порт', ['structure', 'crane', 'rail', 'ship']],
  points: ['Точки и базы', ['objective', 'spawn', 'landmark', 'sign']],
  vehicles: ['Техника', ['vehicle']],
  routes: ['Дороги и маршруты', ['route', 'segment', 'road']],
  terrain: ['Рельеф', ['landform']],
};

const status = message => { $('status').textContent = message; };
const serialize = value => JSON.stringify(value);
const same = (a, b) => serialize(a) === serialize(b);
const draftKey = mapId => 'rubezh-map-editor:' + mapId;
const sessions = Object.fromEntries(Object.entries(BASE_MAPS).map(([id, map]) => {
  let draft;
  try { draft = JSON.parse(localStorage.getItem(draftKey(id))); } catch { /* storage is optional */ }
  const validDraft = draft && validMapEdits(map, draft.edits) && validMapEdits(map, draft.original);
  return [id, { edits: validDraft ? draft.edits : MAP_EDITS[id], original: validDraft ? draft.original : MAP_EDITS[id],
    revision: null, undo: [], redo: [] }];
}));
const baseCatalogs = Object.fromEntries(Object.entries(BASE_MAPS).map(([id, base]) =>
  [id, new Map(mapItems(base, true).map(item => [item.key, item]))]));

let mapId = 'port', items, currentMap, selection = null, placing = null, drag = null;
let githubToken = '', pending = false;
const session = () => sessions[mapId];
const base = () => BASE_MAPS[mapId];
const catalog = () => baseCatalogs[mapId];
const dirty = state => !same(state.edits, state.original);
const displayName = item => item.name ?? item.value.name ?? (item.kind === 'vehicle' ? item.value.type.toUpperCase() :
  item.kind === 'box' ? labels[item.value.kind] ?? item.value.kind : labels[item.kind]);

let viewport;
try { viewport = new MapViewport($('viewport'), $('labels')); }
catch {
  status('Редактору нужна поддержка WebGL 2.');
  throw new Error('Map editor could not initialize WebGL 2');
}

function remember(state, id = mapId) {
  try {
    if (dirty(state)) localStorage.setItem(draftKey(id), serialize({ edits: state.edits, original: state.original }));
    else localStorage.removeItem(draftKey(id));
  } catch { /* keep working with the in-memory draft */ }
}

function updateButtons() {
  $('save').disabled = pending || !githubToken || !session().revision || !dirty(session());
  $('connect').disabled = pending;
  $('disconnect').hidden = !githubToken;
  $('disconnect').disabled = pending;
  $('map').disabled = pending;
  $('undo').disabled = !session().undo.length;
  $('redo').disabled = !session().redo.length;
}

function select(item) {
  selection = item ?? null;
  $('selection').hidden = !item;
  $('empty-selection').hidden = !!item;
  viewport.select(item);
  if (!item) return;
  $('object-name').textContent = displayName(item);
  $('object-id').textContent = item.key;
  $('x').value = Number(item.value.x.toFixed(2));
  $('z').value = Number(item.value.z.toFixed(2));
  $('duplicate').disabled = !canCloneItem(item);
  $('remove').disabled = !canRemoveItem(item) || item.kind === 'segment';
  $('selection-note').textContent = item.kind === 'segment' ? 'Переносит оба узла и пересчитывает соседние участки.' :
    item.kind === 'structure' || item.kind === 'crane' || item.kind === 'rail' ? 'Связанные детали перемещаются вместе.' :
    $('remove').disabled ? 'Элемент игровой схемы. Доступен перенос.' : '';
}

function rebuild(key = selection?.key) {
  currentMap = applyMapEdits(base(), session().edits);
  items = new Map(mapItems(currentMap).map(item => [item.key, item]));
  viewport.display(currentMap, [...items.values()]);
  select(items.get(key) ?? viewport.segments.find(segment => segment.key === key));
  updateButtons();
}

function changeEdits(next, key) {
  const state = session();
  if (same(next, state.edits)) { select(selection); return; }
  if (!validMapEdits(base(), next)) { select(selection); status('Правка выходит за ограничения карты или достигнут лимит ассетов.'); return; }
  state.undo.push(state.edits);
  if (state.undo.length > 100) state.undo.shift();
  state.redo = [];
  state.edits = next;
  remember(state);
  $('commit').hidden = true;
  rebuild(key);
  status(dirty(state) ? 'Изменения в локальном черновике.' : 'Карта совпадает с сохранённой версией.');
}

function history(source, destination) {
  const state = session();
  if (!state[source].length) return;
  state[destination].push(state.edits);
  state.edits = state[source].pop();
  remember(state);
  rebuild();
  status(dirty(state) ? 'Изменения в локальном черновике.' : 'Карта совпадает с сохранённой версией.');
}

function move(item, x, z) {
  const next = structuredClone(session().edits);
  if (item.kind === 'segment') {
    const deltaX = x - item.value.x, deltaZ = z - item.value.z;
    const endpointPositions = item.endpoints.map(endpoint => [endpoint, endpoint.value.x + deltaX, endpoint.value.z + deltaZ]);
    if (endpointPositions.some(([endpoint, px, pz]) => {
      const bounded = constrainPosition(base(), endpoint, px, pz);
      return px !== bounded.x || pz !== bounded.z;
    })) {
      select(item);
      status('Оба узла участка должны оставаться в границах карты.');
      return;
    }
    for (const [endpoint, px, pz] of endpointPositions) updatePlacement(next, endpoint, px, pz);
  } else {
    const target = constrainPosition(base(), item, x, z);
    updatePlacement(next, item, target.x, target.z);
    const dx = target.x - item.value.x, dz = target.z - item.value.z;
    for (const child of items.values()) {
      if (child.value.editorParent !== item.key || !next.moves[child.key]) continue;
      const shifted = constrainPosition(base(), child, child.value.x + dx, child.value.z + dz);
      updatePlacement(next, child, shifted.x, shifted.z);
    }
  }
  changeEdits(next, item.key);
}

function updatePlacement(edits, item, x, z) {
  if (Object.hasOwn(edits.added, item.key)) {
    Object.assign(edits.added[item.key], { x, z });
    return;
  }
  const original = catalog().get(item.key).value;
  const parent = catalog().get(original.editorParent)?.value;
  const parentMove = edits.moves[original.editorParent];
  const originalX = original.x + (parentMove ? parentMove.x - parent.x : 0);
  const originalZ = original.z + (parentMove ? parentMove.z - parent.z : 0);
  if (x === originalX && z === originalZ) delete edits.moves[item.key];
  else edits.moves[item.key] = { x, z };
}

function chooseAsset(key) {
  placing = key;
  $('cancel-place').hidden = !key;
  viewport.canvas.style.cursor = key ? 'crosshair' : '';
  for (const button of $('assets').children) button.setAttribute('aria-pressed', button.dataset.asset === key);
}

function addAsset(template, point) {
  const item = catalog().get(template);
  if (!item || !canCloneItem(item) || !point) return;
  const { x, z } = constrainPosition(base(), item, snap(point.x), snap(point.z));
  const next = structuredClone(session().edits);
  const key = 'new:' + crypto.randomUUID().replaceAll('-', '');
  next.added[key] = { template, x, z };
  chooseAsset(null);
  changeEdits(next, key);
}

function removeSelected() {
  if (!selection || selection.kind === 'segment' || !canRemoveItem(selection)) return;
  const next = structuredClone(session().edits);
  if (Object.hasOwn(next.added, selection.key)) delete next.added[selection.key];
  else {
    delete next.moves[selection.key];
    next.removed.push(selection.key);
  }
  changeEdits(next, '');
}

const previewItems = new WeakMap();
let previewLoader;
const previewObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const target = entry.target;
    previewObserver.unobserve(target);
    const { map, item } = previewItems.get(target);
    previewLoader ??= import('./previews.js').then(({ createAssetPreviews }) => createAssetPreviews(viewport.surfaceMaterials));
    void previewLoader.then(render => render(map, item)).then(src => {
      const image = document.createElement('img');
      image.alt = '';
      image.draggable = false;
      image.src = src;
      target.replaceChildren(image);
    }).catch(() => { target.textContent = 'Превью недоступно'; });
  }
}, { root: $('assets'), rootMargin: '120px' });

function showAssets() {
  const filter = $('assets-search').value.trim().toLowerCase();
  const seen = new Set();
  const buttons = [];
  for (const item of catalog().values()) {
    if (!canCloneItem(item)) continue;
    const { kind, value, key } = item;
    const variant = value.levels ? ' · ' + value.levels + ' ярус(а)' : '';
    const title = displayName(item) + variant;
    const group = [kind, value.kind ?? value.type ?? title, value.levels, value.carType].join('/');
    if (seen.has(group) || !(title + ' ' + group).toLowerCase().includes(filter)) continue;
    seen.add(group);
    const button = document.createElement('button'), preview = document.createElement('span');
    button.className = 'asset';
    button.draggable = true;
    button.dataset.asset = key;
    button.setAttribute('aria-pressed', key === placing);
    preview.className = 'asset-preview';
    preview.setAttribute('aria-hidden', 'true');
    previewItems.set(preview, { map: base(), item });
    button.append(preview, document.createTextNode(title));
    button.addEventListener('click', () => chooseAsset(placing === key ? null : key));
    button.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', key);
      event.dataTransfer.effectAllowed = 'copy';
      chooseAsset(key);
    });
    button.addEventListener('dragend', () => chooseAsset(null));
    buttons.push(button);
  }
  const list = $('assets');
  previewObserver.disconnect();
  list.replaceChildren(...buttons);
  for (const button of buttons) previewObserver.observe(button.firstElementChild);
}

function snap(value) {
  const step = Number($('snap').value);
  return step ? Math.round(value / step) * step : Number(value.toFixed(2));
}

const canvas = viewport.canvas;
canvas.addEventListener('dragover', event => {
  if (placing) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
});
canvas.addEventListener('drop', event => {
  event.preventDefault();
  if (placing && placing === event.dataTransfer.getData('text/plain')) addAsset(placing, viewport.worldPoint(event));
});
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  const point = viewport.worldPoint(event);
  if (placing) {
    event.stopImmediatePropagation();
    addAsset(placing, point);
    return;
  }
  const kinds = layerOptions[$('layer').value][1];
  const item = viewport.pick(event, kinds);
  select(item);
  if (!item || !point) return;
  event.stopImmediatePropagation();
  canvas.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, item, startX: event.clientX, startY: event.clientY,
    offsetX: item.value.x - point.x, offsetZ: item.value.z - point.z };
  canvas.style.cursor = 'grabbing';
}, true);
canvas.addEventListener('pointermove', event => {
  const point = viewport.worldPoint(event);
  if (!point) return;
  $('coords').textContent = 'X ' + point.x.toFixed(1) + ' / Z ' + point.z.toFixed(1);
  if (drag?.id !== event.pointerId || Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return;
  const target = constrainPosition(base(), drag.item, snap(point.x + drag.offsetX), snap(point.z + drag.offsetZ));
  drag.target = target;
  viewport.preview(drag.item, target.x, target.z);
});
function finishDrag(event, apply) {
  if (drag?.id !== event.pointerId) return;
  const { item, target } = drag;
  drag = null;
  canvas.style.cursor = '';
  if (apply && target) move(item, target.x, target.z);
  else select(item);
}
canvas.addEventListener('pointerup', event => finishDrag(event, true));
canvas.addEventListener('pointercancel', event => finishDrag(event, false));
canvas.addEventListener('lostpointercapture', event => finishDrag(event, false));

async function connect(token, recover = false) {
  if (pending) return;
  const state = session();
  pending = true;
  $('login-submit').disabled = true;
  $('login-error').textContent = '';
  updateButtons();
  try {
    if (!/^github_pat_[a-zA-Z0-9_]+$/.test(token)) throw new Error('Введи fine-grained токен GitHub.');
    const remote = await loadMap(mapId, token);
    if (!validMapEdits(base(), remote.edits)) throw new Error('Данные карты изменились. Обнови страницу редактора.');
    if (dirty(state) && !same(state.original, remote.edits) && !same(state.edits, remote.edits)) {
      state.revision = null;
      if (!recover || !window.confirm('В GitHub появилась новая версия карты. Загрузить её и удалить локальный черновик? Черновик можно сначала скачать кнопкой «Скачать JSON».')) {
        throw new Error('В GitHub другая версия. Черновик сохранён. Подключитесь повторно, чтобы загрузить версию GitHub.');
      }
      state.edits = remote.edits;
      state.undo = [];
      state.redo = [];
    } else if (!dirty(state) && !same(state.edits, remote.edits)) {
      state.edits = remote.edits;
      state.undo = [];
      state.redo = [];
    }
    state.original = remote.edits;
    state.revision = remote.sha;
    githubToken = token;
    remember(state);
    $('connect').textContent = 'Сверить с GitHub';
    if ($('login').open) $('login').close();
    rebuild();
    status(dirty(state) ? 'GitHub подключён. Черновик готов к сохранению.' : 'Загружена актуальная карта из main.');
  } catch (error) {
    if ($('login').open) $('login-error').textContent = error.message;
    status(error.message);
  } finally {
    pending = false;
    $('login-submit').disabled = false;
    updateButtons();
  }
}

async function save() {
  const state = session();
  if ($('save').disabled) return;
  const edits = state.edits;
  pending = true;
  updateButtons();
  $('commit').hidden = true;
  status('Сохраняю карту в main…');
  try {
    const result = await publishMap(mapId, githubToken, state.revision, edits);
    state.original = edits;
    state.revision = result.sha;
    remember(state);
    $('commit').href = result.commit;
    $('commit').hidden = false;
    status(dirty(state) ? 'Коммит создан. Более свежие правки остались в черновике.' : 'Карта сохранена в main.');
  } catch (error) { status(error.message); }
  finally { pending = false; updateButtons(); }
}

for (const [id, map] of Object.entries(BASE_MAPS)) $('map').append(option(id, map.name));
for (const [key, [name]] of Object.entries(layerOptions)) $('layer').append(option(key, name));
$('map').addEventListener('change', () => {
  mapId = $('map').value;
  chooseAsset(null);
  $('commit').hidden = true;
  showAssets();
  rebuild('');
  status(dirty(session()) ? 'Восстановлен локальный черновик.' : 'Карта готова к редактированию.');
  if (githubToken) void connect(githubToken);
});
$('top').addEventListener('click', () => setView(false));
$('angle').addEventListener('click', () => setView(true));
$('frame').addEventListener('click', () => viewport.view(viewport.angle, true));
function setView(angle) {
  viewport.view(angle);
  $('top').setAttribute('aria-pressed', !angle);
  $('angle').setAttribute('aria-pressed', angle);
}
$('undo').addEventListener('click', () => history('undo', 'redo'));
$('redo').addEventListener('click', () => history('redo', 'undo'));
$('layer').addEventListener('change', () => {
  if (selection && !layerOptions[$('layer').value][1].includes(selection.kind)) select(null);
});
$('assets-search').addEventListener('input', showAssets);
$('cancel-place').addEventListener('click', () => chooseAsset(null));
$('position').addEventListener('submit', event => {
  event.preventDefault();
  if (selection && !drag) move(selection, $('x').valueAsNumber, $('z').valueAsNumber);
});
$('duplicate').addEventListener('click', () => {
  if (!selection) return;
  const { key } = selection;
  chooseAsset(session().edits.added[key]?.template ?? key);
  status('Щёлкните по месту для копии объекта.');
});
$('remove').addEventListener('click', removeSelected);
$('connect').addEventListener('click', () => {
  if (githubToken) { void connect(githubToken, true); return; }
  $('login-error').textContent = '';
  $('login').showModal();
});
$('disconnect').addEventListener('click', () => {
  githubToken = '';
  for (const state of Object.values(sessions)) state.revision = null;
  $('connect').textContent = 'Подключить GitHub';
  updateButtons();
  status('GitHub отключён.');
});
$('cancel-login').addEventListener('click', () => $('login').close());
$('login').addEventListener('close', () => { $('github-token').value = ''; });
$('login-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('github-token');
  const token = input.value.trim();
  input.value = '';
  void connect(token, true);
});
$('save').addEventListener('click', save);
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(session().edits, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = mapId + '.json';
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
window.addEventListener('keydown', event => {
  if ($('login').open || event.target.matches('input, textarea, select') || drag) return;
  if (event.key === 'Escape') { chooseAsset(null); select(null); }
  if (event.key === 'Delete') removeSelected();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) history('redo', 'undo'); else history('undo', 'redo');
  }
});

showAssets();
rebuild();
status(dirty(session()) ? 'Восстановлен локальный черновик.' : 'Карта готова к редактированию.');
