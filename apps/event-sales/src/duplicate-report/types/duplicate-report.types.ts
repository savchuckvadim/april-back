import {
    DuplicateAction,
    DuplicateDecideReason,
    DuplicateOrigin,
    DuplicateRecipientRole,
} from '../constants/duplicate-report.const';

/**
 * Типы отчёта по дублям. Всё, что знает про формат Битрикса, заканчивается
 * в ридерах: классификация, получатели и Excel работают с уже разобранными
 * числами и строками — поэтому их можно проверять тестами без портала.
 */

/** Лид, из которого создана сделка. */
export interface DuplicateLead {
    readonly id: number;
    readonly title: string;
    /** DATE_CREATE лида, ms; null — дата не разобралась. */
    readonly createdAt: number | null;
    /** Название источника по справочнику портала; '' — источника нет. */
    readonly sourceName: string;
    /** На лиде стоит наша метка пути заявки (`op_lead_site_status`). */
    readonly isRequest: boolean;
}

/** Открытая сделка воронки «ОП Основная», разобранная из Битрикса. */
export interface DuplicateDeal {
    readonly id: number;
    /** TITLE как есть, без подстановок: пустое название — признак автоматики. */
    readonly title: string;
    readonly stageName: string;
    /** Порядок стадии в лестнице sales_base; 0 — стадия неизвестна. */
    readonly stageOrder: number;
    readonly assignedById: number | null;
    readonly createdById: number | null;
    readonly companyId: number | null;
    readonly contactId: number | null;
    readonly opportunity: number;
    /** DATE_CREATE, ms. */
    readonly createdAt: number | null;
    /**
     * DATE_MODIFY, ms: только для «самой свежей» (так выбирает вход
     * повторной заявки). Для «идёт работа» не годится: дату сдвигают
     * роботы и наша автоматика (проба garant 01.10.2026).
     */
    readonly modifiedAt: number | null;
    /** LAST_ACTIVITY_TIME, ms: последнее дело по карточке. */
    readonly lastActivityAt: number | null;
    /** LAST_ACTIVITY_BY: кто создал последнее дело (часто — владелец вебхука). */
    readonly lastActivityById: number | null;
    /** Лид-источник: наше поле «лид, из которого создана сделка», иначе LEAD_ID. */
    readonly sourceLeadId: number | null;
    /** Сколько заявок присоединено к сделке (наше поле `deal_joined_leads`). */
    readonly joinedLeads: number;
    /** ИНН сделки (`op_inn`) цифрами; '' — не заполнен или поля нет. */
    readonly inn: string;
    /** Открытых задач по сделке (дочитываются вторым проходом). */
    readonly openTasks: number;
    /** Из них — у самого ответственного сделки. */
    readonly ownOpenTasks: number;
    /** ID открытых задач: общая задача двух сделок — «ведут как одного клиента». */
    readonly openTaskIds: readonly number[];
    /** Лид-источник (дочитывается вторым проходом); null — лида нет. */
    readonly lead: DuplicateLead | null;
}

export type DuplicateClientKind = 'company' | 'contact';

/** Клиент: компания, а у сделок без компании — контакт. */
export interface DuplicateClientRef {
    readonly kind: DuplicateClientKind;
    readonly id: number;
}

/** Клиент с двумя и более открытыми сделками. */
export interface DuplicateGroup {
    readonly client: DuplicateClientRef;
    readonly deals: readonly DuplicateDeal[];
}

/** Открытая задача, привязанная к сделке. */
export interface DuplicateOpenTask {
    readonly id: number;
    readonly responsibleId: number | null;
}

/** Второй проход чтения: подписи клиентов, лиды, задачи. */
export interface DuplicateContext {
    /** Ключ — {@link clientKey}. */
    readonly clientTitles: ReadonlyMap<string, string>;
    /** ИНН клиента (поле компании); ключ — {@link clientKey}. */
    readonly clientInns: ReadonlyMap<string, string>;
    readonly leads: ReadonlyMap<number, DuplicateLead>;
    /** Открытые задачи по сделке; сделки без ответа в карте нет. */
    readonly openTasks: ReadonlyMap<number, readonly DuplicateOpenTask[]>;
}

/** Клиент со всем прочитанным — вход классификации. */
export interface DuplicateClientInput {
    readonly ref: DuplicateClientRef;
    readonly title: string;
    readonly inn: string;
    readonly deals: readonly DuplicateDeal[];
}

