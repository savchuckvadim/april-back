/**
 * Сколько браузер помнит ответ на предварительный запрос (preflight), секунд.
 *
 * Фреймы ходят на API с другого домена, с JSON и куками — перед каждым таким
 * запросом браузер сначала шлёт OPTIONS. Без этого заголовка ответ помнится
 * около 5 секунд, то есть почти каждый запрос фрейма шёл парой: лишний круг
 * до сервера и лишнее занятое соединение (их у браузера шесть на домен).
 * Два часа — потолок Chrome; больше ставить бессмысленно.
 */
const CORS_PREFLIGHT_MAX_AGE_SEC = 2 * 60 * 60;

export const cors = {
    origin: (process.env.CORS_ORIGIN ?? '')
        .split(',')
        .map(origin => origin.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],

    credentials: true,
    maxAge: CORS_PREFLIGHT_MAX_AGE_SEC,
};
