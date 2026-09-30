/**
 * Входы шага «связь качества с результатом» (Фаза 4, П15): звонки ростера
 * за 12 месяцев окна, их сущности CRM, эпизоды шины и модель портала
 * прошлого месяца → выборка «звонок-триггер → ближний исход».
 *
 * Вынесено из `quality-link.step.ts` по лимиту 300 строк. Класс НЕ
 * инжектируемый: шаг создаёт его поверх своих зависимостей на прогон
 * (`new QualityLinkSourcesReader(...)`). Битрикс не вызывается.
 */
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_QUALITY_LINK_REASONS,
    assembleBetaSample,
    type AiQualityLinkReason,
    type BetaSample,
    type DealEpisode,
} from '@lib/sales-ai-analytics';
import {
    monthBounds,
    monthKeysBack,
} from '../constants/ai-manager-snapshot.const';
import { AI_QUALITY_LINK_WINDOW_MONTHS } from '../constants/ai-quality-link.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { assemblePortalBetaSample } from '../domain/assembler/beta-sample.assembler';
import type { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import type { CallsLoader } from '../domain/loaders/calls.loader';
import type { DatedLiteRow } from '../domain/loaders/lite-row.mapper';
import { portalRangeUtc } from '../domain/loaders/period.util';
import type { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { latestPortalByPeriod } from '../store/snapshot-latest-period.util';
import {
    modelSRefOf,
    offsetLogitOf,
    previousMonthKeyOf,
    qualityLinkEpisodesOf,
    sampleHorizonOf,
} from './quality-link.facts';
import type { AiPipelineStepContext, StepBus } from './step.types';

/** Входы выборки: звонки окна, эпизоды и модель портала. */
export interface QualityLinkSources {
    readonly sample: BetaSample;
    readonly dataReason?: AiQualityLinkReason;
    readonly rows: number;
    readonly modelId: string | null;
    readonly sRef: number | null;
}

export class QualityLinkSourcesReader {
    constructor(
        private readonly calls: CallsLoader,
        private readonly callEntities: CallEntityLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    /**
     * Выборка месяца: без эпизодов и без звонков ростера за окно — пустая
     * выборка с причиной (звонки при пустой истории не грузятся).
     */
    async read(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<QualityLinkSources> {
        const episodes = qualityLinkEpisodesOf(
            bus.get(AI_PIPELINE_BUS_KEYS.episodes),
        );
        const model = await this.model(ctx);
        const base = {
            modelId: model?.id ?? null,
            sRef: modelSRefOf(model?.payload),
        };
        if (episodes.length === 0) {
            return {
                ...base,
                sample: assembleBetaSample([]),
                dataReason: AI_QUALITY_LINK_REASONS.noHistory,
                rows: 0,
            };
        }
        const monthKeys = monthKeysBack(
            ctx.monthKey,
            AI_QUALITY_LINK_WINDOW_MONTHS,
        );
        const rows = await this.loadRows(ctx, monthKeys);
        if (rows.length === 0) {
            return {
                ...base,
                sample: assembleBetaSample([]),
                dataReason: AI_QUALITY_LINK_REASONS.noCalls,
                rows: 0,
            };
        }

        return {
            ...base,
            sample: await this.sample(ctx, rows, episodes, monthKeys, model),
            rows: rows.length,
        };
    }

    /**
     * Модель прошлого месяца, а без неё — самая поздняя модель СТРОГО
     * раньше месяца расчёта. «Последняя записанная» не годится: в догоне
     * месяца M модель M − 1 ещё не посчитана, а последней записанной была
     * бы модель M + 1 — оффсет и S_ref пришли бы из будущего.
     */
    private async model(
        ctx: AiPipelineStepContext,
    ): Promise<{ id: string; payload: unknown } | null> {
        return (
            (await this.snapshots.latestModel(
                ctx.domain,
                previousMonthKeyOf(ctx.monthKey),
            )) ??
            (await latestPortalByPeriod(
                this.snapshots,
                ctx.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
                ctx.monthKey,
            ))
        );
    }

    /** Звонки ростера за окно месяцев в границах суток портала. */
    private async loadRows(
        ctx: AiPipelineStepContext,
        monthKeys: readonly string[],
    ): Promise<DatedLiteRow[]> {
        const range = portalRangeUtc(
            monthBounds(monthKeys[0] ?? ctx.monthKey).from,
            monthBounds(ctx.monthKey).to,
            ctx.timeZone,
        );
        const roster = new Set(ctx.managerIds.map(String));
        const rows = await this.calls.loadLite(
            ctx.domain,
            range.from,
            range.to,
        );

        return rows.filter(
            row => row.managerId !== null && roster.has(row.managerId),
        );
    }

    private async sample(
        ctx: AiPipelineStepContext,
        rows: readonly DatedLiteRow[],
        episodes: readonly DealEpisode[],
        monthKeys: readonly string[],
        model: { payload: unknown } | null,
    ): Promise<BetaSample> {
        const refs = await this.callEntities.load(
            ctx.domain,
            rows.map(row => row.transcriptionId),
        );

        return assemblePortalBetaSample({
            rows,
            refs,
            episodes,
            timeZone: ctx.timeZone,
            now: sampleHorizonOf(ctx.now, ctx.day, ctx.timeZone),
            registry: ctx.registry,
            monthKeys,
            offsetLogit: offsetLogitOf(model?.payload),
        }).sample;
    }
}
