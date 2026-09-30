/**
 * Шаг конвейера «связь качества с результатом» (план `ai-sales-analytics`
 * §4.4, §4.11 «ежемесячно»; Фаза 4, П15/П20).
 *
 * Порядок: звонки ростера за 12 месяцев окна модели (`CallsLoader.loadLite`,
 * а не `calls.rows` прогона — там только месяц) → сущности CRM из `ais` →
 * сцепка с эпизодами шины шага истории стадий → выборка «звонок-триггер →
 * ближний исход» (шина `betaSample`) → оценка β, калибровка, плацебо,
 * гейт с гистерезисом → снапшот `ai-analytics-quality-link` (portal-month,
 * ключ месяца расчёта) и шина `qualityLink` для модели портала.
 *
 * Битрикс не вызывается: эпизоды уже собрал `stage-history` того же
 * прогона, звонки и их сущности лежат в БД. Нет эпизодов или звонков —
 * снапшот `insufficient` с причиной (серия гейта обнуляется), а не пропуск.
 * Пропуск — только пустой ростер и прогон без шага истории стадий (белый
 * список джобы): тогда «нет эпизодов» ничего не говорит об истории.
 * Цензура ближнего исхода — по горизонту данных (`sampleHorizonOf`), а не
 * по моменту запуска: в догоне истории эпизоды известны лишь до дня прогона.
 * Идемпотентен: серия берётся из снапшота ПРОШЛОГО месяца, запись — через
 * `upsert` (повтор с той же сигнатурой не пишет копию; сигнатура — хэш
 * прогона плюс содержимое оценки, иначе повтор с другой выборкой отдал бы
 * id старой записи вместе с новой нагрузкой в шине).
 *
 * Теневой шаг (`optional`): сбой источника раннер пишет пропуском, и
 * месячный прогон доходит до санити и модели портала.
 *
 * `@Injectable` без bitrix-состояния.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    resolveNumberParam,
    type QualityLinkSnapshot,
} from '@lib/sales-ai-analytics';
import {
    AI_QUALITY_LINK_SKIP_REASONS,
    AI_QUALITY_LINK_STEP_CODE,
    AI_QUALITY_LINK_STEP_RHYTHMS,
} from '../constants/ai-quality-link.const';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import { formSectionsOf } from '../domain/assembler/beta-sample.assembler';
import {
    buildQualityLinkPayload,
    qualityLinkParamsOf,
} from '../domain/assembler/quality-link.assembler';
import { CallEntityLoader } from '../domain/loaders/call-entity.loader';
import { CallsLoader } from '../domain/loaders/calls.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import { contentInputsHashOf } from '../store/snapshot-serialize.util';
import {
    iccFormOf,
    previousMonthKeyOf,
    previousStreakOf,
    timestampLeakOkOf,
} from './quality-link.facts';
import { QualityLinkSourcesReader } from './quality-link.sources';
import {
    type AiAnalyticsPipelineStep,
    type AiPipelineStepContext,
    type AiPipelineStepResult,
    type StepBus,
    stepOk,
    stepSkipped,
} from './step.types';

/** Значение шины `qualityLink`: id записи и нагрузка снапшота. */
export interface QualityLinkBusEntry {
    readonly id: string;
    readonly payload: QualityLinkSnapshot;
}

@Injectable()
export class QualityLinkStep implements AiAnalyticsPipelineStep {
    readonly code = AI_QUALITY_LINK_STEP_CODE;
    readonly rhythms = AI_QUALITY_LINK_STEP_RHYTHMS;
    /** Теневой шаг: сбой источника не обрывает прогон (раннер — пропуск). */
    readonly optional = true;

    constructor(
        private readonly calls: CallsLoader,
        private readonly callEntities: CallEntityLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    async run(
        ctx: AiPipelineStepContext,
        bus: StepBus,
    ): Promise<AiPipelineStepResult> {
        const startedAt = Date.now();
        // Шаг истории стадий пишет historyMonths и при своём пропуске: нет
        // ключа — он в прогоне не участвовал, прошлую оценку не трогаем.
        const skipReason =
            ctx.managerIds.length === 0
                ? AI_QUALITY_LINK_SKIP_REASONS.rosterEmpty
                : bus.get(AI_PIPELINE_BUS_KEYS.historyMonths) === undefined
                  ? AI_QUALITY_LINK_SKIP_REASONS.stageHistoryMissing
                  : null;
        if (skipReason !== null) {
            return stepSkipped(this.code, skipReason, {
                ms: Date.now() - startedAt,
            });
        }
        const sources = await new QualityLinkSourcesReader(
            this.calls,
            this.callEntities,
            this.snapshots,
        ).read(ctx, bus);
        bus.set(AI_PIPELINE_BUS_KEYS.betaSample, sources.sample);
        const [previous, golden] = await Promise.all([
            this.snapshots.findByKeys(
                ctx.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
                {
                    periodKeys: [previousMonthKeyOf(ctx.monthKey)],
                    managerIds: [null],
                    latestOnly: true,
                },
            ),
            this.snapshots.latest(
                ctx.domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.goldenReport,
                null,
            ),
        ]);
        const leakMax = resolveNumberParam(
            'dq_timestamp_leak_max',
            ctx.registry,
        );
        const payload = buildQualityLinkPayload({
            monthKey: ctx.monthKey,
            sample: sources.sample,
            ...(sources.dataReason === undefined
                ? {}
                : { dataReason: sources.dataReason }),
            reliability: iccFormOf(
                golden?.payload,
                formSectionsOf(ctx.registry),
            ),
            previousStreak: previousStreakOf(
                previous[previous.length - 1]?.payload,
            ),
            timestampLeakOk:
                leakMax === undefined ||
                timestampLeakOkOf(
                    bus.get(AI_PIPELINE_BUS_KEYS.timestampLeak),
                    leakMax,
                ),
            sRef: sources.sRef,
            params: qualityLinkParamsOf(ctx.registry),
            meta: {
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                comparableFrom: ctx.comparableFrom || null,
                generatedAt: ctx.now.toISOString(),
                modelSnapshotId: sources.modelId,
            },
        });
        const saved = await this.snapshots.upsert(
            {
                domain: ctx.domain,
                type: AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
                periodKey: ctx.monthKey,
                managerId: null,
                calcVersion: ctx.calcVersion,
                paramsVersion: ctx.paramsVersion,
                // Звонки окна, их сущности и отчёт согласия в хэш прогона не
                // входят: без содержимого повтор с другим итогом отдал бы id
                // старой записи вместе с новой нагрузкой в шине.
                inputsHash: contentInputsHashOf(ctx.inputsHash, payload),
                generatedAt: ctx.now.toISOString(),
                payload,
            },
            { force: ctx.forceRefresh },
        );
        bus.set<QualityLinkBusEntry>(AI_PIPELINE_BUS_KEYS.qualityLink, {
            id: saved.id,
            payload,
        });

        return stepOk(this.code, {
            ms: Date.now() - startedAt,
            rows: sources.rows,
            written: saved.written,
        });
    }
}
