/**
 * Догон истории снапшотов (план Фазы 2, поток 12 «механика backfill из
 * P2-43»): ночью, окном, с лимитами и без пересчёта уже посчитанного.
 *
 * Правила, которые нельзя нарушать:
 * 1. только в ночном окне 22:00–06:00 по TZ портала — днём выборки Битрикс
 *    конкурируют с витриной; вне окна план ПУСТ и объяснён `reason`;
 * 2. не больше `maxMonthsPerNight` месяцев за ночь и `weekLimit` недель —
 *    иначе один портал занял бы очередь на всю ночь;
 * 3. идемпотентность: период со снапшотом не пересчитывается без
 *    `forceRefresh`, а `jobId` детерминирован (повтор Bull игнорирует);
 * 4. сходимость (аудит Фазы 2, M3): период закрыт ЛЮБОЙ актуальной записью
 *    типа — строкой менеджера или маркером пустой недели (`managerId:
 *    null`) шага звонков; джоба недели несёт белый список
 *    `AI_BACKFILL_WEEK_STEPS` (только `calls`) и месяц не переписывает;
 *    заморозку догнанного месяца шаг финансов ставит по дню прогона.
 *
 * Админ-ручка backfill — Фаза 3 (§1.1): здесь только ночной конвейер.
 */
import { Injectable, Logger } from '@nestjs/common';
import { QueueDispatcherService } from '@/modules/queue';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AiAnalyticsSnapshotType,
    shiftDate,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_BACKFILL_WEEK_STEPS,
    weekBounds,
} from '../constants/ai-manager-snapshot.const';
import {
    AI_PIPELINE_BACKFILL,
    AI_PIPELINE_JOB_OPTIONS,
    buildPipelineJobId,
    previousMonthKey,
} from '../constants/ai-snapshot.const';
import { portalHour } from '../cron/local-hour.util';
import { isoWeekKey, weekMondayOf } from '../domain/loaders/period.util';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import {
    AiSnapshotBackfillPlan,
    AiSnapshotJobData,
} from '../dto/ai-snapshot.dto';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';

/** Почему план догона пуст (в журнал прогона и в логи). */
export const AI_BACKFILL_REASONS = {
    /** Сейчас не ночь портала — работаем только в окне 22:00–06:00. */
    windowClosed: 'backfill-window-closed',
    /** AI-аналитика на портале выключена. */
    disabled: 'backfill-portal-disabled',
    /** Дыр в истории нет — всё уже посчитано. */
    nothingToDo: 'backfill-nothing-to-do',
} as const;
export type AiBackfillReason =
    (typeof AI_BACKFILL_REASONS)[keyof typeof AI_BACKFILL_REASONS];

/** По умолчанию ищем дыры на год назад по месяцам и на квартал по неделям. */
export const AI_BACKFILL_LOOKBACK = { months: 12, weeks: 13 } as const;

export interface AiBackfillOptions {
    /** Момент планирования (время параметром, не `new Date()` внутри). */
    now?: Date;
    /** Глубина поиска дыр по месяцам (по умолчанию 12). */
    monthsBack?: number;
    /** Глубина поиска дыр по неделям (по умолчанию 13). */
    weeksBack?: number;
    /** Пересчитать даже посчитанные периоды. */
    forceRefresh?: boolean;
    /** Не проверять ночное окно (ручной прогон, тесты). */
    ignoreWindow?: boolean;
}

/** Пустой план с объяснением — единственная форма «сегодня не догоняем». */
const emptyPlan = (reason: AiBackfillReason): AiSnapshotBackfillPlan => ({
    monthKeys: [],
    weekKeys: [],
    reason,
});

/** Час суток в TZ портала (0–23): единые часы портала с кронами (П10). */
export { portalHour };

/** Ночное окно портала: с 22:00 до 06:00 (границы из констант ритмов). */
export function isBackfillWindow(now: Date, timeZone: string): boolean {
    const hour = portalHour(now, timeZone);
    return (
        hour >= AI_PIPELINE_BACKFILL.windowFromHour ||
        hour < AI_PIPELINE_BACKFILL.windowToHour
    );
}

/** Последний день месяца 'YYYY-MM' (день прогона джобы месяца). */
export function monthLastDay(monthKey: string): string {
    const nextMonth = shiftDate(`${monthKey}-01`, 31).slice(0, 7);
    return shiftDate(`${nextMonth}-01`, -1);
}

/** Закрытые месяцы перед месяцем дня, свежие первыми. */
function closedMonths(day: string, depth: number): string[] {
    const months: string[] = [];
    let cursor = `${day.slice(0, 7)}-01`;
    for (let index = 0; index < depth; index += 1) {
        const month = previousMonthKey(cursor);
        months.push(month);
        cursor = `${month}-01`;
    }
    return months;
}

/** Закончившиеся ISO-недели перед неделей дня, свежие первыми. */
function closedWeeks(day: string, depth: number): string[] {
    const weeks: string[] = [];
    let monday = weekMondayOf(day);
    for (let index = 0; index < depth; index += 1) {
        monday = shiftDate(monday, -7);
        weeks.push(isoWeekKey(monday));
    }
    return weeks;
}

/**
 * Планировщик догона истории: ищет периоды без снапшотов и ставит на них
 * джобы ритма `backfill` — по одной на период, чтобы раннер считал их
 * последовательно (слот портала сериализует прогоны сам).
 *
 * `@Injectable` без bitrix-состояния: Битрикс трогают шаги конвейера.
 */
