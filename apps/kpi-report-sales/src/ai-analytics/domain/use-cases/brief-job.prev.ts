/**
 * Обзоры для джобы резюме (версия 2 «что изменилось»): перед сборкой
 * пакета джоба добивается двух обзоров в кэше — самого периода и
 * прошлого периода той же длины. Оба считаются одинаково, поэтому их
 * числа можно сравнивать; факты прошлого периода ложатся в кэш
 * `brief:prev`.
 *
 * Обзор берётся из кэша (по периметру резюме либо по периметру вкладки
 * AI без фильтра — список разбора или ростер ОП), а при промахе ставится
 * джоба обзора с ожиданием не дольше `AI_BRIEF_OVERVIEW_WAIT_MS`; оба
 * ожидания идут разом. Периметр резюме уже сужен списком разбора
 * (BriefUseCase), поэтому ключ джобы совпадает с ключом страницы обзора.
 *
 * Fail-open: не дождалась, ростера нет, обзор упал — в кэш ложится
 * пометка «не готов» на короткий TTL, и резюме собирается без сравнения
 * с причиной `prev-not-ready`; следующая попытка повторит ожидание.
 *
 * Не `@Injectable`: создаётся джобой поверх её зависимостей (очередь и
 * кэш), bitrix-состояния нет — в Bitrix ходит джоба обзора.
 */
import type { Logger } from '@nestjs/common';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { previousPeriod, type BriefPeriod } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_BRIEF_OVERVIEW_JOB_OPTIONS,
    AI_BRIEF_OVERVIEW_WAIT_MS,
    AI_BRIEF_TTL_SECONDS,
} from '../../constants/ai-brief.const';
import { buildBriefPrevKey } from '../../brief/brief-cache-key.util';
import { BriefOverviewReader } from '../../brief/brief-overview.reader';
import {
    extractPrevFacts,
    hasPrevNumbers,
    isPrevFacts,
    notReadyPrevFacts,
    type BriefPrevFacts,
} from '../../brief/evidence-pack.prev';
import type { AiBriefJobData } from '../../dto/ai-brief.dto';
import type { AiOverviewDto } from '../../dto/ai-overview.dto';
import type { AiOverviewJobData } from '../../dto/ai-overview-request.dto';

/** Чем закончилось обеспечение прошлого периода. */
export const AI_BRIEF_PREV_OUTCOMES = [
    /** Факты уже были в кэше `brief:prev`. */
    'cached',
    /** Обзор прошлого окна найден или досчитан, факты записаны. */
    'ready',
    /** Обзор не готов в отведённое время или упал. */
    'not-ready',
    /** Периметра резюме нет, а в кэше нет периметра вкладки — окно не воспроизвести. */
    'no-roster',
] as const;
export type BriefPrevOutcome = (typeof AI_BRIEF_PREV_OUTCOMES)[number];

const isOverviewDto = (value: unknown): value is AiOverviewDto =>
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { managers?: unknown }).managers);

/** Обещание с потолком ожидания; таймер снимается в любом исходе. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`ожидание ${ms} мс истекло`)),
            ms,
        );
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

export class BriefPrevEnsurer {
    private readonly overviews: BriefOverviewReader;

    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly cache: AiAnalyticsCacheService,
        private readonly logger: Logger,
    ) {
        this.overviews = new BriefOverviewReader(cache);
    }

    /**
     * Обзор периода — в кэше, факты прошлого периода — в кэше `brief:prev`
     * (или пометка «не готов»). Итог — судьба прошлого периода.
     */
    async ensure(
        data: AiBriefJobData,
        waitMs = AI_BRIEF_OVERVIEW_WAIT_MS,
    ): Promise<BriefPrevOutcome> {
        const current: BriefPeriod = { from: data.from, to: data.to };
        const prev = previousPeriod(data.from, data.to);
        const [, outcome] = await Promise.all([
            this.overview(data, current, waitMs),
            this.ensurePrev(data, prev, waitMs),
        ]);

        return outcome;
    }

    /** Факты прошлого периода в кэше `brief:prev` — или пометка «не готов». */
    private async ensurePrev(
        data: AiBriefJobData,
        prev: BriefPeriod,
        waitMs: number,
    ): Promise<BriefPrevOutcome> {
        const key = buildBriefPrevKey(
            data.domain,
            prev.from,
            prev.to,
            data.managerIds,
        );
        const cached = await this.cache.getJson<unknown>(key);
        if (isPrevFacts(cached) && hasPrevNumbers(cached)) return 'cached';
        const overview = await this.overview(data, prev, waitMs);
        if (overview === null || overview === 'no-roster') {
            await this.store(
                key,
                notReadyPrevFacts(prev),
                AI_BRIEF_TTL_SECONDS.error,
            );

            return overview === null ? 'not-ready' : 'no-roster';
        }
        await this.store(
            key,
            extractPrevFacts(overview, prev, data.managerIds.map(String)),
            AI_BRIEF_TTL_SECONDS.prev,
        );

        return 'ready';
    }

    /**
     * Обзор окна: из кэша, а при промахе — джобой обзора с ожиданием.
     * 'no-roster' — считать не по кому; null — не дождались или упал.
     */
    private async overview(
        data: AiBriefJobData,
        period: BriefPeriod,
        waitMs: number,
    ): Promise<AiOverviewDto | 'no-roster' | null> {
        const cached = await this.overviews.read(
            data.domain,
            period,
            data.managerIds,
        );
        if (cached) return cached;
        const ids = await this.overviews.scope(data.domain, data.managerIds);
        if (ids.length === 0) return 'no-roster';

        return this.compute(data, period, ids, waitMs);
    }

    /**
     * Джоба обзора окна с jobId = ключ кэша (повтор не плодится, идущий
     * расчёт страницы подхватывается) и ожидание её завершения; итог — из
     * кэша обзора либо из результата джобы. Таймаут и ошибка — null с
     * записью в лог; перед этим кэш читается ещё раз — джоба могла
     * завершиться раньше, чем началось ожидание.
     */
    private async compute(
        data: AiBriefJobData,
        period: BriefPeriod,
        ids: number[],
        waitMs: number,
    ): Promise<AiOverviewDto | null> {
        const key = this.overviews.key(data.domain, period, ids);
        try {
            const job = await this.queue.dispatch<AiOverviewJobData>(
                QueueNames.SALES_KPI_REPORT,
                JobNames.SALES_AI_ANALYTICS_OVERVIEW,
                {
                    domain: data.domain,
                    from: period.from,
                    to: period.to,
                    managerIds: ids,
                    confirmedOnly: false,
                    forceRefresh: false,
                    requestKey: key,
                },
                key,
                AI_BRIEF_OVERVIEW_JOB_OPTIONS,
            );
            const result: unknown = await withTimeout(job.finished(), waitMs);
            const cached = await this.overviews.readByKey(key);

            return cached ?? (isOverviewDto(result) ? result : null);
        } catch (error) {
            this.logger.warn(
                `Резюме ${data.requestKey}: обзор ` +
                    `${period.from}–${period.to} не дождались: ${(error as Error).message}`,
            );

            return this.overviews.readByKey(key).catch(() => null);
        }
    }

    /** Ошибка записи кэша не должна ронять джобу резюме. */
    private async store(
        key: string,
        value: BriefPrevFacts,
        ttlSeconds: number,
    ): Promise<void> {
        try {
            await this.cache.setJson(key, value, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }
}
