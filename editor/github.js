const repository = 'fen417/gpt-test';
const branch = 'main';
const mapFiles = { port: 'shared/maps/port.json', quarry: 'shared/maps/quarry.json' };
const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

async function mapRequest(mapId, token, update) {
  if (!Object.hasOwn(mapFiles, mapId)) throw new Error('Карта не найдена.');
  const url = new URL('https://api.github.com/repos/' + repository + '/contents/' + mapFiles[mapId]);
  if (!update) url.searchParams.set('ref', branch);
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: 'Bearer ' + token,
  };
  if (update) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, {
    method: update ? 'PUT' : 'GET',
    headers,
    body: update ? JSON.stringify(update) : undefined,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(22000),
  });
  if (response.status === 401) throw new Error('Токен GitHub недействителен или истёк.');
  if (response.status === 403 || response.status === 404) {
    throw new Error('GitHub отклонил доступ. Проверь репозиторий, права Contents и правила main.');
  }
  if (response.status === 409 || response.status === 422) {
    throw new Error('GitHub отклонил сохранение. Сверь версию карты и проверь разрешение на запись в main.');
  }
  if (!response.ok) throw new Error('Ошибка GitHub (' + response.status + '). Повтори запрос.');
  return response.json();
}

export async function loadMap(mapId, token) {
  const result = await mapRequest(mapId, token);
  if (result.encoding !== 'base64' || !isSha(result.sha) || typeof result.content !== 'string') {
    throw new Error('GitHub вернул неподдерживаемый формат файла карты.');
  }
  const bytes = Uint8Array.from(atob(result.content), character => character.charCodeAt(0));
  return { sha: result.sha, edits: JSON.parse(new TextDecoder().decode(bytes)) };
}

export async function publishMap(mapId, token, sha, edits) {
  if (!isSha(sha)) throw new Error('Сначала сверь версию карты с GitHub.');
  const bytes = new TextEncoder().encode(JSON.stringify(edits, null, 2) + '\n');
  const content = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
  const result = await mapRequest(mapId, token, { sha, content, branch, message: 'Update map layout: ' + mapId });
  if (!isSha(result.content?.sha) || !isSha(result.commit?.sha)) {
    throw new Error('Ответ GitHub неполный. Сверь карту перед повторным сохранением.');
  }
  return { sha: result.content.sha, commit: 'https://github.com/' + repository + '/commit/' + result.commit.sha };
}
