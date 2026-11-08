import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { QueueDispatcherService } from '@lib/queue';
import { dispatchAiRefreshTick } from './refresh.queue';
import {
    lastClosedMonthKey,
    newScenario,
    scenarioAbandoned,
} from './refresh.plan';
import { AiRefreshStore } from './refresh.store';
import type { AiRefreshScenario } from './refresh.types';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export const AI_REFRESH_MESSAGES = {
    badMonth: 'Месяц — в виде ГГГГ-ММ',
    openMonth: 'Месяц ещё не закончился: обновляются только закрытые месяцы',
    started: 'Запущено: шаги пойдут по очереди, страницу можно закрыть.',
    alreadyRunning:
        'Сценарий уже идёт — второй не запускаю, ниже его состояние.',
} as const;

/** Что запустить. */
export interface AiRefreshStartInput {
    domain: string;
    /** Закрытый месяц 'YYYY-MM'; нет — последний закрытый. */
    monthKey?: string;
    withReanalysis: boolean;
    requestedBy?: string;
}

/** Итог запуска: запущен ли новый сценарий и его состояние. */
export interface AiRefreshStartResult {
    started: boolean;
    message: string;
    scenario: AiRefreshScenario;
}

/** Портал с AI-аналитикой и его последний сценарий. */
export interface AiRefreshPortalState {
    domain: string;
    scenario: AiRefreshScenario | null;
}

/**
 * «Обновить всё по порядку»: запуск сценария портала (или всех порталов
 * с включённой AI-аналитикой) и чтение состояния. Сами шаги двигает тик
 * в очереди AI_ANALYTICS_ADMIN — `AiRefreshProcessor`.
 */
@Injectable()
export class AiAnalyticsRefreshService {
    private readonly logger = new Logger(AiAnalyticsRefreshService.name);

    constructor(
        private readonly store: AiRefreshStore,
        private readonly dispatcher: QueueDispatcherService,
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    async start(
        input: AiRefreshStartInput,
        now: Date = new Date(),
    ): Promise<AiRefreshStartResult> {
        const monthKey = input.monthKey ?? lastClosedMonthKey(now);
        if (!MONTH_KEY.test(monthKey)) {
            throw new BadRequestException(AI_REFRESH_MESSAGES.badMonth);
        }
        if (monthKey > lastClosedMonthKey(now)) {
            throw new BadRequestException(AI_REFRESH_MESSAGES.openMonth);
        }
        const current = await this.store.read(input.domain);
        if (current && !current.finished && !scenarioAbandoned(current, now)) {
            return {
                started: false,
                message: AI_REFRESH_MESSAGES.alreadyRunning,
                scenario: current,
            };
        }
        const scenario = newScenario(
            {
                id: randomUUID(),
                domain: input.domain,
                monthKey,
                withReanalysis: input.withReanalysis,
                requestedBy: input.requestedBy ?? null,
            },
            now,
        );
        await this.store.write(scenario);
        await dispatchAiRefreshTick(
            this.dispatcher,
            { domain: scenario.domain, scenarioId: scenario.id, seq: 0 },
            0,
        );
        this.logger.log(
            `Сценарий «обновить всё» ${scenario.domain} ${monthKey} запущен (переразбор: ${input.withReanalysis ? 'да' : 'нет'})`,
        );
        return {
            started: true,
            message: AI_REFRESH_MESSAGES.started,
            scenario,
        };
    }

    state(domain: string): Promise<AiRefreshScenario | null> {
        return this.store.read(domain);
    }

    /** Порталы с включённой AI-аналитикой и их сценарии. */
    async portals(): Promise<AiRefreshPortalState[]> {
        const domains = await this.enabledDomains();
        return Promise.all(
            domains.map(async domain => ({
                domain,
                scenario: await this.store.read(domain),
            })),
        );
    }

    /** Запуск на всех порталах с AI-аналитикой; идущие не трогаются. */
    async startAll(
        input: Omit<AiRefreshStartInput, 'domain'>,
        now: Date = new Date(),
    ): Promise<AiRefreshStartResult[]> {
        const results: AiRefreshStartResult[] = [];
        for (const domain of await this.enabledDomains()) {
            results.push(await this.start({ ...input, domain }, now));
        }
        return results;
    }

    private async enabledDomains(): Promise<string[]> {
        const rows = await this.appSettings.listByAppCode(
            EnumPortalAppCode.kpiSales,
        );
        const domains = [...new Set(rows.map(row => row.domain))].sort();
        const enabled = await Promise.all(
            domains.map(async domain => {
                const values = await this.appSettings.resolve(
                    domain,
                    EnumPortalAppCode.kpiSales,
                );
                return values.aiAnalyticsEnabled === true ? domain : null;
            }),
        );
        return enabled.filter((domain): domain is string => domain !== null);
    }
}
