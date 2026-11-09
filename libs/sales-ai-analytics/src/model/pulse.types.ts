import type { MetricValue } from './metric';
import type { MinDurationSecByType } from './pulse-duration';
import type { WorkCalendar } from './workdays.util';
import type { XmrPoint, XmrResult } from './xmr';

/** Следующий шаг из разбора: назначен ли и есть ли дата. */
export interface PulseNextStep {
    set: boolean;
    date: string | null;
}

/** Строка звонка для пульса (lite-выборка без текста транскрипта). */
export interface PulseCallRow {
    transcriptionId: string;
    managerId: string | null;
    callStartedAt: Date;
    durationSec: number | null;
    /**
     * Тип звонка классификатора: нужен только для порога длительности по
     * типу. Поля нет или null — порог берётся из ключа «все прочие типы».
     */
    callType?: string | null;
    analysisPresent: boolean;
    nextStep: PulseNextStep | null;
    riskFlags: string[];
    coachingPriority: string | null;
    /**
     * Общая оценка разбора по шкале lite-строки 0–100 — для выбора
     * звонка-образца. Поля нет или null — оценка не известна, образцом
     * такой звонок не станет.
     */
    score?: number | null;
}

export interface PulseWindow {
    from: string;
    to: string;
    workdays: string[];
}

export interface PulseManagerRow {
    managerId: string;
    analyzed: number;
    nextStepDateRate: MetricValue;
    /**
     * Свежие разобранные звонки окна без договорённости с датой (не больше
     * PULSE_DEFAULTS.examplesPerManager) — их руководитель разбирает с
     * менеджером.
     */
    noDateCallIds: string[];
    /**
     * Звонок-образец: разобранный звонок окна с договорённостью и датой и
     * лучшей общей оценкой разбора — не ниже PULSE_DEFAULTS.exemplarMinScore
     * или выше средней по разобранным звонкам окна (см. pulse-exemplar);
     * такого нет — null.
     */
    dateCallId: string | null;
}

/** Окно перед текущим — для «неделей раньше». */
export interface PulsePreviousWindow {
    from: string;
    to: string;
    analyzedCalls: number;
    nextStepDateRate: MetricValue;
}

export interface PulseResult {
    window: PulseWindow;
    /** Доля разобранных звонков окна с назначенным шагом и датой. */
    nextStepDateRate: MetricValue;
    /** Такое же окно перед текущим; разборов в нём нет — null. */
    previous: PulsePreviousWindow | null;
    /**
     * XmR по дневным долям истории — только дни, где разборов не меньше
     * xmrDayMinN (null при < 3 таких дней).
     */
    xmr: XmrResult | null;
    /** Дневные доли по рабочим дням истории (только дни с разборами). */
    daily: XmrPoint[];
    analyzedCalls: number;
    /**
     * Доля коротких звонков (короче порога своего типа) среди звонков окна
     * в выборке, %. Выборка — уже расшифрованные звонки, короткие туда почти
     * не попадают: долю разговоров портала берите из телефонии.
     */
    shortCallsSharePct: number;
    /** Порог «короткого» звонка, с: типы вне карты и звонки без типа. */
    minDurationSec: number;
    /** Применённый минимум разборов менеджера для строки byManager. */
    managerMinN: number;
    /** Менеджеры с analyzed ≥ managerMinN, по managerId. */
    byManager: PulseManagerRow[];
}

export interface PulseOptions {
    /** Последний день окна (YYYY-MM-DD в TZ портала). */
    endDate: string;
    calendar: WorkCalendar;
    /** Рабочих дней в окне доли (по умолчанию 5). */
    windowWorkdays?: number;
    /** Рабочих дней истории для дневного ряда XmR (по умолчанию 25). */
    historyWorkdays?: number;
    /**
     * Минимум разобранных звонков менеджера для строки byManager (код
     * реестра `pulse_manager_min_n`, портал может переопределить); нет —
     * дефолт реестра. Тот же порог решает, с какого n доля строки
     * показывается числом.
     */
    managerMinN?: number;
    /**
     * Пороги «разбираемого» звонка по типу (реестр
     * `min_duration_sec_by_type`, решение владельца А.1). Опции нет —
     * поведение Фазы 1a: единый порог `AI_ANALYTICS_THRESHOLDS.shortCallSec`.
     */
    minDurationSecByType?: MinDurationSecByType;
    /**
     * Рабочий по календарю день без единого звонка в выборке считать
     * выходным и брать в окно день раньше (pulseWindowDays). Нет — окно
     * строго по календарю.
     */
    skipDaysWithoutCalls?: boolean;
    /** Минимум разборов дня для точки XmR (по умолчанию PULSE_DEFAULTS). */
    xmrDayMinN?: number;
}
