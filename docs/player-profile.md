# Профиль игрока

## Firebase

1. В Firebase Console создайте проект SECTOR 09 и добавьте в нём веб-приложение.
2. В разделе Authentication включите Email/Password и Google. Для Google выберите почту службы поддержки проекта. В списке Authorized domains укажите `fen417.github.io` и другие домены, с которых игроки открывают игру.
3. Создайте Realtime Database в закрытом режиме. Во вкладке Rules опубликуйте [правила профиля](../firebase/database.rules.json).
4. Скопируйте конфигурацию Web SDK из Project settings → Your apps. В ней нужны `apiKey`, `authDomain`, `projectId`, `appId` и `databaseURL`. Если адрес базы ещё не появился в конфигурации, возьмите его в разделе Realtime Database.

## Клиент и сервер

- В репозитории GitHub добавьте переменную Actions `SECTOR_FIREBASE_WEB_CONFIG` со всей конфигурацией Web SDK в формате JSON. Новая сборка GitHub Pages подхватит эту переменную. Для локальной разработки та же конфигурация задаётся в `VITE_FIREBASE_CONFIG` в файле `.env.local`.
- В проекте SECTOR 09 на Enzonic задайте переменную окружения `FIREBASE_DATABASE_URL` и секрет `FIREBASE_SERVICE_ACCOUNT_JSON` для Production. Значение секрета — полное содержимое JSON-ключа из Firebase → Project settings → Service accounts. При использовании ключа из файла можно указать `GOOGLE_APPLICATION_CREDENTIALS` и `FIREBASE_PROJECT_ID`.
- После настройки переменных разверните на Enzonic актуальную версию из `main`. Веб-клиент собирается отдельно в GitHub Pages. Для входа и серверной статистики используется один проект Firebase.

K/D учитывает убийства и смерти в боях между игроками в противоположных командах. Любимые класс и карта определяются по времени активной игры на официальном сервере. В профиль синхронизируются сюжетные достижения. Сохранения с состоянием миссии хранятся в браузере.
