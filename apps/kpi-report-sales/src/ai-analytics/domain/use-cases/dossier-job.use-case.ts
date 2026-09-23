import { Injectable, Logger } from '@nestjs/common';
import { WsService } from '@/core/ws';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_WS_EVENTS } from '../../constants/ai-analytics.const';
import {
    AI_DOSSIER_REASONS,
    AI_DOSSIER_SECTIONS,
    AI_DOSSIER_TTL_SECONDS,
} from '../../constants/ai-dossier.const';
import {
    AiDossierCacheEntry,
    AiDossierDto,
    AiDossierJobData,
    AiDossierWsDonePayload,
    AiDossierWsErrorPayload,
} from '../../dto/ai-dossier.dto';
import type { ReadinessDto } from '../../dto/readiness.dto';
import { buildStyleCard } from '../../style/style-card.presenter';
import {
    buildDossier,
    DossierReasons,
    section,
    toFeedbackSummary,
    toMeta,
    toRopMarks,
    toSeries,
} from '../assembler/dossier.assembler';
import { toObjectionCategories, toPassport } from '../assembler/dossier.reader';
import { DossierSourcesLoader } from '../loaders/dossier-sources.loader';
import type { DossierSources } from '../loaders/dossier-sources.loader';

/**
 * Выполнение джобы SALES_AI_ANALYTICS_DOSSIER (план Фазы 3, П4): окно
 * месяцев → снапшоты, метки и реакции из `ais` → сборка досье →
 * write-through в кэш → WS `ai-analytics:dossier:done`.
 *
 * Битрикс здесь не опрашивается вовсе: всё, из чего собирается досье,
 * уже лежит в `ais` и в настройках портала.
 *
 * Штатная деградация (§5.4): любой пустой или упавший раздел даёт `null`
 * и запись в `reasons[]`, а досье собирается целиком. Разделы `trends`,
 * `planFact` и `yoy` делают соседние потоки — пока их презентеры не
 * подключены сборкой, они приходят `null` с причиной
 * `section-not-available`. Провал ВСЕЙ джобы (не раздела) — это уже
 * ошибка: error-конверт на 120 с, WS `:error` и rethrow, чтобы Bull
 * пометил джобу failed.
 *
 * `@Injectable` без bitrix-состояния (CLAUDE.md): домен — параметр джобы.
 */
@Injectable()
export class DossierJobUseCase {
    private readonly logger = new Logger(DossierJobUseCase.name);

    constructor(
        private readonly sources: DossierSourcesLoader,
        private readonly cache: AiAnalyticsCacheService,
        private readonly ws: WsService,
    ) {}

    async execute(
        data: AiDossierJobData,
        now = new Date(),
    ): Promise<AiDossierDto> {
        try {
            const dto = this.build(await this.sources.load(data), data, now);
            await this.store(
                data.requestKey,
                { status: 'ready', data: dto },
                this.ttlOf(data, now),
            );
            this.notify<AiDossierWsDonePayload>(
                data.socketId,
                AI_ANALYTICS_WS_EVENTS.DOSSIER_DONE,
                {
                    requestKey: data.requestKey,
                    generatedAt: dto.meta.generatedAt,
                },
            );

            return dto;
        } catch (error) {
            await this.fail(data, error);
            throw error;
        }
    }

