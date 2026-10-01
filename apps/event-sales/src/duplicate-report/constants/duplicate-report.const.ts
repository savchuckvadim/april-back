/**
 * Константы отчёта по дублям сделок: коды, подписи по-русски, ключи Redis.
 *
 * Коды — `as const`-объекты, а не строки по месту (ai/rules/pbx-typing.md):
 * опечатка в коде становится ошибкой компиляции, а подписи живут в одном
 * месте для Excel, задачи и Telegram.
 */

/** Как появилась сделка-дубль (сделка моложе первой сделки клиента). */
export const DUPLICATE_ORIGIN = {
    /** Лид-источник моложе первой сделки: клиент обратился снова. */
    newRequest: 'new_request',
    /** Лид-источник старше первой сделки: старый лид взяли в работу. */
    oldLead: 'old_lead',
    /**
     * Старые лиды клиента стали сделками разом (в один день с другой
     * сделкой клиента): перенос или массовая обработка лидов.
     */
    bulkConversion: 'bulk_conversion',
    /** Без лида, создал сотрудник. */
    manual: 'manual',
    /** Без лида и без названия либо создана интеграцией. */
    automation: 'automation',
} as const;

export type DuplicateOrigin =
    (typeof DUPLICATE_ORIGIN)[keyof typeof DUPLICATE_ORIGIN];

/** Порядок групп «как появилась» в листе «Присоединить к основной». */
export const DUPLICATE_ORIGIN_ORDER: readonly DuplicateOrigin[] = [
    DUPLICATE_ORIGIN.newRequest,
    DUPLICATE_ORIGIN.oldLead,
    DUPLICATE_ORIGIN.bulkConversion,
    DUPLICATE_ORIGIN.manual,
    DUPLICATE_ORIGIN.automation,
];

export const DUPLICATE_ORIGIN_LABEL: Record<DuplicateOrigin, string> = {
    [DUPLICATE_ORIGIN.newRequest]: 'новая заявка',
    [DUPLICATE_ORIGIN.oldLead]: 'старый лид отправлен в работу',
    [DUPLICATE_ORIGIN.bulkConversion]: 'несколько лидов стали сделками разом',
    [DUPLICATE_ORIGIN.manual]: 'заведена вручную',
    [DUPLICATE_ORIGIN.automation]: 'автоматика',
};

/** Пояснение «как появилась» — для заметки над таблицей. */
export const DUPLICATE_ORIGIN_HINT: Record<DuplicateOrigin, string> = {
    [DUPLICATE_ORIGIN.newRequest]:
        'клиент обратился снова, когда у него уже была открытая сделка, и заявка завела ещё одну',
    [DUPLICATE_ORIGIN.oldLead]:
        'в работу взяли старый лид клиента — он старше первой сделки и стал ещё одной',
    [DUPLICATE_ORIGIN.bulkConversion]:
        'старые лиды клиента перевели в сделки в один день (перенос или массовая обработка) — каждый лид стал своей сделкой',
    [DUPLICATE_ORIGIN.manual]:
        'сотрудник завёл сделку сам, хотя у клиента уже была открытая',
    [DUPLICATE_ORIGIN.automation]:
        'сделку без названия создала автоматика: обзвон, отчёт в «Звонках» или робот',
};

/** Что предлагается сделать с клиентом. */
export const DUPLICATE_ACTION = {
    /** Решает руководитель: вели два менеджера или разные ИНН. */
    decide: 'decide',
    /** Обычный дубль: присоединить остальные сделки к основной. */
    join: 'join',
} as const;

export type DuplicateAction =
    (typeof DUPLICATE_ACTION)[keyof typeof DUPLICATE_ACTION];

export const DUPLICATE_ACTION_LABEL: Record<DuplicateAction, string> = {
    [DUPLICATE_ACTION.decide]: 'решить руководителю',
    [DUPLICATE_ACTION.join]: 'присоединить к основной',
};

/** Почему решение за руководителем. */
export const DUPLICATE_DECIDE_REASON = {
    /** Двое работающих ответственных и у обоих идёт работа. */
    parallelWork: 'parallel_work',
    /** У сделок разные ИНН — возможно, разные организации. */
    differentInn: 'different_inn',
} as const;

export type DuplicateDecideReason =
    (typeof DUPLICATE_DECIDE_REASON)[keyof typeof DUPLICATE_DECIDE_REASON];

/** Кому и в каком качестве ушёл отчёт. */
export const DUPLICATE_RECIPIENT_ROLE = {
    /** Руководитель отдела по структуре («Отчёт РОПу»). */
    head: 'head',
    /** «По своему отделу — кому»: свой отдел и подотделы. */
    department: 'department',
    /** «По всей структуре — кому»: все клиенты портала. */
    structure: 'structure',
    /**
     * Руководитель верхнего отдела продаж: клиенты, которых по «Отчёту
     * РОПу» никто не получил — все ответственные уволены или вне отдела.
     */
    orphan: 'orphan',
} as const;

