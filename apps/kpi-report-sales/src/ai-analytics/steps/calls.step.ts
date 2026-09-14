/**
 * Шаг конвейера «звонки» (план Фазы 2, поток 14b): единственная тяжёлая
 * выборка разборов за период прогона. Строки кладутся в шину под ключом
 * `calls.rows` — соседние шаги (месяц, санити-панель) считают по ним
 * экспозицию и факты типов, второй раз в call-lib никто не ходит.
 *
 * Недельный снапшот менеджера пишет этот же шаг: он собирается ТОЛЬКО из
 * разборов, и разносить выборку и запись по двум шагам значило бы
 * держать строки в шине дольше, чем нужно.
 *
 * Окно прогона:
 * - `weekly` — закончившаяся ISO-неделя, пишутся недельные снапшоты;
 * - `nightly` / `monthly` — календарный месяц, недели не пишутся (иначе
 *   текущая неделя переписывалась бы каждую ночь и плодила superseded);
 * - `backfill` — месяц, если день прогона совпал с последним днём месяца
 *   (джоба месяца), иначе неделя (джоба недели); недельный снапшот
 *   пишется, только если неделя целиком внутри загруженного окна.
 *
 * Неделя без разборов пишется МАРКЕРОМ портального зерна
 * (`managerId: null`, `empty: true`), а строк менеджеров не получает: без
 * маркера догон истории считал бы такую неделю дырой каждую ночь и никогда
 * не сходился бы (аудит Фазы 2, M3). Порог «разбираемого» звонка — карта
 * по типам из `portalMinDurationByType`, та же, что у пульса (M2).
 *
 * `@Injectable` без bitrix-состояния: выборку делает загрузчик call-lib.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import {
    AI_MANAGER_SNAPSHOT_REASONS,
    AI_MANAGER_STEP_CODE,
    AI_CALLS_STEP_RHYTHMS,
    monthBounds,
    weekBounds,
    type AiPeriodBounds,
} from '../constants/ai-manager-snapshot.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    buildManagerWeekPayload,
    emptyWeekPayload,
} from '../domain/assembler/manager-week.assembler';
import { CallsLoader } from '../domain/loaders/calls.loader';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { portalMinDurationByType } from '../domain/loaders/min-duration.util';
import { portalRangeUtc } from '../domain/loaders/period.util';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    AiAnalyticsPipelineStep,
    AiPipelineStepContext,
    AiPipelineStepResult,
    StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Окно выборки прогона и нужно ли писать по нему недельный снапшот. */
export interface CallsStepWindow extends AiPeriodBounds {
    writeWeek: boolean;
}

/** Итог записи недели: строк менеджеров и записей стора (с маркером). */
interface WeekWrite {
    managers: number;
    written: number;
}

/** Неделя целиком внутри окна — недельный снапшот собирается полностью. */
const weekInside = (week: AiPeriodBounds, window: AiPeriodBounds): boolean =>
    week.from >= window.from && week.to <= window.to;

/** Окно прогона по ритму (см. заголовок файла). */
export function callsWindowOf(ctx: AiPipelineStepContext): CallsStepWindow {
    const week = weekBounds(ctx.weekKey);
    const month = monthBounds(ctx.monthKey);
    if (ctx.rhythm === 'weekly') {
        return { ...week, writeWeek: true };
    }
    if (ctx.rhythm === 'backfill') {
        return ctx.day === month.to
            ? { ...month, writeWeek: weekInside(week, month) }
            : { ...week, writeWeek: true };
    }
    return { ...month, writeWeek: false };
}

@Injectable()
export class CallsStep implements AiAnalyticsPipelineStep {
    readonly code = AI_MANAGER_STEP_CODE.calls;
    readonly rhythms = AI_CALLS_STEP_RHYTHMS;

    constructor(
        private readonly calls: CallsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        const window = callsWindowOf(ctx);
        const range = portalRangeUtc(window.from, window.to, ctx.timeZone);
        const rows = await this.calls.loadLite(
            ctx.domain,
            range.from,
            range.to,
        );
        bus.set(AI_PIPELINE_BUS_KEYS.callsRows, rows);
        const values = { ms: 0, rows: rows.length, bitrixCalls: 0 };
        if (!window.writeWeek) {
            return stepOk(this.code, { ...values, ms: Date.now() - startedAt });
        }
        const week = await this.writeWeek(ctx, rows);
        const result = {
            ...values,
            ms: Date.now() - startedAt,
            written: week.written,
        };
        return week.managers === 0
            ? stepSkipped(
                  this.code,
                  AI_MANAGER_SNAPSHOT_REASONS.weekNoAnalysis,
                  result,
              )
            : stepOk(this.code, result);
    }

    /**
     * Недельные снапшоты менеджеров. Менеджер без разборов записи не
     * получает — пустая строка ряда читалась бы трендом как провал, а не
     * как «данных нет». Неделя без единого разбора получает маркер
     * портального зерна — след, что неделя обработана.
     */
    private async writeWeek(
        ctx: AiPipelineStepContext,
        rows: readonly DatedLiteRow[],
    ): Promise<WeekWrite> {
        const week = weekBounds(ctx.weekKey);
        const inWeek = rows.filter(row => {
            const day = toPortalDate(row.callStartedAt, ctx.timeZone);
            return day >= week.from && day <= week.to;
        });
        const meta = {
            calcVersion: ctx.calcVersion,
            paramsVersion: ctx.paramsVersion,
            comparableFrom: ctx.comparableFrom || null,
            generatedAt: ctx.now.toISOString(),
            modelSnapshotId: null,
        };
        const assembly = buildManagerWeekPayload({
            weekKey: ctx.weekKey,
            rows: inWeek,
            scoring: ctx.settings.scoring,
            minDurationSecByType: portalMinDurationByType(ctx.settings),
            comparableFrom: ctx.comparableFrom || null,
            timeZone: ctx.timeZone,
            meta,
        });
        const records =
            assembly.rows.length > 0
                ? assembly.rows
                : [{ managerId: null, payload: emptyWeekPayload(meta) }];
        for (const record of records) {
            await this.snapshots.upsert({
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
                periodKey: ctx.weekKey,
                managerId: record.managerId,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                inputsHash: ctx.inputsHash,
                generatedAt: ctx.now.toISOString(),
                payload: record.payload,
            });
        }
        return { managers: assembly.rows.length, written: records.length };
    }
}
