import type {
    CabinetGuideCheck,
    CabinetGuideCheckStatus,
    CabinetGuideFacts,
    CabinetGuideLink,
} from './cabinet-guide.types';

/** Страницы админки, на которые ведут пункты чек-листа. */
export const CABINET_GUIDE_PAGES = {
    clients: { title: 'Клиенты', href: '/client' },
    portals: { title: 'Порталы', href: '/portal/list' },
    vendorSettings: {
        title: 'Настройки приложения → «Telegram-боты»',
        href: '/settings',
    },
    secrets: { title: 'Секреты приложений', href: '/marketplace/secrets' },
} as const satisfies Record<string, CabinetGuideLink>;

const check = (
    key: string,
    title: string,
    done: boolean,
    hintDone: string,
    hintTodo: string,
    link: CabinetGuideLink | null = null,
): CabinetGuideCheck => ({
    key,
    title,
    status: done ? 'done' : 'todo',
    hint: done ? hintDone : hintTodo,
    link,
});

const manual = (
    key: string,
    title: string,
    hint: string,
    link: CabinetGuideLink | null = null,
): CabinetGuideCheck => ({
    key,
    title,
    status: 'manual' satisfies CabinetGuideCheckStatus,
    hint,
    link,
});

/**
 * «Что осталось, чтобы кабинет заработал» — по фактам окружения admin
 * (корневой .env общий для pbx, bot и admin) и БД. Чистая функция: всё,
 * что видно, — done/todo, остальное — manual с подсказкой, как проверить.
 */
export function buildCabinetChecklist(
    facts: CabinetGuideFacts,
): CabinetGuideCheck[] {
    return [
        check(
            'migrations',
            'Таблицы кабинета созданы',
            facts.tablesReady,
            '`portal_users` и `telegram_bindings` на месте.',
            'Применить миграции проекта online: `2026_11_08_100000_create_portal_users_table`, `2026_11_08_110000_create_telegram_bindings_table` (`php artisan migrate`). До этого ручки кабинета отвечают ошибкой.',
        ),
        check(
            'jwt',
            'Общий секрет входа',
            facts.authJwtSecretSet,
            '`AUTH_JWT_SECRET` задан.',
            'Задать `AUTH_JWT_SECRET` в корневом .env — один на все приложения (сейчас работает запасной `APP_SECRET_KEY`).',
        ),
        check(
            'auth-enabled',
            'Ручки админки защищены',
            facts.authEnabled,
            '`AUTH_ENABLED=true`.',
            '`AUTH_ENABLED=true` в корневом .env прода — иначе ручки админки (в том числе «Кабинет») открыты без входа.',
        ),
        check(
            'cookie-domain',
            'Cookie входа с сайта',
            Boolean(facts.cookieDomain),
            `Домен cookie: \`${facts.cookieDomain ?? ''}\`.`,
            '`CABINET_COOKIE_DOMAIN=.april-app.ru` в корневом .env прода (локально пусто — это норма).',
        ),
        facts.cors === 'unreachable'
            ? manual(
                  'cors',
                  'Сайт кабинета пускают с cookie',
                  'api.pbx не ответил на проверку — повторите позже (во время выкладки это нормально).',
              )
            : check(
                  'cors',
                  'Сайт кабинета пускают с cookie',
                  facts.cors === 'ok',
                  `api.pbx пускает ${facts.siteUrl} с cookie (проверено запросом, как браузер).`,
                  `api.pbx не пускает ${facts.siteUrl} с cookie: дописать его в \`CORS_ORIGIN\` окружения pbx — корневой .env, а если в apps/pbx/.env есть свой \`CORS_ORIGIN\`, то туда (он перекрывает корневой). С «*» cookie не работают.`,
              ),
        check(
            'bot-token',
            'Клиентский Telegram-бот',
            facts.botTokenSet && Boolean(facts.botUsername),
            `Telegram узнал бота: @${facts.botUsername ?? ''}.`,
            facts.botTokenSet
                ? 'Токен задан, но Telegram его не узнал: токен неверный или отозван, либо api.telegram.org нет в хостах прокси.'
                : 'Вставить токен @AprilReportBot в «Настройки приложения» → «Telegram-боты» → «Клиентский бот: токен».',
            CABINET_GUIDE_PAGES.vendorSettings,
        ),
        check(
            'webhook-url',
            'Адрес вебхука клиентского бота',
            Boolean(facts.webhookUrl),
            `\`${facts.webhookUrl}\` — bot регистрирует его сам.`,
            '`CABINET_TELEGRAM_WEBHOOK_URL=https://api.bot.april-app.ru/api/cabinet/telegram/webhook` в корневом .env прода (локально пусто — иначе локальный запуск перехватит вебхук у прода).',
        ),
        manual(
            'webhook-live',
            'Бот принимает сообщения',
            'В логе приложения bot после старта: «Клиентский Telegram-бот: вебхук …». Смена токена в админке подхватывается за ~2 минуты, без перезапуска.',
        ),
        check(
            'mail',
            'Почта для ссылок на пароль',
            Boolean(facts.mailHost),
            `SMTP: \`${facts.mailHost}\`. Отправку проверить письмом: «Ссылка на пароль» у участника.`,
            'Без `MAIL_HOST` письма не уходят — ссылку на пароль копируют из карточки портала и передают лично. Для почты: `MAIL_HOST`, `MAIL_PORT`, `MAIL_LOGIN`, `MAIL_PASSWORD`, `SMTP_FROM` (= ящик) — все пять, иначе pbx и admin не стартуют.',
        ),
        manual(
            'e2e',
            'Проверка на живом портале',
            'Портал → «Кабинет»: привязать клиента, «Дать доступ» себе, задать пароль по ссылке, войти на сайте кабинета; в Битрикс24 открыть April → «Привязать Telegram» → бот отвечает доменом портала.',
            CABINET_GUIDE_PAGES.portals,
        ),
    ];
}
