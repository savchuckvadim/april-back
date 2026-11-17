import { Injectable, Logger } from '@nestjs/common';
import { getErrorString } from '@lib/shared/lib/utils/get-error-string.util';
import { RopPortalCalendar } from '../ports/rop-calendar.port';
import {
    ROP_LOCK_TTL_SEC,
    ROP_SETUP_FAILURE_TTL_SEC,
    ROP_SETUP_SCOPE,
} from '../state/rop-keys';
import { RopRunStateService } from '../state/rop-run-state.service';
import { RopPeriodRunner } from './rop-period.runner';
import { RopCommonOptions, RopReportDefinition } from './rop-report.definition';
import { ropRequestedPeriod, RopRunNowRequest } from './rop-run-now';
import {
    formatRopTick,
    RopTickOutcome,
    shouldNotifyRopTick,
} from './rop-tick-report';

/**
 * Движок отчётов РОПу — обобщение планировщика отчёта по дублям.
 *
 * Тик (вызывает тонкий `@Cron`-планировщик отчёта в приложении): порталы
 * с включённым отчётом → настройки и календарь портала → политики «пора
 * ли» по каждому виду периода → период ещё не выпущен → прогон периода
 * (`RopPeriodRunner`: замок портала, метки, повторы). Замок тика не даёт
 * двум тикам отчёта наложиться; ошибка одного портала не роняет цикл.
 * Итог — в Telegram, только если что-то прогнано или впервые упало.
 *
 * `@Injectable` без Битрикса: только Redis-состояние и определение отчёта.
 */
@Injectable()
export class RopReportTicker {
    private readonly logger = new Logger(RopReportTicker.name);

    constructor(
        private readonly state: RopRunStateService,
        private readonly runner: RopPeriodRunner,
    ) {}

    async tick<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
        now: Date = new Date(),
    ): Promise<void> {
        const domains = await this.enabledDomains(definition);
        if (!domains) return;
        if (!domains.length) {
            this.logger.log(
                `[${definition.code}] отчёт не включён ни на одном портале`,
            );
            return;
        }
        const tickKey = definition.keys.tickLock();
        const token = await this.state.lock(tickKey, ROP_LOCK_TTL_SEC);
        if (!token) {
            this.logger.warn(
                `[${definition.code}] прошлый тик ещё идёт (или Redis недоступен) — пропуск`,
            );
            return;
        }
        const extendTick = () =>
            this.state.extend(tickKey, token, ROP_LOCK_TTL_SEC);
        try {
            const outcomes: RopTickOutcome[] = [];
            for (const domain of domains) {
                await extendTick();
                // Сбой одного портала цикл не роняет.
                const domainOutcomes = await this.tickDomain(
                    definition,
                    domain,
                    now,
                    extendTick,
                ).catch((error: unknown): RopTickOutcome[] => [
                    {
                        kind: 'failed',
                        domain,
                        period: null,
                        error: getErrorString(error),
                    },
                ]);
                outcomes.push(...domainOutcomes);
            }
            this.notify(definition, outcomes);
        } finally {
            await this.state.unlock(tickKey, token);
        }
    }

    /**
     * Ручной запуск периода сейчас: день и час не проверяются, «включён»
     * не важен. Идёт до конца (джоб очереди активен, пока идёт прогон);
     * портал занят — `busy`, очередь повторит позже. Итог — в Telegram.
     */
    async runNow<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
        request: RopRunNowRequest,
        now: Date = new Date(),
    ): Promise<RopTickOutcome> {
        const { domain } = request;
        let outcome: RopTickOutcome;
        try {
            const preview = request.previewUserId ?? null;
            const options = await definition.resolveOptions(domain, {
                countOnly: request.countOnly,
            });
            const portal = await definition.calendar.resolve(domain);
            const period = ropRequestedPeriod(request, portal.timezone, now);
            outcome = await this.runner.run({
                definition,
                domain,
                period,
                options,
                portal,
                // Проба всегда ставит задачу — иначе смотреть нечего.
                mode: {
                    countOnly: preview === null && options.countOnly,
                    previewUserId: preview,
                    force: true,
                },
                now,
            });
        } catch (error) {
            outcome = {
                kind: 'failed',
                domain,
                period: null,
                error: getErrorString(error),
            };
        }
        if (outcome.kind !== 'busy') this.notify(definition, [outcome]);
        return outcome;
    }

    /** Периоды портала, которые пора выпустить, — по одному прогону на каждый. */
    private async tickDomain<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
        domain: string,
        now: Date,
        extendTick: () => Promise<void>,
    ): Promise<RopTickOutcome[]> {
        let options: TOptions;
        let portal: RopPortalCalendar;
        try {
            options = await definition.resolveOptions(domain, {});
            portal = await definition.calendar.resolve(domain);
        } catch (error) {
            return [await this.setupFailed(definition, domain, now, error)];
        }
        const outcomes: RopTickOutcome[] = [];
        for (const policy of options.policies) {
            const period = policy.due({
                now,
                timezone: portal.timezone,
                calendar: portal.calendar,
            });
            if (!period) continue;
            const released = await this.state.released(
                definition.keys.released(
                    domain,
                    period.kind,
                    options.countOnly,
                ),
            );
            if (released === period.key) continue;
            outcomes.push(
                await this.runner.run({
                    definition,
                    domain,
                    period,
                    options,
                    portal,
                    mode: {
                        countOnly: options.countOnly,
                        previewUserId: null,
                        force: false,
                    },
                    now,
                    extendTick,
                }),
            );
        }
        return outcomes.length ? outcomes : [{ kind: 'waiting', domain }];
    }

    /**
     * Настройки или календарь портала не прочитаны: счёт по суткам — в
     * Telegram первая и последняя попытка дня, между ними тихо.
     */
    private async setupFailed<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
        domain: string,
        now: Date,
        cause: unknown,
    ): Promise<RopTickOutcome> {
        const error = `настройки портала не прочитаны: ${getErrorString(cause)}`;
        this.logger.error(`[${definition.code}] ${domain}: ${error}`);
        const attempt = await this.state.registerFailure(
            definition.keys.failures(domain, ROP_SETUP_SCOPE),
            now.toISOString().slice(0, 10),
            ROP_SETUP_FAILURE_TTL_SEC,
        );
        return attempt === 1 || attempt === definition.maxAttempts
            ? { kind: 'failed', domain, period: null, error, attempt }
            : { kind: 'retrying', domain, period: null, error, attempt };
    }

    /** Порталы с включённым отчётом; null — прочитать не удалось (тик пропущен). */
    private async enabledDomains<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
    ): Promise<string[] | null> {
        try {
            return await definition.enabledDomains();
        } catch (error) {
            this.logger.error(
                `[${definition.code}] порталы не прочитаны: ${getErrorString(error)} — тик пропущен`,
                { telegram: true },
            );
            return null;
        }
    }

    private notify<TOptions extends RopCommonOptions>(
        definition: RopReportDefinition<TOptions>,
        outcomes: readonly RopTickOutcome[],
    ): void {
        if (shouldNotifyRopTick(outcomes)) {
            this.logger.log(formatRopTick(definition.title, outcomes), {
                telegram: true,
            });
            return;
        }
        this.logger.log(
            `[${definition.code}] порталов ${outcomes.length}: все ждут своего часа, заняты или повторяют известный сбой`,
        );
    }
}