    /** Источники → разделы с причинами пустых → досье. */
    private build(
        sources: DossierSources,
        data: AiDossierJobData,
        now: Date,
    ): AiDossierDto {
        const reasons = new DossierReasons();
        const { managerId } = data;
        const lastMonth = sources.months[sources.months.length - 1] ?? null;
        const dossier = buildDossier(
            managerId,
            {
                passport: section(reasons, AI_DOSSIER_SECTIONS.passport, () =>
                    toPassport(lastMonth?.payload ?? null, managerId),
                ),
                series: section(reasons, AI_DOSSIER_SECTIONS.series, () =>
                    toSeries(sources.weeks, sources.months),
                ),
                // Тренды, план-факт и год назад делают соседние потоки
                // (П1, П2, П3): пока их презентеры не подключены сборкой,
                // разделы честно пусты с причиной, а не выдуманы здесь.
                trends: reasons.add(
                    AI_DOSSIER_SECTIONS.trends,
                    AI_DOSSIER_REASONS.sectionNotAvailable,
                ),
                planFact: reasons.add(
                    AI_DOSSIER_SECTIONS.planFact,
                    AI_DOSSIER_REASONS.sectionNotAvailable,
                ),
                yoy: reasons.add(
                    AI_DOSSIER_SECTIONS.yoy,
                    AI_DOSSIER_REASONS.sectionNotAvailable,
                ),
                style: this.styleOf(sources, data, reasons, now),
                objections: section(
                    reasons,
                    AI_DOSSIER_SECTIONS.objections,
                    () => toObjectionCategories(sources.weeks),
                ),
                feedbackSummary: section(
                    reasons,
                    AI_DOSSIER_SECTIONS.feedbackSummary,
                    () => toFeedbackSummary(sources.feedback, managerId),
                ),
                ropMarks: section(reasons, AI_DOSSIER_SECTIONS.ropMarks, () =>
                    toRopMarks(sources.ropMarks, managerId),
                ),
                readiness: section(reasons, AI_DOSSIER_SECTIONS.readiness, () =>
                    this.readinessOf(sources),
                ),
            },
            reasons,
            toMeta(sources.snapshotIds, data.months, now),
        );
        this.logger.log(
            `Досье ${data.requestKey}: разделов пусто ` +
                `${dossier.reasons.length}, снапшотов ` +
                `${dossier.meta.snapshotIds.length}`,
        );

        return dossier;
    }

    /**
     * Карточка стиля из снапшота `ai-analytics-style` тем же презентером,
     * что и ручка стиля: отказ сотрудника — не пустой раздел, а карточка
     * со статусом `opt_out`; причина в `reasons[]` объясняет, почему в
     * ней нет чисел.
     */
    private styleOf(
        sources: DossierSources,
        data: AiDossierJobData,
        reasons: DossierReasons,
        now: Date,
    ): AiDossierDto['style'] {
        if (sources.styleOptOut) {
            reasons.add(
                AI_DOSSIER_SECTIONS.style,
                AI_DOSSIER_REASONS.styleOptOut,
            );
        }
        return section(reasons, AI_DOSSIER_SECTIONS.style, () => {
            if (sources.style === null && !sources.styleOptOut) return null;

            return buildStyleCard({
                managerId: data.managerId,
                monthKey: sources.style?.periodKey ?? null,
                payload: sources.style?.payload ?? null,
                generatedAt: sources.style?.generatedAt ?? null,
                optOut: sources.styleOptOut,
                nowMonthKey: now.toISOString().slice(0, 7),
            });
        });
    }

    /**
     * Готовность витрины берётся из снапшота модели портала последнего
     * месяца окна — своего расчёта досье не делает (иначе два источника
     * одного режима разъезжались бы).
     */
    private readinessOf(sources: DossierSources): ReadinessDto | null {
        return sources.readiness;
    }

    /**
     * TTL записи: окно, упирающееся в текущий месяц, живое (10 минут);
     * окно целиком из закрытых месяцев уже не изменится (30 дней).
     */
    private ttlOf(data: AiDossierJobData, now: Date): number {
        const last = data.months[data.months.length - 1] ?? '';

        return last < now.toISOString().slice(0, 7)
            ? AI_DOSSIER_TTL_SECONDS.closed
            : AI_DOSSIER_TTL_SECONDS.live;
    }

    /** Ошибка джобы: error-конверт 120 с и WS :error. */
    private async fail(data: AiDossierJobData, error: unknown): Promise<void> {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Досье ${data.requestKey} упало: ${message}`);
        await this.store(
            data.requestKey,
            { status: 'error', message },
            AI_DOSSIER_TTL_SECONDS.error,
        );
        this.notify<AiDossierWsErrorPayload>(
            data.socketId,
            AI_ANALYTICS_WS_EVENTS.DOSSIER_ERROR,
            { requestKey: data.requestKey, message },
        );
    }

    /** Ошибка записи кэша не должна маскировать/ронять результат. */
    private async store(
        key: string,
        entry: AiDossierCacheEntry,
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
