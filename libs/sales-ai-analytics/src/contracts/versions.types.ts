/**
 * Версии разбора звонка (план, раздел 5.4) — пререквизит трендов: ряд
 * рвёт смена СЕРИИ версий (`versionsSeriesKey`), а не любая правка строки.
 * Пишутся в user_result разбора (поле versions), константы значений живут
 * в apps/event-sales call-report-versions.const.ts.
 */
export interface AnalysisVersions {
    /** Версия промпта фокус-анализа. */
    prompt: string;
    /** Версия рубрики (набор разделов). */
    rubric: string;
    /** Хэш реестра (профили типов звонков). */
    registry: string;
    /** Дата смены атрибуции менеджера. */
    attribution: string;
    /** Дата смены классификатора типов. */
    classifier: string;
    /**
     * Метка методики портала «код@версия» (с 01.11.2026); нет — разбор
     * одним ядром. Даты не несёт — на границу сравнимости не влияет.
     */
    methodology?: string;
}

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/;

/** Дата YYYY-MM-DD из строки версии ('focus-v2.1-2026-09-05' → '2026-09-05'). */
export function versionDate(value: string): string | null {
    return ISO_DATE_RE.exec(value)?.[0] ?? null;
}

/**
 * СЕРИИ СРАВНИМОСТИ ВЕРСИЙ: версия → дата начала её серии.
 *
 * Политика (решения владельца 19–20.10.2026 — «ждёшь три месяца, чуть
 * промпт меняешь — опять три месяца ждать»):
 * - всё, что накоплено с начала разборов, — ОДНА серия от
 *   `AI_ANALYSIS_SERIES_START` (25.06.2026): все известные версии промпта,
 *   атрибуции и классификатора записаны сюда;
 * - МИНОРНАЯ правка — не меняет оценки разделов (определения и
 *   доказательства риск-флагов, новый флаг, формулировки без смены рубрики
 *   и шкалы): версия получает новую дату в строке, а здесь — запись с датой
 *   текущей серии; ряд не рвётся;
 * - правка ПО СУЩЕСТВУ (оценки разделов, состав ответа, вход модели):
 *   новая дата в строке версии и БЕЗ записи здесь — ряд разрывается.
 * Версии без записи ведут себя как раньше: дата серии = дата в строке.
 */
export const AI_ANALYSIS_SERIES_START = '2026-06-25';

/** Серии версий ПРОМПТА (ключ — полная строка версии). */
export const PROMPT_SERIES_START = {
    'focus-v2.1-2026-09-05': AI_ANALYSIS_SERIES_START,
    'focus-v2.2-2026-09-08': AI_ANALYSIS_SERIES_START,
    'focus-v2.3-2026-09-25': AI_ANALYSIS_SERIES_START,
    // v2.4 (20.10.2026): определения и доказательства риск-флагов, флаг
    // door_closed; рубрика и оценки разделов не менялись.
    'focus-v2.4-2026-10-20': AI_ANALYSIS_SERIES_START,
    // v2.5 (21.10.2026): флаги promise и client_negative убраны из схем и
    // промпта (запрет отмечать обещания и недовольство клиента); рубрика и
    // оценки разделов не менялись.
    'focus-v2.5-2026-10-21': AI_ANALYSIS_SERIES_START,
    // v2.6 (21.10.2026): блок приглашения на мероприятие (новый тип
    // event_invite) — подключается только к звонкам нового типа; оценки
    // существующих типов не менялись.
    'focus-v2.6-2026-10-21': AI_ANALYSIS_SERIES_START,
    // v3.0 (01.11.2026): расширенный шаг, продвижение сделки, ограничители
    // оценки и проход «методика» — правка ПО СУЩЕСТВУ, но по решению
    // владельца 01.11.2026 (оценки должны продолжаться) — в общей серии.
    'focus-v3.0-2026-11-01': AI_ANALYSIS_SERIES_START,
    // v3.1 (06.11.2026): факты для отчётов руководителю (исход, вид шага,
    // тема возражения, сбои, цены, допродажа, самопредставление) — только
    // добавлены; рубрика и оценки разделов не менялись.
    'focus-v3.1-2026-11-06': AI_ANALYSIS_SERIES_START,
    // v3.2 (16.11.2026): три кода сбоев CRM вместо одного и время в звонке
    // у сбоев, цен, следующего шага, потребностей и презентации — только
    // добавлены; рубрика и оценки разделов не менялись.
    'focus-v3.2-2026-11-16': AI_ANALYSIS_SERIES_START,
    // v3.3 (17.11.2026): проход «движение сделки» разделён на два вызова
    // («возражения и цена», «закрытие и следующий шаг») — состав разбора,
    // рубрика и оценки разделов не менялись.
    'focus-v3.3-2026-11-17': AI_ANALYSIS_SERIES_START,
    // v3.4 (18.11.2026, действует после включения цитат): цитата и секунда
    // у разделов, места пунктов «хвоста» и 5К, потребности с местом в
    // разговоре; «хвост» и 5К — только у презентации. Рубрика и оценки
    // разделов не менялись.
    'focus-v3.4-2026-11-18': AI_ANALYSIS_SERIES_START,
} as const satisfies Readonly<Record<string, string>>;

