import { Inject, Injectable, Logger } from '@nestjs/common';
import { WsService } from '@/core/ws';
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
    AI_BRIEF_SNAPSHOT_RECORD,
    AI_BRIEF_TTL_SECONDS,
} from '../../constants/ai-brief.const';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import {
    AI_BRIEF_LLM_PORT,
    type AiBriefLlmPort,
    type AiBriefLlmUsage,
} from '../../brief/ai-brief-llm.port';
import { buildBriefPeriodKey } from '../../brief/brief-cache-key.util';
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
import { briefUsage, toBriefDto, toBriefSnapshot } from './brief-job.util';
import type { BriefUsageFacts } from './brief-job.util';

/**
 * Выполнение джобы SALES_AI_ANALYTICS_BRIEF (план §5.3, поток 18):
 * пакет фактов → квота → модель или шаблон → факт-чек → снапшот
 * `ai-analytics-brief` с расходом вызова → write-through в кэш (6 ч) →
 * WS `ai-analytics:brief:done`.
 *
 * Штатная деградация (§5.4): нет ключа VibeCode, исчерпана дневная квота
 * `brief_quota_per_day` или после факт-чета осталось меньше двух буллетов
 * — резюме собирается шаблоном с подписью причины, джоба завершается
 * успешно. А вот ОШИБКА вызова модели успехом не считается: error-конверт
 * на 120 с, WS `:error`, Telegram-оповещение (с подавлением повторов по
 * ключу «домен + код ошибки») и rethrow, чтобы Bull пометил джобу failed.
 */
@Injectable()
export class BriefJobUseCase {
    private readonly logger = new Logger(BriefJobUseCase.name);
    private readonly alerts = new AlertThrottle();

    constructor(
        private readonly pack: EvidencePackBuilder,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly settings: SettingsLoader,
        private readonly quota: BriefQuotaStore,
        @Inject(AI_BRIEF_LLM_PORT) private readonly llm: AiBriefLlmPort,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly cache: AiAnalyticsCacheService,
        private readonly ws: WsService,
    ) {}

    async execute(data: AiBriefJobData, now = new Date()): Promise<AiBriefDto> {
        try {
            const dto = await this.build(data, now);
            await this.store(
                data.requestKey,
                { status: 'ready', data: dto },
                AI_BRIEF_TTL_SECONDS.ready,
            );
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

    /** Пакет → резюме (модель либо шаблон) → снапшот → DTO. */
    private async build(data: AiBriefJobData, now: Date): Promise<AiBriefDto> {
        const pack = await this.pack.build({
            domain: data.domain,
            from: data.from,
            to: data.to,
            managerIds: data.managerIds,
            now,
        });
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
        await this.write(data, snapshot, pack, now, paramsVersion);

        return toBriefDto(composed.brief, usage);
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

    /**
     * Снапшот `ai-analytics-brief`: ключ периода — период и ростер
     * (`buildBriefPeriodKey`), менеджера нет. Прежние резюме того же
     * периода и состава `upsert` помечает superseded — ретенция ограничена
     * числом периодов (долг 40 волны C); packHash остаётся в `inputsHash`
     * и нагрузке, поэтому повтор с тем же пакетом записи не создаёт.
     * Расход вызова едет ещё и в `usage` конверта — стор кладёт его в
     * колонки tokens_count / price (решение B2 от 21.09.2026); модель
     * провайдера остаётся в нагрузке.
     */
    private async write(
        data: AiBriefJobData,
        payload: BriefSnapshot,
        pack: AiEvidencePack,
        now: Date,
        paramsVersion: string,
    ): Promise<void> {
        await this.snapshots.upsert<BriefSnapshot>({
            domain: data.domain,
            type: AI_BRIEF_SNAPSHOT_RECORD.TYPE,
            periodKey: buildBriefPeriodKey(data.from, data.to, data.managerIds),
            managerId: null,
            calcVersion: AI_ANALYTICS_CALC_VERSION,
            paramsVersion,
            inputsHash: pack.hash,
            generatedAt: now.toISOString(),
            payload,
            usage: { tokensCount: payload.tokensCount, price: payload.price },
        });
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
