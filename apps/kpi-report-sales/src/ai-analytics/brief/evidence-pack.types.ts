/**
 * Источники пакета AI-резюме и конструктор факта (план Фазы 2, поток 18).
 *
 * Отдельный файл по лимиту 300 строк: формы данных и фабрика факта живут
 * здесь, сами правила «источник → факт» — в `evidence-pack.facts.ts`,
 * чтение источников — в `evidence-pack.builder.ts`.
 *
 * Чистые типы и функции: без DI, Bitrix и времени.
 */
import { buildFactText, type AiBriefFact } from '@lib/sales-ai-analytics';
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
import type { AiOverviewDto } from '../dto/ai-overview.dto';
import type { AiPulseDto } from '../dto/ai-pulse.dto';

/** Нагрузка снапшота вместе с менеджером записи (managerId — колонка ais). */
export interface BriefManagerRow<T> {
    managerId: string;
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
    /** Кэш эфирного времени месяца; null — промах или список пуст. */
    airtime: BriefAirtimeFacts | null;
    weeks: readonly BriefManagerRow<ManagerWeekPayload>[];
    months: readonly BriefManagerRow<ManagerMonthPayload>[];
    forecasts: readonly BriefManagerRow<ForecastPayload>[];
    /** Снапшот модели портала месяца; null — модели нет. */
    model: PortalModelPayload | null;
}

/** Необязательные уточнения факта: подпись, объём, адресат. */
export interface BriefFactOptions {
    title?: string;
    n?: number;
    managerId?: string;
    callType?: string;
    /** Готовая фраза факта; по умолчанию — `buildFactText`. */
    text?: string;
}

/**
 * Факт по коду таблицы состава: вид, единица и подпись берутся из реестра
 * фактов, фраза печатается общим форматированием библиотеки — тем же,
 * которым факт-чек разбирает числа буллетов.
 */
export function briefFact(
    code: AiBriefFactCode,
    value: number | null,
    options: BriefFactOptions = {},
): AiBriefFact {
    const spec = AI_BRIEF_FACT_SPECS[code];
    const base = {
        code,
        kind: spec.kind,
        title: options.title ?? spec.title,
        value,
        unit: spec.unit,
        ...(options.n === undefined ? {} : { n: options.n }),
        ...(options.managerId === undefined
            ? {}
            : { managerId: options.managerId }),
        ...(options.callType === undefined
            ? {}
            : { callType: options.callType }),
    };

    return { ...base, text: options.text ?? buildFactText(base) };
}
