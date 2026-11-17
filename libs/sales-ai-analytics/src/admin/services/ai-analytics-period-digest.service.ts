/**
 * Итоги периода по менеджерам из админки (этап 7.4): постановка подсчёта
 * в очередь event-sales (там структура, звонки, замок портала и Telegram)
 * и итог последнего прогона по каждому виду периода — из Redis каркаса
 * `@lib/rop-reports`.
 *
 * `QueueDispatcherService` приходит опционально: без очереди (спеки,
 * сборки без Redis) ручка честно отвечает «не подключено».
 */
import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '@lib/core/redis/redis.service';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
    toPeriodDigestKinds,
} from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { ropKeys } from '@lib/rop-reports/state/rop-keys';
import {
    parseRopRunSummary,
    type RopRunSummary,
} from '@lib/rop-reports/state/rop-run-summary';
import {
    PERIOD_DIGEST_JOB_OPTIONS,
    PERIOD_DIGEST_KEY_PREFIX,
    PERIOD_DIGEST_REQUESTERS,
    periodDigestJobId,
    type PeriodDigestJobData,
} from '../../contracts/period-digest-run.types';
import { DIGEST_PERIOD_KIND } from '../../model/period-digest/period-digest.codes';
import type { DigestPeriodKind } from '../../model/period-digest/period-digest.types';
import { isQueueJobPending } from './queue-job-pending.util';

/** Ответ ручки `POST admin/ai-analytics/period-digest`. */
export interface PeriodDigestRunResult {
    domain: string;
    kind: DigestPeriodKind;
    /** Запрошенный ключ периода; null — последний закрытый. */
    periodKey: string | null;
    dispatched: boolean;
    jobId: string | null;
    reason: string | null;
}

/** Итог последнего прогона одного вида периода. */
export interface PeriodDigestKindStatus {
    kind: DigestPeriodKind;
    lastRun: RopRunSummary | null;
}

/** Ответ ручки `GET admin/ai-analytics/period-digest-status`. */
export interface PeriodDigestStatusResult {
    domain: string;
    /** Включены ли итоги на портале (настройка приложения). */
    enabled: boolean;
    /** «Только считать» в настройках портала. */
    countOnly: boolean;
    /** Отмеченные в настройках виды периодов. */
    kinds: DigestPeriodKind[];
    runs: PeriodDigestKindStatus[];
    runAvailable: boolean;
    hint: string;
}

export const PERIOD_DIGEST_ADMIN_MESSAGES = {
    runNotWired:
        'Итоги периода не подключены в этой сборке: очереди нет, ставить ' +
        'подсчёт некуда.',
    alreadyQueued:
        'По этому порталу и виду периода подсчёт уже идёт или ждёт очереди — ' +
        'дождитесь итога.',
    hint:
        'Пока работает только подсчёт: карточки менеджеров считаются и ' +
        'сохраняются, итог приходит в Telegram команды; задачи ' +
        'руководителям и файл Excel подключаются следующим этапом. Без ' +
        'ключа периода считается последняя закрытая неделя или месяц. ' +
        'Подсчёт идёт вне расписания и независимо от «включено»; замок ' +
        'портала общий с кроном.',
} as const;

const KINDS: readonly DigestPeriodKind[] = Object.values(DIGEST_PERIOD_KIND);

const keys = ropKeys(PERIOD_DIGEST_KEY_PREFIX);

@Injectable()
export class AiAnalyticsPeriodDigestService {
    constructor(
        private readonly redisService: RedisService,
        private readonly appSettings: PortalAppSettingsService,
        @Optional() private readonly dispatcher?: QueueDispatcherService,
    ) {}

    /** Поставить подсчёт периода; пока прошлый того же вида ждёт или идёт — отказ. */
    async run(input: {
        domain: string;
        kind: DigestPeriodKind;
        periodKey?: string;
    }): Promise<PeriodDigestRunResult> {
        const base = {
            domain: input.domain,
            kind: input.kind,
            periodKey: input.periodKey ?? null,
        };
        if (this.dispatcher === undefined) {
            return {
                ...base,
                dispatched: false,
                jobId: null,
                reason: PERIOD_DIGEST_ADMIN_MESSAGES.runNotWired,
            };
        }
        const jobId = periodDigestJobId(input.domain, input.kind);
        if (
            await isQueueJobPending(
                this.dispatcher,
                QueueNames.EVENT_SALES_PERIOD_DIGEST_RUN,
                jobId,
            )
        ) {
            return {
                ...base,
                dispatched: false,
                jobId,
                reason: PERIOD_DIGEST_ADMIN_MESSAGES.alreadyQueued,
            };
        }
        const data: PeriodDigestJobData = {
            domain: input.domain,
            kind: input.kind,
            ...(input.periodKey ? { periodKey: input.periodKey } : {}),
            requestedBy: PERIOD_DIGEST_REQUESTERS.admin,
        };
        await this.dispatcher.dispatch(
            QueueNames.EVENT_SALES_PERIOD_DIGEST_RUN,
            JobNames.EVENT_SALES_PERIOD_DIGEST_RUN,
            data,
            jobId,
            PERIOD_DIGEST_JOB_OPTIONS,
        );
        return { ...base, dispatched: true, jobId, reason: null };
    }

    async status(domain: string): Promise<PeriodDigestStatusResult> {
        const [settings, runs] = await Promise.all([
            this.appSettings.resolve(domain, EnumPortalAppCode.eventSales),
            Promise.all(
                KINDS.map(async kind => ({
                    kind,
                    lastRun: await this.readLastRun(domain, kind),
                })),
            ),
        ]);
        return {
            domain,
            enabled: settings.periodDigestEnabled === true,
            countOnly: settings.periodDigestCountOnly !== false,
            kinds: toPeriodDigestKinds(settings.periodDigestKinds),
            runs,
            runAvailable: this.dispatcher !== undefined,
            hint: PERIOD_DIGEST_ADMIN_MESSAGES.hint,
        };
    }

    private async readLastRun(
        domain: string,
        kind: DigestPeriodKind,
    ): Promise<RopRunSummary | null> {
        const raw = await this.redisService
            .getClient()
            .get(keys.lastRun(domain, kind))
            .catch(() => null);
        return parseRopRunSummary(raw);
    }
}
