/**
 * Контракты загрузчика жёстких счётчиков стиля (поток S4 документа
 * `ai/tasks/ai-analytics-manager-style.md`, §2.1 оси 4/7/8, §7.2 п. 1).
 *
 * «Жёсткие» — значит считанные по телефонии и CRM, а не оценённые LLM:
 * попытки дозвона, отказ от второй попытки, объёмы дня, соблюдение
 * обещанных дат, скорость ответа на лид. Оси считаются по ЕДИНИЦАМ
 * наблюдения (лид, рабочий день, обещание), поэтому загрузчик отдаёт не
 * только агрегаты для «Основания», но и сами ряды единиц — усадку,
 * LOO-норму и подписи по ним делает библиотека.
 */
import type { BX_VOX_CALL_TYPES } from '@lib/bitrix/domain/telephony';

/** Лид портала для скорости ответа (ось 7, под-ось «лиды»). */
export interface StyleCrmLead {
    /** Bitrix-id лида (ключ сущности телефонии — `LEAD:{id}`). */
    id: string;
    /** Bitrix-id ответственного. */
    managerId: string;
    /** Момент создания лида (ISO из `DATE_CREATE`). */
    createdAt: string;
}

/**
 * Обещанная дата из разбора (`nextStep.date`) с сущностью звонка —
 * маркер `promiseKept` (ось 8). Сущность обязательна: без неё «обещание
 * выполнено» превратилось бы в «менеджер вообще звонил в эти дни».
 */
export interface StyleCrmPromise {
    managerId: string;
    /** Ключ сущности телефонии: 'LEAD:42', 'DEAL:17'. */
    entityKey: string;
    /** Обещанная дата 'YYYY-MM-DD'. */
    date: string;
}

/** Пороги счётчиков (документ §2.1); значения по умолчанию — в константах. */
export interface StyleCrmThresholds {
    /** Разговор — не короче стольких секунд при коде 200. */
    conversationMinSec: number;
    /** Звонок дня учитывается в темпе от стольких секунд. */
    tempoMinSec: number;
    /** «Вторая попытка» ожидается в столько рабочих дней. */
    giveUpWorkdays: number;
    /** Обещание считается выполненным при звонке в ±столько дней. */
    promiseWindowDays: number;
    /**
     * Ниже стольких рабочих дней индекс дисперсии не считается
     * (код реестра `style_dispersion_min_days`).
     */
    dispersionMinDays: number;
}

/**
 * Тип звонка телефонии по имени кода `BX_VOX_CALL_TYPES` (исходящий,
 * входящий, входящий с перенаправлением, обратный). Разбор звонка тип
 * (cold / presentation …) знает, а строка телефонии — нет, поэтому
 * «по типам» для жёстких счётчиков — это типы телефонии.
 */
export type StyleCrmCallTypeKey = keyof typeof BX_VOX_CALL_TYPES;

/** Ряды единиц наблюдения одного менеджера — вход осей стиля. */
export interface StyleCrmUnits {
    /** Единица «лид»: попыток до первого разговора (ось 4). */
    attemptsPerLead: number[];
    /** Единица «рабочий день»: исходящих разговоров за день (ось 7). */
    callsPerWorkday: number[];
    /**
     * Единица «рабочий день»: вклад дня в индекс избыточной дисперсии со
     * знаком минус, −(x_d − x̄)² / x̄. Среднее по дням равно −Var/x̄, то
     * есть сравнение средних по менеджерам — это сравнение индексов
     * дисперсии, а больше (ближе к нулю) значит ровнее (ось 8).
     */
    rhythmPerWorkday: number[];
    /**
     * Единица «звонок»: длительности состоявшихся разговоров, сек, по
     * типам телефонии (под-ось «звонки» оси 7, `medianDurationByType`).
     * Ряды хранятся ради точной медианы окна: медиана склейки сегментов
     * считается по объединённой выборке, а не как среднее медиан.
     * В строки осей (`crmStyleRows`) не идут — под-оси со своей единицей
     * и гейтом `n_a = min` по под-осям в модели стиля ещё не собраны.
     */
    conversationSecByType: Record<StyleCrmCallTypeKey, number[]>;
    /** Единица «лид»: скорость ответа на лид в рабочих минутах (ось 7). */
    leadResponseMin: number[];
}

