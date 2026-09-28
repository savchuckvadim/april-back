import { Inject, Injectable, Logger } from '@nestjs/common';
import { WsService } from '@/core/ws';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { AlertThrottle } from '@lib/logger';
import {
    AI_BRIEF_TEMPLATE_REASONS,
    buildBriefFromLlm,
    buildTemplateBrief,
    resolveNumberParam,
    toPortalDate,
    type AiBriefResult,
    type AiEvidencePack,
    type BriefContext,
    type BriefSnapshot,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import {
    AI_BRIEF_ALERT_KEY_PREFIX,
    AI_BRIEF_TTL_SECONDS,
} from '../../constants/ai-brief.const';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import {
    AI_BRIEF_LLM_PORT,
    type AiBriefLlmPort,
    type AiBriefLlmUsage,
} from '../../brief/ai-brief-llm.port';
import { buildBriefKey } from '../../brief/brief-cache-key.util';
import { BriefQuotaStore } from '../../brief/brief-quota.store';
import { EvidencePackBuilder } from '../../brief/evidence-pack.builder';
import {
    AiBriefCacheEntry,
    AiBriefDto,
    AiBriefJobData,
    AiBriefWsDonePayload,
    AiBriefWsErrorPayload,
} from '../../dto/ai-brief.dto';
import { AiAnalyticsParamsLoader } from '../loaders/params.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { BriefPrevEnsurer } from './brief-job.prev';
import {
    briefUsage,
    toBriefDto,
    toBriefEnvelope,
    toBriefSnapshot,
} from './brief-job.util';
import type { BriefUsageFacts } from './brief-job.util';

/**
 * Выполнение джобы SALES_AI_ANALYTICS_BRIEF (план §5.3, поток 18, версия
 * 2 «что изменилось и что делать»): обзоры периода и прошлого периода →
 * пакет фактов → квота → модель или шаблон → факт-чек → снапшот
 * `ai-analytics-brief` с расходом вызова → write-through в кэш (6 ч) →
 * WS `ai-analytics:brief:done`.
 *
 * Перед сборкой пакета джоба добивается обоих обзоров
 * (`BriefPrevEnsurer`: кэш либо джоба обзора с ожиданием); не дождалась
 * — резюме без сравнения. Пакет джобы даёт другой хэш, чем пакет ручки
 * до неё, поэтому готовое резюме кладётся под оба ключа: `requestKey`
 * джобы и ключ нового хэша — повторный POST фронта попадает в кэш сразу.
 * Если резюме такого же пакета уже лежит в кэше, оно берётся оттуда:
 * нейросеть второй раз по тем же фактам не зовётся.
 *
 * Штатная деградация (§5.4): нет ключа VibeCode, исчерпана дневная квота
 * `brief_quota_per_day` или после факт-чека осталось меньше двух буллетов
 * — резюме собирается шаблоном с подписью причины, джоба завершается
 * успешно. А вот ОШИБКА вызова модели успехом не считается: error-конверт
 * на 120 с, WS `:error`, Telegram-оповещение (с подавлением повторов по
 * ключу «домен + код ошибки») и rethrow, чтобы Bull пометил джобу failed.
 */
@Injectable()
export class BriefJobUseCase {
    private readonly logger = new Logger(BriefJobUseCase.name);
    private readonly alerts = new AlertThrottle();
    private readonly prev: BriefPrevEnsurer;

    constructor(
        private readonly pack: EvidencePackBuilder,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly settings: SettingsLoader,
        private readonly quota: BriefQuotaStore,
        @Inject(AI_BRIEF_LLM_PORT) private readonly llm: AiBriefLlmPort,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly cache: AiAnalyticsCacheService,
        private readonly ws: WsService,
        queue: QueueDispatcherService,
    ) {
        this.prev = new BriefPrevEnsurer(queue, cache, this.logger);
    }

    async execute(data: AiBriefJobData, now = new Date()): Promise<AiBriefDto> {
        try {
            const { dto, packHash, reused } = await this.build(data, now);
            const entry: AiBriefCacheEntry = { status: 'ready', data: dto };
            await this.store(
                data.requestKey,
                entry,
                AI_BRIEF_TTL_SECONDS.ready,
            );
            const packKey = buildBriefKey(data.domain, packHash);
            if (!reused && packKey !== data.requestKey) {
                await this.store(packKey, entry, AI_BRIEF_TTL_SECONDS.ready);
            }
            this.notify<AiBriefWsDonePayload>(
                data.socketId,
                AI_ANALYTICS_WS_EVENTS.BRIEF_DONE,
                { requestKey: data.requestKey, generatedAt: dto.generatedAt },
            );

            return dto;
        } catch (error) {
            await this.fail(data, error);
            throw error;
        }
    }

    /** Обзоры → пакет → резюме (кэш, модель либо шаблон) → снапшот → DTO. */
    private async build(
        data: AiBriefJobData,
        now: Date,
    ): Promise<{ dto: AiBriefDto; packHash: string; reused: boolean }> {
        const prevOutcome = await this.prev.ensure(data);
        this.logger.debug(
            `Резюме ${data.requestKey}: прошлый период — ${prevOutcome}`,
        );
        const pack = await this.pack.build({
            domain: data.domain,
            from: data.from,
            to: data.to,
            managerIds: data.managerIds,
            now,
        });
        const ready = await this.reuse(data, pack.hash);
        if (ready !== null) {
            return { dto: ready, packHash: pack.hash, reused: true };
        }
        const { ctx, paramsVersion } = await this.params.load(data.domain);
        const ctxBrief: BriefContext = {
            from: data.from,
            to: data.to,
            generatedAt: now.toISOString(),
        };
        const composed = await this.compose(
            data,
            pack,
            ctxBrief,
            now,
            resolveNumberParam('brief_quota_per_day', ctx) ?? 0,
        );
        const usage: BriefUsageFacts = briefUsage(
            composed.usage,
            resolveNumberParam('llm_price_per_1k', ctx) ?? 0,
        );
        const snapshot = toBriefSnapshot(data, composed.brief, pack, {
            usage,
            passRatePct: composed.passRatePct,
        });
        await this.snapshots.upsert<BriefSnapshot>(
            toBriefEnvelope(data, snapshot, {
                generatedAt: ctxBrief.generatedAt,
                paramsVersion,
            }),
        );

        return {
            dto: toBriefDto(composed.brief, usage, pack.compare),
            packHash: pack.hash,
            reused: false,
        };
    }

    /**
     * Готовое резюме того же пакета из кэша (ключ по хэшу пакета джобы);
     * null — такого нет, ключ совпал с ключом запроса (ручка его уже
     * проверила) либо просили пересчитать заново.
     */
    private async reuse(
        data: AiBriefJobData,
        packHash: string,
    ): Promise<AiBriefDto | null> {
        const key = buildBriefKey(data.domain, packHash);
        if (data.forceRefresh === true || key === data.requestKey) return null;
        const entry = await this.cache.getJson<AiBriefCacheEntry>(key);

        return entry && entry.status === 'ready' ? entry.data : null;
    }

    /**
     * Резюме модели либо шаблон с причиной. Порядок деградации —
     * порядок таблицы §5.4: ключ → квота → факт-чек.
     */
    private async compose(
        data: AiBriefJobData,
        pack: AiEvidencePack,
        ctx: BriefContext,
        now: Date,
        quotaLimit: number,
    ): Promise<{
        brief: AiBriefResult;
        usage: AiBriefLlmUsage | null;
        passRatePct: number;
    }> {
        const template = (reason: string) => ({
            brief: buildTemplateBrief(pack, ctx, reason),
            usage: null,
            passRatePct: 0,
        });
        const apiKey = await this.llm.resolveKey(data.domain);
        if (apiKey === null) {
            return template(AI_BRIEF_TEMPLATE_REASONS.noLlmKey);
        }
        const { calendar } = await this.settings.load(data.domain);
        const day = toPortalDate(now, calendar.timeZone);
        const attempt = await this.quota.consume(data.domain, day, quotaLimit);
        if (!attempt.allowed) {
            return template(AI_BRIEF_TEMPLATE_REASONS.quotaExceeded);
        }
        const answer = await this.llm.complete(pack, apiKey);
        const outcome = buildBriefFromLlm(answer.payload, pack, ctx);
        if (outcome.brief.source === 'template') {
            this.logger.warn(
                `Резюме ${data.requestKey}: шаблон, причина ` +
                    `${outcome.brief.reason ?? 'неизвестна'}, ` +
                    `факт-чек ${outcome.passRatePct} %`,
            );
        }

        return {
            brief: outcome.brief,
            usage: answer.usage,
            passRatePct: outcome.passRatePct,
        };
    }

    /** Ошибка джобы: error-конверт 120 с, WS :error и Telegram-оповещение. */
    private async fail(data: AiBriefJobData, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        const code = error instanceof Error ? error.name : 'unknown';
        const alert = this.alerts.allow(
            `${AI_BRIEF_ALERT_KEY_PREFIX}:${data.domain}:${code}`,
            Date.now(),
        );
        this.logger.error(
            `Резюме ${data.requestKey} упало: ${message}` +
                (alert ? '' : ' (повтор, оповещение подавлено)'),
            alert ? { telegram: true } : undefined,
        );
        await this.store(
            data.requestKey,
            { status: 'error', message },
            AI_BRIEF_TTL_SECONDS.error,
        );
        this.notify<AiBriefWsErrorPayload>(
            data.socketId,
            AI_ANALYTICS_WS_EVENTS.BRIEF_ERROR,
            { requestKey: data.requestKey, message },
        );
    }

    /** Ошибка записи кэша не должна маскировать/ронять результат. */
    private async store(
        key: string,
        entry: AiBriefCacheEntry,
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