/**
 * Серии датированных версий остальных полей — ПО ПОЛЮ: их значения — голые
 * даты, и общая таблица по строке перехватила бы дату события настроек,
 * которую `comparableFrom` получает тем же аргументом.
 */
export const VERSION_FIELD_SERIES_START: Readonly<
    Partial<Record<keyof AnalysisVersions, Readonly<Record<string, string>>>>
> = {
    prompt: PROMPT_SERIES_START,
    attribution: { '2026-08-24': AI_ANALYSIS_SERIES_START },
    classifier: {
        '2026-09-05': AI_ANALYSIS_SERIES_START,
        // 21.10.2026: новый код event_invite в инструкции классификатора и
        // синтезе — минорная: типы и оценки остальных звонков не меняются.
        '2026-10-21': AI_ANALYSIS_SERIES_START,
    },
};

/**
 * Дата серии сравнимости строки версии: запись таблицы серий промпта,
 * иначе дата из строки; ни того, ни другого — null.
 */
export function versionSeriesDate(value: string): string | null {
    const series = (PROMPT_SERIES_START as Readonly<Record<string, string>>)[
        value
    ];
    return series ?? versionDate(value);
}

/** Дата серии значения конкретного поля версий: таблица поля, иначе как у строки. */
export function versionFieldSeriesDate(
    field: string,
    value: string,
): string | null {
    const table = (
        VERSION_FIELD_SERIES_START as Readonly<
            Record<string, Readonly<Record<string, string>> | undefined>
        >
    )[field];
    return table?.[value] ?? versionSeriesDate(value);
}

const maxDate = (dates: readonly (string | null)[]): string =>
    dates
        .filter((date): date is string => date !== null)
        .reduce((max, date) => (date > max ? date : max), '');

/**
 * Начало сравнимой истории — максимум из дат разрывов ряда. Принимает как
 * чистые даты (события настроек), так и строки версий с датой внутри (для
 * версии промпта из таблицы серий берётся дата серии); строки без даты
 * игнорируются; нет ни одной даты → ''.
 */
export function comparableFrom(dates: readonly string[]): string {
    return maxDate(dates.map(versionSeriesDate));
}

/**
 * comparableFrom по полям набора версий разбора с учётом серии КАЖДОГО поля
 * (prompt / attribution / classifier); набор может быть неполным.
 */
export function comparableFromVersions(
    versions:
        | Readonly<Partial<AnalysisVersions>>
        | Readonly<Record<string, string>>,
): string {
    return maxDate(
        Object.entries(versions).map(([field, value]) =>
            typeof value === 'string'
                ? versionFieldSeriesDate(field, value)
                : null,
        ),
    );
}

/**
 * Ключ СЕРИИ сравнимости набора версий — для разрыва рядов трендов и
 * признака «смешанные версии»: это дата начала серии набора
 * (`comparableFromVersions`). Два набора в одной серии, когда граница
 * сравнимости у них одна, — ровно так матрица и готовность витрины
 * отделяют разборы «по прежним правилам» (`isBeforeComparable`,
 * `resolveComparableFrom`):
 * - минорная правка (версия с записью в таблице серий) ключ не меняет;
 * - правка по существу (новая дата без записи) — новый ключ, ряд рвётся;
 * - rubric и registry дат не несут и на ключ не влияют — как и на границу
 *   сравнимости (рубрика v2 от 01.11.2026 — решение владельца «серию не
 *   трогает»; хэш реестра меняется с набором типов портала).
 * В наборе нет ни одной даты — null (серия неизвестна).
 * Точную версию (группировка по строке) даёт сырая сигнатура набора, не он.
 */
export function versionsSeriesKey(
    versions:
        | Readonly<Partial<AnalysisVersions>>
        | Readonly<Record<string, string>>,
): string | null {
    return comparableFromVersions(versions) || null;
}
