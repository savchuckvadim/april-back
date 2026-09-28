/**
 * Источники пакета AI-резюме и конструктор факта (план Фазы 2, поток 18,
 * версия 2 «что изменилось и что делать»).
 *
 * Отдельный файл по лимиту 300 строк: формы данных и фабрика факта живут
 * здесь, правила «источник → факт» — в `evidence-pack.facts*.ts` и
 * `evidence-pack.focus.ts`, чтение источников — в
 * `evidence-pack.sources.ts`, сборка — в `evidence-pack.builder.ts`.
 *
 * Чистые типы и функции: без DI, Bitrix и времени.
 */
import {
    buildFactText,
    compareFact,
    formatFactValue,
    type AiBriefFact,
    type BriefPeriod,
} from '@lib/sales-ai-analytics';
import {
    AI_BRIEF_FACT_SPECS,
    type AiBriefFactCode,
} from '../constants/ai-brief.const';
import type { ForecastPayload } from '../domain/assembler/forecast.types';
import type {
    ManagerMonthPayload,
    ManagerWeekPayload,
} from '../domain/assembler/manager-snapshot.types';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import type { AiAgendaDto } from '../dto/ai-agenda.dto';
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';
import type { BriefPrevFacts } from './evidence-pack.prev';

/** Что описывает пакет: домен, период и периметр менеджеров. */
export interface BriefPackInput {
    domain: string;
    /** Начало периода 'YYYY-MM-DD' в TZ портала. */
    from: string;
    /** Конец периода 'YYYY-MM-DD' в TZ портала. */
    to: string;
    /**
     * Менеджеры периметра; пусто — весь ростер (кэш обзора читается по
     * кэшированному ростеру портала, если он есть).
     */
    managerIds: number[];
    /** «Сейчас» (тесты и крон); по умолчанию — текущее время. */
    now?: Date;
}

/** Нагрузка снапшота вместе с менеджером и ключом периода записи. */
export interface BriefManagerRow<T> {
    managerId: string;
    /** Ключ периода записи (`activity_id`): месяц, неделя или день. */
    periodKey: string;
    payload: T;
}

/** Эфирное время отдела из кэша модуля airtime: сумма и число ячеек. */
export interface BriefAirtimeFacts {
    totalSeconds: number;
    cells: number;
}

/** Всё, из чего собирается пакет: кэш витрины и снапшоты конвейера. */
export interface BriefPackSources {
    /** Кэш пульса за последний рабочий день; null — промах. */
    pulse: AiPulseDto | null;
    /** Кэш обзора периода; null — промах или конверт ошибки. */
    overview: AiOverviewDto | null;
    /**
     * Факты прошлого периода той же длины: кэш `brief:prev` либо
     * выжимка из кэша обзора прошлого окна; null — данных нет.
     */
    prevFacts: BriefPrevFacts | null;
    /** Кэш повестки планёрки текущей недели; null — промах. */
    agenda: AiAgendaDto | null;
    /** Кэш эфирного времени месяца; null — промах или список пуст. */
    airtime: BriefAirtimeFacts | null;
    weeks: readonly BriefManagerRow<ManagerWeekPayload>[];
    /** Месячные снапшоты месяца конца периода. */
    months: readonly BriefManagerRow<ManagerMonthPayload>[];
    forecasts: readonly BriefManagerRow<ForecastPayload>[];
    /** Снапшот модели портала месяца; null — модели нет. */
    model: PortalModelPayload | null;
    /** Начало сравнимой истории 'YYYY-MM-DD'; '' — не ограничена. */
    comparableFrom: string;
    /** Прошлый период той же длины, примыкающий к текущему. */
    previousPeriod: BriefPeriod;
    /** Прошлый период раньше сравнимой истории — сравнений нет. */
    beforeComparable: boolean;
}

/** Необязательные уточнения факта: подпись, объём, адресат, сравнение. */
export interface BriefFactOptions {
    title?: string;
    n?: number;
    managerId?: string;
    callType?: string;
    /** Готовая фраза факта; по умолчанию — `buildFactText` (+ «было …»). */
    text?: string;
    /** Значение за прошлый период; null или нет — сравнения нет. */
    prev?: number | null;
    /**
     * false снимает сравнение (прошлый период несопоставим); true его не
     * навязывает — без чисел с обеих сторон сравнения всё равно нет.
     */
    comparable?: boolean;
    /** С чем сравниваем, словами; у несравнённого факта без нормы снимается. */
    basis?: string;
    norm?: number | null;
    plan?: number | null;
    link?: string | null;
    signal?: string;
}

const isNumber = (value: number | null): value is number =>
    value !== null && Number.isFinite(value);

/**
 * Факт по коду таблицы состава: вид, единица и подпись берутся из реестра
 * фактов, фраза печатается общим форматированием библиотеки — тем же,
 * которым факт-чек разбирает числа буллетов. С прошлым периодом фраза
 * получает хвост «(было …)», а изменение считается `compareFact`.
 */
export function briefFact(
    code: AiBriefFactCode,
    value: number | null,
    options: BriefFactOptions = {},
): AiBriefFact {
    const spec = AI_BRIEF_FACT_SPECS[code];
    const prev = options.prev ?? null;
    const comparable =
        options.comparable !== false && isNumber(prev) && isNumber(value);
    const { delta, deltaPct } = comparable
        ? compareFact(value, prev)
        : { delta: null, deltaPct: null };
    const basis =
        comparable || isNumber(options.norm ?? null)
            ? options.basis
            : undefined;
    const base = {
        code,
        kind: spec.kind,
        title: options.title ?? spec.title,
        value,
        unit: spec.unit,
    };
    const text =
        options.text ??
        (comparable && prev !== null
            ? `${buildFactText(base)} (было ${formatFactValue(prev, spec.unit)})`
            : buildFactText(base));

    return {
        ...base,
        text,
        comparable,
        prev: comparable ? prev : null,
        delta,
        deltaPct,
        ...(options.n === undefined ? {} : { n: options.n }),
        ...(options.managerId === undefined
            ? {}
            : { managerId: options.managerId }),
        ...(options.callType === undefined
            ? {}
            : { callType: options.callType }),
        ...(basis === undefined ? {} : { basis }),
        ...(options.norm === undefined ? {} : { norm: options.norm }),
        ...(options.plan === undefined ? {} : { plan: options.plan }),
        ...(options.link === undefined ? {} : { link: options.link }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
}
