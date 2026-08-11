/**
 * Эталонные заголовки форматов V1 (реальные имена колонок из выгрузок
 * СКАП, зафиксированы по примеру apps/event-service/src/skap/example).
 *
 * Сравнение — по нормализованному имени (trim + lowercase). Порядок
 * колонок НЕ важен (header-map), добавление новых колонок — ворнинг,
 * пропажа обязательной — SkapFormatError (error_format + алерт).
 */

/** Колонки Online.csv (14) — ключ = поле SkapOnlineRow. */
export const SKAP_ONLINE_COLUMNS_V1 = {
    regList: 'Номер карточки РП',
    rpName: 'Название РП',
    clientCard: 'Номер карточки Клиента',
    clientName: 'Название Клиента',
    complectArmId: 'ID Комплекта',
    supplyKind: 'Вид поставки',
    complectType: 'Тип комплекта',
    netCoef: 'Сетевой коэффициент',
    loginCreated: 'Дата заведения логина',
    login: 'Логин',
    sessionCount: 'Общее количество заходов',
    ipCount: 'Количество разных IP',
    ipList: 'Список разных IP',
    timeMs: 'Общее количество проведенного времени',
} as const;

/** Колонки Online_detail.csv (13) — ключ = поле SkapDetailRow. */
export const SKAP_DETAIL_COLUMNS_V1 = {
    regList: 'Номер карточки РП',
    rpName: 'Название РП',
    clientCard: 'Номер карточки Клиента',
    clientName: 'Название Клиента',
    complectArmId: 'ID Комплекта',
    complectType: 'Тип комплекта',
    netCoef: 'Сетевой коэффициент',
    login: 'Логин',
    loginCreated: 'Дата заведения логина',
    startedAt: 'Дата-время захода',
    endedAt: 'Дата-время выхода',
    durationMs: 'Продолжительность сессии',
    ip: 'IP адрес',
} as const;

/** Колонки Prime_lent.csv (17) — ключ = поле SkapPrimeLentRow. */
export const SKAP_PRIME_LENT_COLUMNS_V1 = {
    regList: 'Номер карточки партнера',
    rpName: 'Название партнера',
    city: 'Город РП',
    region: 'Регион РП',
    clientCard: 'Номер карточки клиента',
    clientName: 'Название клиента',
    complectArmId: 'ID комплекта в АРМ партнера',
    supplyKind: 'Вид поставки',
    complectName: 'Название комплекта',
    netCoef: 'Сетевой коэффициент',
    version: 'Версия',
    content: 'Наполнение комплекта',
    managerName: 'Имя менеджера',
    managerEmail: 'Адрес менеджера',
    mailingName: 'Название рассылки',
    mailingEmail: 'EMAIL рассылки',
    isActive: 'Рассылка по email',
} as const;

/**
 * Обязательные колонки: без них файл не обрабатывается (error_format).
 * Необязательные при пропаже дают пустые значения + ворнинг.
 */
export const SKAP_ONLINE_REQUIRED_V1: readonly (keyof typeof SKAP_ONLINE_COLUMNS_V1)[] =
    [
        'regList',
        'clientCard',
        'complectArmId',
        'login',
        'sessionCount',
        'timeMs',
    ];

export const SKAP_DETAIL_REQUIRED_V1: readonly (keyof typeof SKAP_DETAIL_COLUMNS_V1)[] =
    ['regList', 'clientCard', 'login', 'startedAt', 'durationMs'];

export const SKAP_PRIME_LENT_REQUIRED_V1: readonly (keyof typeof SKAP_PRIME_LENT_COLUMNS_V1)[] =
    ['regList', 'clientCard', 'complectArmId', 'complectName'];

/** Значение «Рассылка по email», означающее активную подписку. */
export const SKAP_PRIME_LENT_ACTIVE_VALUE = 'активна';
