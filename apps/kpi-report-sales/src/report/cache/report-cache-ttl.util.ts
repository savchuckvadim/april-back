/**
 * Закрытость периода отчёта и TTL кэша результата (чистые функции).
 *
 * Период закрыт, когда его последний день раньше первого дня ТЕКУЩЕГО
 * месяца: тогда он целиком лежит в прошлых месяцах, и результат можно
 * хранить долго (KPI_CLOSED_PERIOD_TTL_SECONDS). Открытый период (хоть
 * день в текущем месяце или в будущем) живёт только транспортным буфером
 * (KPI_RESULT_TTL_SECONDS).
 *
 * «Текущий месяц» определяется по часам СЕРВЕРА (локальные компоненты
 * Date, как и в month-segments.util). Правки задним числом в закрытом
 * месяце видны только после «Пересчитать» (forceRefresh: true).
 */
import { IsoDate, monthOf } from '../../shared/lib/month-segments.util';
import {
    KPI_CLOSED_PERIOD_TTL_SECONDS,
    KPI_RESULT_TTL_SECONDS,
} from '../constants/report-queue.const';

/**
 * Период закрыт: последний день (включительно, yyyy-MM-dd) строго раньше
 * первого дня текущего месяца. ISO-даты сравниваются строками.
 */
export const isClosedReportPeriod = (
    toIsoInclusive: IsoDate,
    now: Date,
): boolean => toIsoInclusive < `${monthOf(now)}-01`;

/** TTL результата в секундах: долгий для закрытого периода, иначе буфер. */
export const reportResultTtlSeconds = (
    toIsoInclusive: IsoDate,
    now: Date,
): number =>
    isClosedReportPeriod(toIsoInclusive, now)
        ? KPI_CLOSED_PERIOD_TTL_SECONDS
        : KPI_RESULT_TTL_SECONDS;
