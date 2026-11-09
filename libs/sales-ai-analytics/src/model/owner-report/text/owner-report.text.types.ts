/**
 * Текст отчёта собственнику: разделы в порядке подачи, каждая строка —
 * готовая фраза по-русски. Собирается шаблоном из фактов
 * (`buildOwnerReportText`); резюме, тексты утечек и выводы по сотрудникам
 * модель может заменить своими — после факт-чека (`applyNarrative`), с
 * пометкой источника. Рендеры (витрина, PDF, письмо) раскладывают эту
 * структуру, не считая ничего сами.
 */

export type OwnerReportTextSource = 'template' | 'model';

/** Оценка значения для цвета: хорошо, внимание, плохо, без оценки. */
export const OWNER_REPORT_TONES = ['good', 'warn', 'bad', 'neutral'] as const;
export type OwnerReportTone = (typeof OWNER_REPORT_TONES)[number];

/** Плитка шапки: число крупно, подпись под ним, сравнение с прошлым периодом. */
export interface OwnerReportTile {
    code: string;
    value: string;
    label: string;
    compare: string | null;
    /** Цвет плитки по порогам доли; нет значения — neutral. */
    tone: OwnerReportTone;
}

/** Пункт «На что обратить внимание»: что не так и одно действие. */
export interface OwnerReportAttentionItem {
    tone: OwnerReportTone;
    title: string;
    action: string;
}

export interface OwnerReportOutcomeText {
    label: string;
    calls: number;
    pct: string;
}

export interface OwnerReportTypeGroupText {
    label: string;
    calls: number;
    advanced: string;
    callbackDated: number;
    postponed: number;
    refused: number;
    noContact: number;
    /** Разговоров без размеченного исхода (старый разбор). */
    unmarked: number;
}

/** Пояснение термина отчёта для читателя, который видит его впервые. */
export interface OwnerReportGlossaryItem {
    term: string;
    meaning: string;
}

export interface OwnerReportWeekText {
    label: string;
    calls: number;
    cold: number;
    coldAdvanced: string;
    contacted: number;
    contactedAdvanced: string;
    /** «неполная неделя», «нет звонков: 12 октября»; null — без пометки. */
    note: string | null;
}

export interface OwnerReportOverviewText {
    outcomes: OwnerReportOutcomeText[];
    typeGroups: OwnerReportTypeGroupText[];
    weeks: OwnerReportWeekText[];
    /** Фразы под таблицами: разрывы данных, выведенные исходы. */
    notes: string[];
}

export interface OwnerReportLeakText {
    code: string;
    title: string;
    scale: string;
    money: string | null;
    nature: string;
    action: string;
    /** Абзац утечки: шаблон или модель. */
    text: string;
    source: OwnerReportTextSource;
    /** Id разборов-примеров; ссылки подставляет приложение. */
    examples: string[];
}

export interface OwnerReportSignText {
    code: string;
    title: string;
    verdict: string;
    detail: string;
}

export interface OwnerReportManagementText {
    rows: OwnerReportSignText[];
    verdict: string;
    verdictText: string;
}

export interface OwnerReportObjectionText {
    label: string;
    calls: number;
    handled: string;
    advancedAfter: string;
}

export interface OwnerReportObjectionsText {
    intro: string;
    rows: OwnerReportObjectionText[];
    coldTop: string | null;
}

export interface OwnerReportIssueText {
    label: string;
    calls: number;
    examples: string[];
}

export interface OwnerReportIssuesText {
    intro: string;
    rows: OwnerReportIssueText[];
}

export interface OwnerReportMetricText {
    code: string;
    title: string;
    value: string;
    lastWeek: string | null;
    why: string;
    ifIgnored: string;
}

/** Колонки таблицы сотрудников в порядке показа. */
export const MANAGER_COLUMNS = [
    'calls',
    'coldAdvanced',
    'contactedAdvanced',
    'reactivationAdvanced',
    'needsFound',
    'presentationByNeeds',
    'closingAttempted',
    'nextStepDated',
    'objectionsHandled',
    'postponedWithDate',
    'conflict',
    'evasive',
    'advancedShareOfTeam',
    'upsellShareOfTeam',
    'crm',
] as const;
export type ManagerColumn = (typeof MANAGER_COLUMNS)[number];

/** Подписи колонок; без стрелок — в шрифте PDF их нет (рисовался апостроф). */
export const MANAGER_COLUMN_LABELS: Readonly<Record<ManagerColumn, string>> = {
    calls: 'Разговоров (доля)',
    coldAdvanced: 'Холодные: шаг вперёд',
    contactedAdvanced: 'С ЛПР: шаг вперёд',
    reactivationAdvanced: 'Возврат: шаг вперёд',
    needsFound: 'Выяснил задачи',
    presentationByNeeds: 'Показ под задачи',
    closingAttempted: 'Попытка закрытия',
    nextStepDated: 'Шаг с датой',
    objectionsHandled: 'Отработал возражения',
    postponedWithDate: 'Отложено с датой',
    conflict: 'Конфликтный тон',
    evasive: 'Ушёл от ответа',
    advancedShareOfTeam: 'Доля в продвижениях команды',
    upsellShareOfTeam: 'Доля в допродажах',
    crm: 'Сделки / счета / показы в CRM',
};

export interface OwnerReportManagerText {
    managerId: string;
    name: string;
    headline: string;
    cells: Record<ManagerColumn, string>;
    strengths: string[];
    risks: string[];
    conclusion: string;
    source: OwnerReportTextSource;
}

export interface OwnerReportText {
    title: string;
    periodLabel: string;
    tiles: OwnerReportTile[];
    /** До четырёх пунктов: главные утечки и провалы управления с действием. */
    attention: OwnerReportAttentionItem[];
    summary: string[];
    summarySource: OwnerReportTextSource;
    overview: OwnerReportOverviewText;
    leaks: OwnerReportLeakText[];
    management: OwnerReportManagementText;
    objections: OwnerReportObjectionsText;
    issues: OwnerReportIssuesText;
    controlMetrics: OwnerReportMetricText[];
    managers: OwnerReportManagerText[];
    methodology: string[];
    /** Словарь: что значат исходы, виды разговоров и прочерк. */
    glossary: OwnerReportGlossaryItem[];
}