@Injectable()
export class AiAnalyticsBackfillService {
    private readonly logger = new Logger(AiAnalyticsBackfillService.name);

    constructor(
        private readonly settings: SettingsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly dispatcher: QueueDispatcherService,
    ) {}

    /** План на ночь: месяцы и недели без снапшотов в пределах лимитов. */
    async plan(
        domain: string,
        options: AiBackfillOptions = {},
    ): Promise<AiSnapshotBackfillPlan> {
        const settings = await this.settings.load(domain);
        if (!settings.enabled) return emptyPlan(AI_BACKFILL_REASONS.disabled);
        const now = options.now ?? new Date();
        const timeZone = settings.calendar.timeZone;
        if (!options.ignoreWindow && !isBackfillWindow(now, timeZone)) {
            return emptyPlan(AI_BACKFILL_REASONS.windowClosed);
        }
        const day = toPortalDate(now, timeZone);
        const months = closedMonths(
            day,
            options.monthsBack ?? AI_BACKFILL_LOOKBACK.months,
        );
        const weeks = closedWeeks(
            day,
            options.weeksBack ?? AI_BACKFILL_LOOKBACK.weeks,
        );
        const [missingMonths, missingWeeks] = await Promise.all([
            this.missing(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
                months,
                options.forceRefresh,
            ),
            this.missing(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
                weeks,
                options.forceRefresh,
            ),
        ]);
        const monthKeys = missingMonths.slice(
            0,
            AI_PIPELINE_BACKFILL.maxMonthsPerNight,
        );
        const weekKeys = missingWeeks.slice(0, AI_PIPELINE_BACKFILL.weekLimit);
        if (monthKeys.length === 0 && weekKeys.length === 0) {
            return emptyPlan(AI_BACKFILL_REASONS.nothingToDo);
        }
        return { monthKeys, weekKeys };
    }

    /**
     * Ставит джобы плана: одна джоба на период, `jobId` детерминирован —
     * повторный тик за ту же ночь дублей не создаёт. Возвращает jobId'ы.
     */
    async dispatch(
        domain: string,
        options: AiBackfillOptions = {},
    ): Promise<string[]> {
        const now = options.now ?? new Date();
        const plan = await this.plan(domain, { ...options, now });
        if (plan.reason) {
            this.logger.log(`Догон истории ${domain} пропущен: ${plan.reason}`);
            return [];
        }
        const jobs: { key: string; data: AiSnapshotJobData }[] = [
            ...plan.monthKeys.map(monthKey => ({
                key: monthKey,
                data: this.monthJob(domain, monthKey, plan),
            })),
            ...plan.weekKeys.map(weekKey => ({
                key: weekKey,
                data: this.weekJob(domain, weekKey, plan),
            })),
        ];
        const jobIds: string[] = [];
        for (const job of jobs) {
            jobIds.push(await this.enqueue(job.data, job.key));
        }
        this.logger.log(
            `Догон истории ${domain}: месяцев ${plan.monthKeys.length}, ` +
                `недель ${plan.weekKeys.length}`,
        );
        return jobIds;
    }

    /**
     * Периоды без актуальной записи типа (forceRefresh — все). Считается
     * любая запись периода: строка менеджера или маркер пустой недели.
     */
    private async missing(
        domain: string,
        type: AiAnalyticsSnapshotType,
        periodKeys: readonly string[],
        forceRefresh?: boolean,
    ): Promise<string[]> {
        if (forceRefresh) return [...periodKeys];
        const records = await this.snapshots.findByKeys(domain, type, {
            periodKeys,
        });
        const done = new Set(records.map(record => record.periodKey));
        return periodKeys.filter(key => !done.has(key));
    }

    /** Джоба месяца: день прогона — последний день этого месяца. */
    private monthJob(
        domain: string,
        monthKey: string,
        backfill: AiSnapshotBackfillPlan,
    ): AiSnapshotJobData {
        const day = monthLastDay(monthKey);
        return {
            domain,
            kind: 'backfill',
            monthKey,
            day,
            weekKey: isoWeekKey(day),
            backfill,
        };
    }

    /**
     * Джоба недели: день прогона — воскресенье этой недели, шаги — только
     * белый список недели (месяц этой недели джоба не переписывает).
     */
    private weekJob(
        domain: string,
        weekKey: string,
        backfill: AiSnapshotBackfillPlan,
    ): AiSnapshotJobData {
        const day = weekBounds(weekKey).to;
        return {
            domain,
            kind: 'backfill',
            monthKey: day.slice(0, 7),
            day,
            weekKey,
            steps: [...AI_BACKFILL_WEEK_STEPS],
            backfill,
        };
    }

    /** Одна джоба ритма backfill с ключом дедупликации по периоду. */
    private async enqueue(
        job: AiSnapshotJobData,
        key: string,
    ): Promise<string> {
        const jobId = buildPipelineJobId('backfill', job.domain, key);
        await this.dispatcher.dispatch<AiSnapshotJobData>(
            QueueNames.SALES_KPI_REPORT,
            JobNames.SALES_AI_ANALYTICS_SNAPSHOT,
            job,
            jobId,
            AI_PIPELINE_JOB_OPTIONS,
        );
        return jobId;
    }
}