export type DuplicateRecipientRole =
    (typeof DUPLICATE_RECIPIENT_ROLE)[keyof typeof DUPLICATE_RECIPIENT_ROLE];

export const DUPLICATE_RECIPIENT_ROLE_LABEL: Record<
    DuplicateRecipientRole,
    string
> = {
    [DUPLICATE_RECIPIENT_ROLE.head]: 'клиенты ваших сотрудников',
    [DUPLICATE_RECIPIENT_ROLE.department]: 'клиенты вашего отдела',
    [DUPLICATE_RECIPIENT_ROLE.structure]: 'все клиенты портала',
    [DUPLICATE_RECIPIENT_ROLE.orphan]:
        'клиенты, чьи ответственные уже не работают в отделе продаж',
};

/**
 * «Ответственный ведёт сделку»: его открытые задачи по ней либо его дело
 * не старше этого срока. Только двое ответственных С РАБОТОЙ делают
 * клиента вопросом руководителю — заброшенная вторая сделка просто дубль.
 */
export const DUPLICATE_RECENT_WORK_DAYS = 30;

/**
 * Как присоединить дубль — одна строка на задачу и Excel. Кнопка
 * «Присоединить сюда» в «Возможных пересечениях» сделки ТОЙ ЖЕ компании не
 * показывает (это окружение клиента, а не дубль), поэтому путь — блок
 * «Открытые сделки по клиенту» в «Звонках».
 */
export const DUPLICATE_JOIN_HOW =
    'откройте «Звонки» из карточки любой сделки клиента, в блоке ' +
    '«Открытые сделки по клиенту» проверьте, какая сделка отмечена основной ' +
    '(сменить — «Сделать основной»), отметьте сделки, которые нужно ' +
    'присоединить, → «Присоединить к основной» → «Подтвердить». Задачи и дела ' +
    'переедут в основную, присоединённые сделки закроются стадией «Дубль».';

/** Почему нельзя «Объединить» в Битриксе — одна строка на задачу и Excel. */
export const DUPLICATE_MERGE_WARNING =
    'Не нажимайте «Объединить» в Битриксе: эта кнопка сливает сделки-дубли ' +
    'в одну карточку и удаляет их — отменить нельзя. Присоединяйте только ' +
    'через «Звонки».';

/** Строк в таблице описания задачи; полный список — в Excel. */
export const DUPLICATE_TASK_TOP = 10;

/** Справочник источников CRM (`crm.status.list`, ENTITY_ID). */
export const BX_SOURCE_STATUS_ENTITY = 'SOURCE';

/** Ключ Redis-лока: крон и ручной прогон не накладываются. */
export const DUPLICATE_REPORT_LOCK_KEY = 'event-sales:duplicate-report-lock';
/** TTL лока: чтение воронки + Excel и задача на каждого получателя. */
export const DUPLICATE_REPORT_LOCK_TTL_SEC = 30 * 60;

/**
 * Метка «отчёт этой недели уже ушёл» (значение — ключ недели). У прогона
 * «только считать» метка своя: включили задачи в ту же неделю — отчёт
 * уйдёт при следующем тике, а не через неделю.
 */
export const buildDuplicateReportWeekKey = (
    domain: string,
    countOnly = false,
): string =>
    `event-sales:duplicate-report:last-week${countOnly ? '-count' : ''}:${domain}`;

/**
 * Неудачные попытки недели: «ключ недели:число». Сбой повторяется в
 * следующий тик, но в Telegram — только первый и последний, а после
 * {@link DUPLICATE_REPORT_MAX_ATTEMPTS} попыток неделя закрывается.
 */
export const buildDuplicateReportFailKey = (domain: string): string =>
    `event-sales:duplicate-report:failed:${domain}`;
export const DUPLICATE_REPORT_MAX_ATTEMPTS = 5;

/** Кому уходили задачи-отчёты: тем, кому отчёта больше нет, закрываем прошлую. */
export const buildDuplicateReportRecipientsKey = (domain: string): string =>
    `event-sales:duplicate-report:recipients:${domain}`;

/** Папка отчётов в личном Диске владельца вебхука — не корень Диска. */
export const DUPLICATE_REPORT_FOLDER = 'Отчёты по дублям сделок';
/** Метка живёт дольше недели, чтобы пережить сдвиг дня отправки. */
export const DUPLICATE_REPORT_WEEK_TTL_SEC = 15 * 24 * 60 * 60;

/** Последняя задача-отчёт получателя: её закрываем, когда приходит новая. */
export const buildDuplicateReportTaskKey = (
    domain: string,
    userId: number,
): string => `event-sales:duplicate-report:task:${domain}:${userId}`;
/** Задача старше квартала уже не «прошлый отчёт» — забываем. */
export const DUPLICATE_REPORT_TASK_TTL_SEC = 90 * 24 * 60 * 60;
