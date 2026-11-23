import { GAME_VERSION, PATCH_NOTES } from '../shared/releases.js';

export function mountChangelog() {
  const dialog = document.getElementById('patch-notes'), list = document.getElementById('patch-list');
  document.getElementById('build-version').textContent = GAME_VERSION;
  const categories = [['added', 'Нововведения'], ['changed', 'Изменения'], ['fixed', 'Исправления']];
  for (const [index, patch] of PATCH_NOTES.entries()) {
    const article = document.createElement('details'), summary = document.createElement('summary');
    article.className = 'patch'; article.open = index === 0;
    const version = document.createElement('strong'), title = document.createElement('span');
    version.textContent = patch.version; title.textContent = patch.title;
    summary.append(version, title);
    if (index === 0) {
      const badge = document.createElement('small'); badge.textContent = 'ТЕКУЩАЯ ВЕРСИЯ'; summary.append(badge);
    }
    article.append(summary);
    const content = document.createElement('div'); content.className = 'patch-content';
    for (const image of patch.images ?? (patch.image ? [patch.image] : [])) {
      const photo = document.createElement('img');
      photo.className = 'patch-photo';
      photo.src = import.meta.env.BASE_URL + image.src;
      photo.alt = image.alt;
      photo.width = 1080;
      photo.height = 720;
      photo.loading = 'lazy';
      photo.decoding = 'async';
      content.append(photo);
    }
    for (const [key, label] of categories) {
      const entries = patch[key];
      if (!Array.isArray(entries) || entries.length === 0) continue;
      const section = document.createElement('section'), heading = document.createElement('h3'), changes = document.createElement('ul');
      heading.textContent = label;
      for (const description of entries) { const item = document.createElement('li'); item.textContent = description; changes.append(item); }
      section.append(heading, changes); content.append(section);
    }
    article.append(content); list.append(article);
  }
  document.getElementById('menu-changelog').addEventListener('click', () => dialog.showModal());
  document.getElementById('close-changelog').addEventListener('click', () => dialog.close());
}