/** Сделка клиента после разбора. */
export interface ClassifiedDeal {
    readonly deal: DuplicateDeal;
    /** Предлагается оставить основной. */
    readonly isMain: boolean;
    /** Самая свежая по DATE_MODIFY: к ней присоединится новая заявка. */
    readonly isFreshest: boolean;
    /** Ответственный работает: аккаунт активен и не в отделе неработающих. */
    readonly working: boolean;
    /**
     * Ответственный ведёт сделку сам: его открытые задачи по ней или его
     * дело за последние 30 дней. Чужие задачи и дела автоматики — не в счёт.
     */
    readonly recentWork: boolean;
    /** Как появилась; null — первая (самая старая) сделка клиента. */
    readonly origin: DuplicateOrigin | null;
}

/** Клиент после разбора: что оставить, что присоединить, кому решать. */
export interface ClassifiedClient {
    readonly ref: DuplicateClientRef;
    readonly title: string;
    readonly inn: string;
    /** Основная первой, остальные — по дате создания. */
    readonly deals: readonly ClassifiedDeal[];
    readonly mainDealId: number;
    readonly freshestDealId: number;
    readonly action: DuplicateAction;
    /** Пусто у обычного дубля. */
    readonly decideReasons: readonly DuplicateDecideReason[];
    /** Как появилась самая молодая сделка — откуда взялся дубль. */
    readonly origin: DuplicateOrigin;
    /** Самая молодая сделка создана в периоде отчёта. */
    readonly newThisWeek: boolean;
    /** Ни один ответственный не работает: после присоединения нужен новый. */
    readonly allResponsiblesGone: boolean;
    /**
     * Одна и та же открытая задача привязана к двум сделкам клиента:
     * сотрудники уже ведут его как одного клиента — это не спор двоих.
     */
    readonly workedAsOne: boolean;
}

/** Отчёт одного получателя: одна задача и один файл. */
export interface DuplicateRecipientReport {
    readonly userId: number;
    readonly roles: readonly DuplicateRecipientRole[];
    readonly clients: readonly ClassifiedClient[];
}

/** Период отчёта: семь полных дней до дня прогона (TZ портала). */
export interface DuplicateReportPeriod {
    /** Начало первого дня периода — граница «новое за неделю». */
    readonly from: Date;
    /**
     * Начало дня отчёта (конец периода, не включая). Ночная заявка дня
     * отчёта попадёт в «новое» следующей недели, а не двух сразу.
     */
    readonly to: Date;
    /** «22.09–28.09» — для названия задачи и файла. */
    readonly label: string;
}

/** Адресаты из настроек портала. */
export interface DuplicateRecipientsSettings {
    /** «Отчёт РОПу»: руководителю — клиенты его сотрудников. */
    readonly toHead: boolean;
    /** «По своему отделу — кому» (Bitrix ID). */
    readonly departmentUserIds: readonly number[];
    /** «По всей структуре — кому» (Bitrix ID). */
    readonly structureUserIds: readonly number[];
}

/** День недели (1 — понедельник … 7 — воскресенье) и час отправки. */
export interface DuplicateReportSchedule {
    readonly weekday: number;
    readonly hour: number;
}

/** Параметры прогона — настройки портала, разобранные в числа. */
export interface DuplicateReportOptions {
    /** «Только считать»: итог в Telegram, без файлов и задач. */
    readonly countOnly: boolean;
    readonly schedule: DuplicateReportSchedule;
    readonly recipients: DuplicateRecipientsSettings;
    /** Чьи сделки не попадают в отчёт вовсе (Bitrix ID). */
    readonly excludeUserIds: readonly number[];
    /** Срок задачи в рабочих днях. */
    readonly deadlineDays: number;
}

/** Итог прогона по порталу — для Telegram и ручки. */
export interface DuplicateReportRunResult {
    readonly domain: string;
    /** «Только считать»: файлы и задачи не создавались. */
    readonly countOnly: boolean;
    /** Сколько открытых сделок воронки прочитано. */
    readonly scanned: number;
    readonly clients: number;
    /** Сделок у клиентов-дублей. */
    readonly deals: number;
    readonly decide: number;
    readonly join: number;
    readonly newThisWeek: number;
    /** Получателей, которым положена задача. */
    readonly recipients: number;
    readonly tasksCreated: number;
    readonly tasksClosed: number;
    readonly warnings: readonly string[];
}
