import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { resolveTimezoneByDomain } from '@lib/shared/lib/date';
import { DUPLICATE_REPORT_MAX_ATTEMPTS } from './constants/duplicate-report.const';
import {
    isReportTimeReached,
    reportWeekKey,
} from './lib/duplicate-report-schedule';
import {
    DuplicateReportOutcome,
    formatDuplicateReportTick,
    shouldNotifyDuplicateTick,
} from './lib/duplicate-report-tick-report';
import { DuplicateReportRunState } from './services/duplicate-report-run-state';
import { DuplicateReportSettingsService } from './services/duplicate-report-settings.service';
import { DuplicateReportService } from './services/duplicate-report.service';
import { DuplicateReportRunResult } from './types/duplicate-report.types';

/** Параметры прогона одного портала. */
interface RunDomainParams {
    /** Ручной прогон: день и час из настроек не проверяются. */
    readonly force?: boolean;
    /** Перебить «Только считать» из настроек (ручка, `dryRun`). */
    readonly countOnly?: boolean;
    /** Пробный прогон одному сотруднику (ручка): неделя не закрывается. */
    readonly previewUserId?: number;
}

/**
 * Отчёт дошёл: «только считать», получателей нет или хоть одна задача
 * поставлена. Ноль задач из N — сбой Битрикса, неделя не закрывается.
 */
const isDelivered = (result: DuplicateReportRunResult): boolean =>
    result.countOnly || result.recipients === 0 || result.tasksCreated > 0;

/**
 * Планировщик еженедельного отчёта по дублям сделок.
 *
 * Тик — каждый час; день недели и час отчёта — настройка портала в его
 * таймзоне. Отчёт недели уходит один раз: после ДОСТАВКИ ставится метка
 * недели (своя у «только считать»). Сбой не закрывает неделю: прогон
 * повторится в следующий тик, в Telegram — первый сбой и последний, после
 * {@link DUPLICATE_REPORT_MAX_ATTEMPTS} попыток неделя закрывается.
 * Паттерн общий с аудитом сделок: Redis-лок от наложения (общий с ручным
 * прогоном), настройки перечитываются на портал, ошибка одного портала не
 * роняет цикл.
 */
@Injectable()
export class DuplicateReportScheduler {
    private readonly logger = new Logger(DuplicateReportScheduler.name);

    constructor(
        private readonly state: DuplicateReportRunState,
        private readonly appSettings: PortalAppSettingsService,
        private readonly settings: DuplicateReportSettingsService,
        private readonly report: DuplicateReportService,
    ) {}

    @Cron(CronExpression.EVERY_HOUR, { name: 'event-sales-duplicate-report' })
    async tick(): Promise<void> {
        const domains = await this.resolveEnabledDomains();
        if (!domains) return;
        if (!domains.length) {
            this.logger.log('Отчёт по дублям не включён ни на одном портале');
            return;
        }
        const token = await this.state.lock();
        if (!token) {
            this.logger.warn(
                'Прошлый прогон отчёта по дублям ещё идёт (или Redis недоступен) — пропуск',
            );
            return;
        }
        try {
            const outcomes: DuplicateReportOutcome[] = [];
            for (const domain of domains) {
                await this.state.extend(token);
                outcomes.push(await this.runDomain(domain));
            }
            this.notify(outcomes);
        } finally {
            await this.state.unlock(token);
        }
    }

    /**
     * РУЧНОЙ ПРОГОН (`POST duplicate-report/run-now`): сейчас, без
     * проверки дня и часа и независимо от «включён». В фоне: чтение
     * воронки и задачи получателям дольше таймаута прокси, итог — в
     * Telegram тем же сообщением, что у крона. Лок общий с кроном.
     *
     * @returns false — идёт другой прогон, этот не начат.
     */
    async runNow(
        domain: string,
        countOnly?: boolean,
        previewUserId?: number,
    ): Promise<boolean> {
        const token = await this.state.lock();
        if (!token) return false;
        void this.runInBackground(domain, token, {
            force: true,
            countOnly,
            previewUserId,
        });
        return true;
    }

    private async runInBackground(
        domain: string,
        token: string,
        params: RunDomainParams,
    ): Promise<void> {
        try {
            this.notify([await this.runDomain(domain, params)]);
        } finally {
            await this.state.unlock(token);
        }
    }

