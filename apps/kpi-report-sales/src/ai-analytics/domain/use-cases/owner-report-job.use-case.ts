import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { WsService } from '@/core/ws';
import { AlertThrottle } from '@lib/logger';
import {
    applyNarrative,
    buildOwnerReportFacts,
    buildOwnerReportText,
    OWNER_REPORT_NARRATIVE_VERSION,
    previousOwnerReportPeriod,
    type OwnerReportFacts,
    type OwnerReportText,
    type SnapshotEnvelope,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import type { AiOwnerReportDto } from '../../dto/ai-owner-report.dto';
import {
    AI_OWNER_REPORT_NARRATIVE_PORT,
    type OwnerReportNarrativePort,
} from '../../owner-report/owner-report-narrative.port';
import { OwnerReportSnapshotReader } from '../../owner-report/owner-report-snapshot.reader';
import {
    OwnerReportSourcesLoader,
    type OwnerReportSources,
} from '../../owner-report/owner-report-sources.loader';
import {
    AI_OWNER_REPORT_ALERT_KEY_PREFIX,
    AI_OWNER_REPORT_PAYLOAD_VERSION,
    AI_OWNER_REPORT_SNAPSHOT_RECORD,
    AI_OWNER_REPORT_TTL_SECONDS,
} from '../../owner-report/owner-report.const';
import { toOwnerReportDto } from '../../owner-report/owner-report.presenter';
import type {
    AiOwnerReportCacheEntry,
    AiOwnerReportJobData,
    AiOwnerReportWsDonePayload,
    AiOwnerReportWsErrorPayload,
    OwnerReportNarrativeMeta,
    OwnerReportSnapshotPayload,
} from '../../owner-report/owner-report.types';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import { AiAnalyticsParamsLoader } from '../loaders/params.loader';

/**
 * Джоба SALES_AI_ANALYTICS_OWNER_REPORT: источники периода и прошлого
 * периода → факты → шаблонный текст → модель поверх (факт-чек, штатная
 * деградация до шаблона) → ссылки на карточки → снапшот → кэш → WS done.
 * Ошибка джобы — error-конверт в кэш, WS error, оповещение и rethrow.
 */
@Injectable()
export class OwnerReportJobUseCase {
    private readonly logger = new Logger(OwnerReportJobUseCase.name);
    private readonly alerts = new AlertThrottle();

    constructor(
        private readonly sources: OwnerReportSourcesLoader,
        @Inject(AI_OWNER_REPORT_NARRATIVE_PORT)
        private readonly narrative: OwnerReportNarrativePort,
        private readonly smartLinks: SmartLinkLoader,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly reader: OwnerReportSnapshotReader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly ws: WsService,
    ) {}

    async execute(
        data: AiOwnerReportJobData,
        now = new Date(),
    ): Promise<AiOwnerReportDto> {
        try {
            const payload = await this.build(data, now);
            await this.snapshots.upsert<OwnerReportSnapshotPayload>(
                await this.envelope(data, payload),
                { force: true },
            );
            const dto = toOwnerReportDto(
                payload,
                await this.reader.availablePeriods(data.domain, data.kind),
            );
            await this.store(
                data.requestKey,
                { status: 'ready', data: dto },
                AI_OWNER_REPORT_TTL_SECONDS.ready,
            );
            this.notify<AiOwnerReportWsDonePayload>(
                data.socketId,
                AI_ANALYTICS_WS_EVENTS.OWNER_REPORT_DONE,
                { requestKey: data.requestKey, generatedAt: dto.generatedAt },
            );
            return dto;
        } catch (error) {
            await this.fail(data, error);
            throw error;
        }
    }

    private async build(
        data: AiOwnerReportJobData,
        now: Date,
    ): Promise<OwnerReportSnapshotPayload> {
        const sources = await this.sources.load(
            data.domain,
            {
                kind: data.kind,
                periodKey: data.periodKey,
                from: data.from,
                to: data.to,
            },
            previousBoundsOf(data),
            now,
        );
        const facts = factsOf(sources, 'current');
        const previousFacts = factsOf(sources, 'previous');
        const template = buildOwnerReportText(facts, {
            previous: previousFacts,
            names: sources.names,
        });
        const { text, narrative } = await this.narrate(data.domain, template);
        return {
            version: AI_OWNER_REPORT_PAYLOAD_VERSION,
            kind: data.kind,
            periodKey: data.periodKey,
            from: data.from,
            to: data.to,
            generatedAt: now.toISOString(),
            facts,
            previousFacts,
            text,
            narrative,
            links: await this.links(data.domain, facts),
        };
    }

    /** Модель поверх шаблона; любая ошибка вызова — шаблон с причиной. */
    private async narrate(
        domain: string,
        template: OwnerReportText,
    ): Promise<{ text: OwnerReportText; narrative: OwnerReportNarrativeMeta }> {
        const base: OwnerReportNarrativeMeta = {
            version: OWNER_REPORT_NARRATIVE_VERSION,
            provider: null,
            model: null,
            tokens: null,
            accepted: 0,
            dropped: [],
            reason: null,
        };
        try {
            const answer = await this.narrative.complete(domain, template);
            const applied = applyNarrative(template, answer.payload);
            if (applied.dropped.length > 0) {
                this.logger.warn(
                    `Отчёт собственнику ${domain}: отброшено ${applied.dropped.length} частей ответа модели — ` +
                        applied.dropped
                            .map(drop => `${drop.part}:${drop.reason}`)
                            .join(', '),
                );
            }
            return {
                text: applied.text,
                narrative: {
                    ...base,
                    provider: answer.provider,
                    model: answer.model,
                    tokens: answer.tokens,
                    accepted: applied.accepted,
                    dropped: applied.dropped,
                },
            };
        } catch (error) {
            const message = (error as Error).message;
            this.logger.warn(
                `Отчёт собственнику ${domain}: модель недоступна — ${message}`,
            );
            return { text: template, narrative: { ...base, reason: message } };
        }
    }

    /** Ссылки на карточки разборов-примеров утечек и сбоев; сбой — без ссылок. */
    private async links(
        domain: string,
        facts: OwnerReportFacts,
    ): Promise<Record<string, string>> {
        const ids = [
            ...facts.leaks.flatMap(leak => leak.examples),
            ...facts.issues.byCode.flatMap(row => row.examples),
        ];
        if (ids.length === 0) return {};
        try {
            const resolved = await this.smartLinks.resolveLinks(domain, [
                ...new Set(ids),
            ]);
            const links: Record<string, string> = {};
            for (const [id, link] of resolved) if (link) links[id] = link;
            return links;
        } catch (error) {
            this.logger.warn(
                `Ссылки на разборы ${domain} не получены: ${(error as Error).message}`,
            );
            return {};
        }
    }

    private async envelope(
        data: AiOwnerReportJobData,
        payload: OwnerReportSnapshotPayload,
    ): Promise<SnapshotEnvelope<OwnerReportSnapshotPayload>> {
        const { paramsVersion } = await this.params.load(data.domain);
        return {
            domain: data.domain,
            type: AI_OWNER_REPORT_SNAPSHOT_RECORD.TYPE,
            periodKey: data.periodKey,
            managerId: null,
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            paramsVersion,
            inputsHash: createHash('sha1')
                .update(JSON.stringify(payload.facts.coverage))
                .digest('hex')
                .slice(0, 12),
            generatedAt: payload.generatedAt,
            payload,
            usage: { tokensCount: payload.narrative.tokens, price: null },
        };
    }

    private async fail(
        data: AiOwnerReportJobData,
        error: unknown,
    ): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof Error ? error.name : 'unknown';
        const alert = this.alerts.allow(
            `${AI_OWNER_REPORT_ALERT_KEY_PREFIX}:${data.domain}:${code}`,
            Date.now(),
        );
        this.logger.error(
            `Отчёт собственнику ${data.requestKey} упал: ${message}` +
                (alert ? '' : ' (повтор, оповещение подавлено)'),
            alert ? { telegram: true } : undefined,
        );
        await this.store(
            data.requestKey,
            { status: 'error', message },
            AI_OWNER_REPORT_TTL_SECONDS.error,
        );
        this.notify<AiOwnerReportWsErrorPayload>(
            data.socketId,
            AI_ANALYTICS_WS_EVENTS.OWNER_REPORT_ERROR,
            { requestKey: data.requestKey, message },
        );
    }

    private async store(
        key: string,
        entry: AiOwnerReportCacheEntry,
        ttlSeconds: number,
    ): Promise<void> {
        try {
            await this.cache.setJson(key, entry, ttlSeconds);
        } catch (error) {
            this.logger.warn(
                `Кэш ${key} не записан: ${(error as Error).message}`,
            );
        }
    }

    private notify<T>(
        socketId: string | undefined,
        event: string,
        data: T,
    ): void {
        if (!socketId) return;
        this.ws.sendToClient(socketId, { event, data });
    }
}

function factsOf(
    sources: OwnerReportSources,
    which: 'current' | 'previous',
): OwnerReportFacts {
    const period =
        which === 'current' ? sources.period : sources.previousPeriod;
    const rows = which === 'current' ? sources.rows : sources.previousRows;
    return buildOwnerReportFacts(rows, period, {
        managerIds: sources.managerIds,
        minDurationByType: sources.minDurationByType,
        telephony: which === 'current' ? sources.telephony : null,
        crm: which === 'current' ? sources.crm : null,
    });
}

/** Прошлый период той же длины — по текущим границам. */
function previousBoundsOf(data: AiOwnerReportJobData) {
    return previousOwnerReportPeriod({
        kind: data.kind,
        periodKey: data.periodKey,
        from: data.from,
        to: data.to,
    });
}
