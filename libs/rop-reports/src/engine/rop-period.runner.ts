import { Injectable, Logger } from '@nestjs/common';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import { RopPeriod, ropPeriodWindow } from '../period/rop-period';
import { RopPortalCalendar } from '../ports/rop-calendar.port';
import { ROP_LOCK_TTL_SEC, ROP_MARK_TTL_SEC } from '../state/rop-keys';
import { RopRunStateService } from '../state/rop-run-state.service';
import { ROP_RUN_STATUS, RopRunSummary } from '../state/rop-run-summary';
import {
    isRopDelivered,
    RopCommonOptions,
    RopReportDefinition,
    RopRunMode,
    RopRunResult,
} from './rop-report.definition';
import { RopTickOutcome } from './rop-tick-report';

/** Всё, что нужно прогону одного периода портала. */
export interface RopPeriodRunInput<TOptions extends RopCommonOptions> {
    readonly definition: RopReportDefinition<TOptions>;
    readonly domain: string;
    readonly period: RopPeriod;
    readonly options: TOptions;
    readonly portal: RopPortalCalendar;
    readonly mode: RopRunMode;
    readonly now: Date;
    /** Продлить замок тика вместе с замком портала (крон); нет — ручной запуск. */
    readonly extendTick?: () => Promise<void>;
}

/**
 * Прогон ОДНОГО периода портала с замком, метками и повторами — общая
 * часть крона и ручного запуска (обобщение `runDomain` отчёта по дублям).
 *
 * Замок портала общий для крона и ручного запуска: занят — итог «занят»,
 * без счёта неудачи. Метка выпуска ставится после доставки: крон — всегда,
 * ручной запуск — только с задачами и без пробы (иначе крон следом
 * выпустил бы период второй раз). Сбой крона — попытка периода: в Telegram
 * первая и последняя, после последней период закрывается.
 *
 * `@Injectable` без Битрикса: только Redis-состояние.
 */
@Injectable()
export class RopPeriodRunner {
    private readonly logger = new Logger(RopPeriodRunner.name);

    constructor(private readonly state: RopRunStateService) {}

    async run<TOptions extends RopCommonOptions>(
        input: RopPeriodRunInput<TOptions>,
    ): Promise<RopTickOutcome> {
        const { definition, domain, period, mode } = input;
        const lockKey = definition.keys.lock(domain);
        const token = await this.state.lock(lockKey, ROP_LOCK_TTL_SEC);
        if (!token) return { kind: 'busy', domain, period };
        const warnings: string[] = [];
        try {
            const result = await definition.run(
                {
                    domain,
                    period: ropPeriodWindow(period, input.portal.timezone),
                    options: input.options,
                    mode,
                    now: input.now,
                    heartbeat: async () => {
                        await this.state.extend(
                            lockKey,
                            token,
                            ROP_LOCK_TTL_SEC,
                        );
                        await input.extendTick?.();
                    },
                },
                warnings,
            );
            await this.saveSummary(input, result, null);
            if (!isRopDelivered(result)) {
                return this.failed(
                    input,
                    `задачи поставлены не всем: ${result.tasksCreated + result.tasksAlreadyDone} из ${result.recipients}` +
                        (result.warnings[0] ? ` — ${result.warnings[0]}` : ''),
                );
            }
            if (
                !mode.force ||
                (!result.countOnly && mode.previewUserId === null)
            ) {
                await this.markReleased(input, result.countOnly);
            }
            return { kind: 'ran', domain, period, result };
        } catch (error) {
            const message = getErrorString(error);
            await this.saveSummary(input, null, message, warnings);
            return this.failed(input, message);
        } finally {
            await this.state.unlock(lockKey, token);
        }
    }

    /** Период выпущен: метка (своя у «только считать») и сброс неудач. */
    private async markReleased<TOptions extends RopCommonOptions>(
        input: RopPeriodRunInput<TOptions>,
        countOnly: boolean,
    ): Promise<void> {
        const { definition, domain, period } = input;
        await this.state.markReleased(
            definition.keys.released(domain, period.kind, countOnly),
            period.key,
            ROP_MARK_TTL_SEC[period.kind],
        );
        await this.state.clearFailures(
            definition.keys.failures(domain, period.kind),
        );
    }

    /**
     * Сбой: у ручного запуска — просто итог. У крона — попытка периода;
     * после последней период закрывается, чтобы сбой настройки не стучал
     * в чат каждый час до конца периода.
     */
    private async failed<TOptions extends RopCommonOptions>(
        input: RopPeriodRunInput<TOptions>,
        error: string,
    ): Promise<RopTickOutcome> {
        const { definition, domain, period, mode } = input;
        this.logger.error(
            `[${definition.code}] ${domain} ${period.key}: ${error}`,
        );
        if (mode.force) return { kind: 'failed', domain, period, error };
        const attempt = await this.state.registerFailure(
            definition.keys.failures(domain, period.kind),
            period.key,
            ROP_MARK_TTL_SEC[period.kind],
        );
        if (attempt >= definition.maxAttempts) {
            await this.markReleased(input, mode.countOnly);
            return {
                kind: 'failed',
                domain,
                period,
                error,
                attempt,
                gaveUp: true,
            };
        }
        return attempt === 1
            ? { kind: 'failed', domain, period, error, attempt }
            : { kind: 'retrying', domain, period, error, attempt };
    }

    /** Итог для админки: удачный прогон или причина сбоя. */
    private async saveSummary<TOptions extends RopCommonOptions>(
        input: RopPeriodRunInput<TOptions>,
        result: RopRunResult | null,
        error: string | null,
        warnings: readonly string[] = [],
    ): Promise<void> {
        const { definition, domain, period, mode } = input;
        const summary: RopRunSummary = {
            kind: period.kind,
            periodKey: period.key,
            at: input.now.toISOString(),
            status: result ? ROP_RUN_STATUS.ran : ROP_RUN_STATUS.failed,
            countOnly: result?.countOnly ?? mode.countOnly,
            preview: mode.previewUserId !== null,
            recipients: result?.recipients ?? 0,
            tasksCreated: result?.tasksCreated ?? 0,
            tasksAlreadyDone: result?.tasksAlreadyDone ?? 0,
            tasksClosed: result?.tasksClosed ?? 0,
            summary: result?.summary ?? [],
            warnings: result?.warnings ?? warnings,
            error,
        };
        await this.state.saveLastRun(
            definition.keys.lastRun(domain, period.kind),
            summary,
            ROP_MARK_TTL_SEC[period.kind],
        );
    }
}
