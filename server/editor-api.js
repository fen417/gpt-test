import { createHash, timingSafeEqual } from 'node:crypto';
import { BASE_MAPS } from '../shared/world.js';
import { validMapEdits } from '../shared/map-edits.js';

const repository = 'fen417/gpt-test';
const branch = 'main';
const githubToken = process.env.EDITOR_GITHUB_TOKEN;
const hash = value => createHash('sha256').update(value).digest();
const configuredPassword = process.env.EDITOR_PASSWORD ?? '';
const passwordHash = hash(configuredPassword);
const maxBody = 256 * 1024;
const failed = new Map();
const activeWrites = new Set();

function respond(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Map-Editor': '1' });
  res.end(JSON.stringify(value));
}

async function github(mapId, options) {
  const url = new URL(`https://api.github.com/repos/${repository}/contents/shared/maps/${mapId}.json`);
  if (options.method === 'GET') url.searchParams.set('ref', branch);
  return fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + githubToken,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > maxBody) return undefined;
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > maxBody) return undefined;
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

export async function handleEditorApi(req, res, pathname) {
  const match = /^\/api\/editor\/maps\/(port|quarry)$/.exec(pathname);
  if (!match) return respond(res, 404, { error: 'Карта не найдена.' });
  if (!githubToken || configuredPassword.length < 24) {
    return respond(res, 503, { error: 'Публикация не настроена на сервере.' });
  }
  if (req.method !== 'GET' && req.method !== 'PUT') return respond(res, 405, { error: 'Метод недоступен.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return respond(res, 403, { error: 'Откройте редактор на адресе сервера.' });
  const client = req.socket.remoteAddress;
  if (!req.headers.authorization) return respond(res, 401, { error: 'Введите пароль редактора.' });
  const now = Date.now();
  for (const [ip, attempt] of failed) if (attempt.until <= now) failed.delete(ip);
  const attempt = failed.get(client);
  if (attempt?.count >= 8) return respond(res, 429, { error: 'Слишком много попыток. Подождите минуту.' });
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || !timingSafeEqual(hash(auth.slice(7)), passwordHash)) {
    if (failed.size >= 1024) failed.delete(failed.keys().next().value);
    failed.set(client, { count: (attempt?.count ?? 0) + 1, until: attempt?.until ?? now + 60000 });
    return respond(res, 401, { error: 'Проверьте пароль редактора.' });
  }
  failed.delete(client);
  const [, mapId] = match;
  const base = BASE_MAPS[mapId];
  try {
    if (req.method === 'GET') {
      const remote = await github(mapId, { method: 'GET' });
      if (!remote.ok) throw new Error('GitHub returned ' + remote.status);
      const file = await remote.json();
      const edits = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
      if (!/^[0-9a-f]{40}$/.test(file.sha) || !validMapEdits(base, edits)) {
        return respond(res, 409, { error: 'Обновите развёртывание редактора. Версия данных карты в GitHub изменилась.' });
      }
      return respond(res, 200, { sha: file.sha, edits });
    }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
      return respond(res, 415, { error: 'Ожидается JSON.' });
    }
    const body = await readBody(req);
    if (body === undefined) {
      res.setHeader('Connection', 'close');
      return respond(res, 413, { error: 'Файл карты слишком большой.' });
    }
    if (typeof body?.sha !== 'string' || !/^[0-9a-f]{40}$/.test(body.sha) || !validMapEdits(base, body.edits)) {
      return respond(res, 400, { error: 'Недопустимые данные карты.' });
    }
    if (activeWrites.has(mapId)) return respond(res, 409, { error: 'Сохранение уже идёт. Повторите через несколько секунд.' });
    activeWrites.add(mapId);
    try {
      const content = Buffer.from(JSON.stringify(body.edits, null, 2) + '\n').toString('base64');
      const remote = await github(mapId, { method: 'PUT', body: JSON.stringify({
        branch, sha: body.sha, content, message: 'Update map layout: ' + mapId,
      }) });
      if (remote.status === 409 || remote.status === 422) {
        return respond(res, 409, { error: 'GitHub отклонил сохранение. Проверьте версию карты и разрешение записи в main.' });
      }
      if (!remote.ok) throw new Error('GitHub returned ' + remote.status);
      const result = await remote.json();
      return respond(res, 200, { sha: result.content.sha, commit: 'https://github.com/' + repository + '/commit/' + result.commit.sha });
    } finally {
      activeWrites.delete(mapId);
    }
  } catch (error) {
    console.error('Map editor GitHub request failed', error.message);
    if (!res.destroyed) respond(res, 502, { error: 'GitHub недоступен или токен редактора требует обновления.' });
  }
}