    /** Прогон портала; ошибка возвращается итогом, а не роняет цикл. */
    private async runDomain(
        domain: string,
        { force = false, countOnly, previewUserId }: RunDomainParams = {},
    ): Promise<DuplicateReportOutcome> {
        const now = new Date();
        const timezone = resolveTimezoneByDomain(domain);
        const week = reportWeekKey(now, timezone);
        let mode = countOnly ?? false;
        try {
            const options = await this.settings.resolveOptions(domain, {
                countOnly,
            });
            mode = options.countOnly;
            if (!force) {
                const due =
                    isReportTimeReached(now, timezone, options.schedule) &&
                    (await this.state.lastWeek(domain, mode)) !== week;
                if (!due) return { kind: 'waiting', domain };
            }
            const result = await this.report.runForDomain(
                domain,
                options,
                now,
                { previewUserId },
            );
            if (!isDelivered(result)) {
                return this.failed(
                    domain,
                    week,
                    mode,
                    force,
                    `задачи не поставлены ни одному из ${result.recipients} получателей` +
                        (result.warnings[0] ? `: ${result.warnings[0]}` : ''),
                );
            }
            /*
             * Неделю закрывает доставленный прогон крона и ручной прогон с
             * задачами: иначе крон следом поставил бы их второй раз. Ручное
             * «только посчитать» и проба одному сотруднику не закрывают ничего.
             */
            if (!force || (!result.countOnly && previewUserId === undefined)) {
                await this.state.markWeek(domain, week, result.countOnly);
                await this.state.clearFailures(domain);
            }
            return { kind: 'ran', domain, result };
        } catch (error) {
            return this.failed(
                domain,
                week,
                mode,
                force,
                getErrorString(error),
            );
        }
    }

    /**
     * Сбой: у ручного прогона — просто итог. У крона — попытка недели:
     * первая и последняя идут в Telegram, промежуточные молча; после
     * последней неделя закрывается, чтобы сбой настройки не стучал в чат
     * каждый час до воскресенья.
     */
    private async failed(
        domain: string,
        week: string,
        countOnly: boolean,
        force: boolean,
        error: string,
    ): Promise<DuplicateReportOutcome> {
        this.logger.error(`Отчёт по дублям ${domain} упал: ${error}`, {
            domain,
        });
        if (force) return { kind: 'failed', domain, error };
        const attempt = await this.state.registerFailure(domain, week);
        if (attempt >= DUPLICATE_REPORT_MAX_ATTEMPTS) {
            await this.state.markWeek(domain, week, countOnly);
            await this.state.clearFailures(domain);
            return { kind: 'failed', domain, error, attempt, gaveUp: true };
        }
        return attempt === 1
            ? { kind: 'failed', domain, error, attempt }
            : { kind: 'retrying', domain, error, attempt };
    }

    /** Итог: в Telegram — только если хоть один портал прогнан или упал. */
    private notify(outcomes: readonly DuplicateReportOutcome[]): void {
        if (shouldNotifyDuplicateTick(outcomes)) {
            this.logger.log(formatDuplicateReportTick(outcomes), {
                telegram: true,
            });
            return;
        }
        this.logger.log(
            `Отчёт по дублям: порталов ${outcomes.length}, все ждут своего дня и часа или повтора`,
        );
    }

    /**
     * Домены с включённым отчётом; null — БД недоступна (тик пропущен,
     * ошибка уже в Telegram): сбой не выдаём за «нигде не включён».
     */
    private async resolveEnabledDomains(): Promise<string[] | null> {
        try {
            const rows = await this.appSettings.listByAppCode(
                EnumPortalAppCode.eventSales,
            );
            const enabledKey =
                PORTAL_APP_SETTINGS_SCHEMA[EnumPortalAppCode.eventSales]
                    .duplicateReportEnabled.code;
            return rows
                .filter(row => row.settings[enabledKey] === true)
                .map(row => row.domain);
        } catch (error) {
            this.logger.error(
                `Порталы из portal_app_settings не прочитаны: ${getErrorString(error)} — тик отчёта по дублям пропущен`,
                { telegram: true },
            );
            return null;
        }
    }
}