/** Агрегаты для «Основания» подписи и карточки (родные единицы). */
export interface StyleCrmAggregates {
    /** Медиана попыток до первого разговора; null — лидов нет. */
    attemptsMedian: number | null;
    /** Лидов, где первая попытка без разговора. */
    giveUpEvents: number;
    /** Из них без второй попытки в срок. */
    giveUps: number;
    /** Доля 0–1; null — событий нет. */
    giveUpRate: number | null;
    /** Обещанных дат в окне. */
    promises: number;
    /** Из них выполненных (звонок сущности в ±2 дня). */
    promisesKept: number;
    /** Доля 0–1; null — обещаний нет. */
    promiseKeptRate: number | null;
    /** Медиана скорости ответа на лид в рабочих минутах; null — лидов нет. */
    leadResponseMinMedian: number | null;
    /** Медиана длительности состоявшихся разговоров, сек; null — разговоров нет. */
    conversationSecMedian: number | null;
    /**
     * Та же медиана по типам телефонии (`medianDurationByType`, документ
     * §7.2 п. 1); null — разговоров этого типа нет.
     */
    conversationSecMedianByType: Record<StyleCrmCallTypeKey, number | null>;
    /** Var/mean − 1 дневных объёмов; null — рабочих дней мало. */
    dispersionIndex: number | null;
    /** Доля входящих среди звонков; null — звонков нет. */
    incomingShare: number | null;
    /** Исходящих разговоров в среднем за рабочий день; null — дней нет. */
    callsPerWorkdayMean: number | null;
    /** Звонков менеджера в окне (все типы). */
    calls: number;
    /** Рабочих дней в сегменте. */
    workdays: number;
}

/** Счётчики одного менеджера за месячный сегмент. */
export interface StyleCrmManagerMonth extends StyleCrmAggregates {
    managerId: string;
    units: StyleCrmUnits;
}

/** Результат по одному месячному сегменту. */
export interface StyleCrmMonth {
    /** Ключ месяца 'YYYY-MM'. */
    month: string;
    from: string;
    to: string;
    /** Сегмент закрыт и кэшируется долгоживуще. */
    cacheable: boolean;
    /** Значение пришло из кэша — Bitrix в этот сегмент не ходили. */
    fromCache: boolean;
    /** Выборка телефонии обрезана — счётчики занижены, подписи не ставим. */
    truncated: boolean;
    managers: StyleCrmManagerMonth[];
}

/** Итог загрузчика за период. */
export interface StyleCrmResult {
    from: string;
    to: string;
    managerIds: number[];
    months: StyleCrmMonth[];
    /** Счётчики, склеенные по всем месяцам окна (вход осей стиля). */
    managers: StyleCrmManagerMonth[];
    /** Хотя бы один сегмент обрезан. */
    truncated: boolean;
}

/** Опции вызова загрузчика. */
export interface StyleCrmLoadOptions {
    /** Обойти чтение кэша (запись остаётся write-through). */
    forceRefresh?: boolean;
    /** «Сейчас» для определения закрытых месяцев (тесты). */
    now?: Date;
    /** Рабочий календарь портала; по умолчанию — дефолт библиотеки. */
    calendar?: {
        timeZone: string;
        holidays: string[];
        workweek: number[];
    };
    /** Обещанные даты разборов окна (маркер `promiseKept`). */
    promises?: readonly StyleCrmPromise[];
    /** Пороги счётчиков (по умолчанию — STYLE_CRM_THRESHOLDS). */
    thresholds?: Partial<StyleCrmThresholds>;
    /** Потолок строк телефонии на сегмент. */
    maxRows?: number;
}
