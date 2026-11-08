import type { VendorSettingDefinition } from './vendor-settings.registry';

/**
 * Настройки Telegram-ботов April в админке (группа «Telegram-боты»).
 *
 * Ботов три, токены не путать:
 * - поддержка — сотрудникам April (SUPPORT_TELEGRAM_*);
 * - клиентский @AprilReportBot — клиентам (CABINET_TELEGRAM_BOT_TOKEN);
 * - тревоги разработчика — только env TELEGRAM_BOT_TOKEN: должен доложить
 *   о падении базы, в которой хранятся эти настройки.
 *
 * Имена ботов и секреты вебхуков не задаются: имя приложение узнаёт у
 * Telegram (getMe), секрет вычисляет из токена.
 */
export const TELEGRAM_BOT_SETTING_KEYS = [
    'SUPPORT_TELEGRAM_BOT_TOKEN',
    'SUPPORT_TELEGRAM_CHAT_ID',
    'CABINET_TELEGRAM_BOT_TOKEN',
] as const;

/**
 * Токены ботов из админки: для них админка показывает, какой бот на самом
 * деле стоит в поле (getMe), и предупреждает о дублях.
 */
export const TELEGRAM_BOT_TOKEN_SETTING_KEYS = [
    'SUPPORT_TELEGRAM_BOT_TOKEN',
    'CABINET_TELEGRAM_BOT_TOKEN',
] as const;
export type TelegramBotTokenSettingKey =
    (typeof TELEGRAM_BOT_TOKEN_SETTING_KEYS)[number];

/** «Где взять» для токена бота — вместе с тем, что делать при утечке. */
function telegramTokenHowTo(bot: string, afterRevoke: string): string {
    return [
        `Telegram → @BotFather → /newbot (для существующего ${bot} — /token), скопировать токен сюда и сохранить. Имя бота приложение узнаёт у Telegram, вебхук регистрирует само в течение пары минут. api.telegram.org должен быть в хостах прокси.`,
        '',
        'Если токен утёк:',
        `1. @BotFather → /revoke → выбрать ${bot}. BotFather выдаст новый токен, старый сразу перестаёт работать.`,
        '2. Вставить новый токен сюда и сохранить.',
        `Через пару минут всё работает на новом токене — без перезапуска и правки .env. ${afterRevoke}`,
    ].join('\n');
}

const TELEGRAM_TOKEN_EXAMPLE = '123456789:AA…';

export const TELEGRAM_BOT_SETTINGS: readonly VendorSettingDefinition[] = [
    {
        key: 'SUPPORT_TELEGRAM_BOT_TOKEN',
        group: 'telegram-bots',
        label: 'Поддержка: токен бота',
        description:
            'Бот для сотрудников April: сигналы линии поддержки в чат поддержки и ИИ-помощник («что в поддержке», «разбери …»). Не для клиентов. Хранится в базе зашифрованным. Без токена сигналы уходят только в колокольчик Битрикса.',
        howTo: telegramTokenHowTo(
            'бота поддержки',
            'Бот тот же — чат поддержки и права в нём сохраняются. Адрес вебхука — SUPPORT_TELEGRAM_WEBHOOK_URL в .env приложения bot.',
        ),
        secret: true,
        example: TELEGRAM_TOKEN_EXAMPLE,
    },
    {
        key: 'SUPPORT_TELEGRAM_CHAT_ID',
        group: 'telegram-bots',
        label: 'Поддержка: чат',
        description:
            'Групповой чат, куда бот поддержки шлёт сигналы; все участники чата получают их и могут писать боту в личку. Бот должен быть добавлен в этот чат.',
        howTo: 'Добавить бота поддержки в группу, написать в группе любое сообщение, открыть https://api.telegram.org/bot<токен>/getUpdates — chat.id группы (отрицательное число, у супергрупп начинается с -100).',
        secret: false,
        example: '-1001234567890',
        validate: value =>
            /^-?\d{5,20}$/.test(value)
                ? null
                : 'Номер чата — число, у групп отрицательное, например -1001234567890',
    },
    {
        key: 'CABINET_TELEGRAM_BOT_TOKEN',
        group: 'telegram-bots',
        label: 'Клиентский бот: токен',
        description:
            'Бот, через который клиенты получают отчёты и уведомления своего портала (сейчас @AprilReportBot). Хранится в базе зашифрованным. Без токена кнопка «Привязать Telegram» в кабинете выключена.',
        howTo: telegramTokenHowTo(
            'клиентского бота (сейчас @AprilReportBot)',
            'Бот тот же, поэтому привязки чатов клиентов сохраняются: перепривязывать никого не нужно.',
        ),
        secret: true,
        example: TELEGRAM_TOKEN_EXAMPLE,
    },
];
