/**
 * Чистые помощники выборки источников досье (план Фазы 3, П4): ключи
 * недель окна, граница выборки реакций, перевод записи стора в вид
 * снапшота и разбор готовности из нагрузки модели портала.
 *
 * Вынесены из `dossier-sources.loader.ts` по правилу «файл не длиннее
 * 300 строк» (образец деления — `manager-passport.util.ts`). Чистые
 * функции: без DI, Bitrix и Prisma.
 */
import {
    AI_ANALYTICS_READINESS_MODES,
    type AiAnalyticsReadinessMode,
} from '../../constants/ai-analytics.const';
import { AI_BETA_SOURCES, type AiBetaSource } from '@lib/sales-ai-analytics';
import { AI_DOSSIER_WEEKS_PER_MONTH } from '../../constants/ai-dossier.const';
import type { ReadinessDto } from '../../dto/readiness.dto';
import type { DossierSnapshotView } from '../assembler/dossier.reader';
import { isoWeekKey } from './period.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Запись стора → вид снапшота глазами досье. */
export function toView(record: {
    id: string;
    periodKey: string;
    managerId: string | null;
    payload: unknown;
    generatedAt: string;
}): DossierSnapshotView {
    return {
        id: record.id,
        periodKey: record.periodKey,
        managerId: record.managerId,
        payload: record.payload,
        generatedAt: record.generatedAt,
    };
}

/** Месяц, следующий за данным (верхняя граница выборки реакций). */
export function monthAfter(monthKey: string): string {
    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));

    return month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Ключи ISO-недель, перекрывающих месяцы окна: от первого числа первого
 * месяца шагами по 7 дней с запасом в одну неделю на месяц. Повторы
 * убираются — стор принимает список ключей.
 */
export function weekKeysOf(months: readonly string[]): string[] {
    const first = months[0];
    if (first === undefined) return [];
    const start = Date.parse(`${first}-01T00:00:00.000Z`);
    const weeks = months.length * AI_DOSSIER_WEEKS_PER_MONTH;

    return [
        ...new Set(
            Array.from({ length: weeks }, (_, index) =>
                isoWeekKey(
                    new Date(start + index * 7 * DAY_MS)
                        .toISOString()
                        .slice(0, 10),
                ),
            ),
        ),
    ];
}

/** Целое число нагрузки; не число — 0. */
function countOf(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Нагрузка модели портала → готовность витрины; чужая форма → null.
 * Читается структурно: незнакомый режим означает «готовности нет», а не
 * падение досье.
 */
export function toReadiness(payload: unknown): ReadinessDto | null {
    const source = payload as Record<string, unknown> | null;
    const readiness = source?.readiness;
    if (typeof readiness !== 'object' || readiness === null) return null;
    const value = readiness as Record<string, unknown>;
    const mode = value.mode;
    if (
        typeof mode !== 'string' ||
        !(AI_ANALYTICS_READINESS_MODES as readonly string[]).includes(mode)
    ) {
        return null;
    }
    const betaSource = value.betaSource;

    return {
        mode: mode as AiAnalyticsReadinessMode,
        historyMonths: countOf(value.historyMonths),
        presentations: countOf(value.presentations),
        sales: countOf(value.sales),
        comparableFrom:
            typeof value.comparableFrom === 'string'
                ? value.comparableFrom
                : '',
        reasons: Array.isArray(value.reasons)
            ? value.reasons.filter(
                  (reason): reason is string => typeof reason === 'string',
              )
            : [],
        betaSource:
            typeof betaSource === 'string' &&
            (AI_BETA_SOURCES as readonly string[]).includes(betaSource)
                ? (betaSource as AiBetaSource)
                : 'none',
        betaCountdown: null,
    };
}
