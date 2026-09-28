import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import {
    AI_BRIEF_COMPARE_REASONS,
    trimEvidencePack,
    type AiBriefFact,
    type AiEvidencePack,
    type BriefCompareStatus,
    type EvidencePackOptions,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import {
    AI_BRIEF_FACT_CODES,
    AI_BRIEF_PACK_ORDER,
    type AiBriefFactCode,
} from '../constants/ai-brief.const';
import { SettingsLoader } from '../domain/loaders/settings.loader';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    alertsFact,
    attentionFact,
    callsFact,
    disciplineFact,
    planVsFactSalesFact,
} from './evidence-pack.facts';
import {
    airtimeFact,
    dataQualityFact,
    forecastFact,
    funnelGapFact,
    pipelineFact,
} from './evidence-pack.facts.extra';
import {
    agendaFact,
    alertsUnhandledFact,
    focusFactAt,
} from './evidence-pack.focus';
import { EvidencePackSourceReader } from './evidence-pack.sources';
import type { BriefPackInput, BriefPackSources } from './evidence-pack.types';

export type { BriefPackInput } from './evidence-pack.types';

/** Сборщик факта по коду таблицы состава: источники и периметр → факт. */
type FactBuilder = (
    sources: BriefPackSources,
    managerIds: readonly string[],
) => AiBriefFact | null;

/** Сборщики фактов по кодам таблицы состава пакета (версия 2). */
const FACT_BUILDERS: Record<AiBriefFactCode, FactBuilder> = {
    [AI_BRIEF_FACT_CODES.alerts]: alertsFact,
    [AI_BRIEF_FACT_CODES.alertsUnhandled]: alertsUnhandledFact,
    [AI_BRIEF_FACT_CODES.attention]: attentionFact,
    [AI_BRIEF_FACT_CODES.focus1]: focusFactAt(0),
    [AI_BRIEF_FACT_CODES.focus2]: focusFactAt(1),
    [AI_BRIEF_FACT_CODES.focus3]: focusFactAt(2),
    [AI_BRIEF_FACT_CODES.funnelGap]: funnelGapFact,
    [AI_BRIEF_FACT_CODES.planVsFactSales]: planVsFactSalesFact,
    [AI_BRIEF_FACT_CODES.pipelineFromStage]: pipelineFact,
    [AI_BRIEF_FACT_CODES.disciplineNextStep]: disciplineFact,
    [AI_BRIEF_FACT_CODES.agenda]: agendaFact,
    [AI_BRIEF_FACT_CODES.callsOverThreshold]: callsFact,
    [AI_BRIEF_FACT_CODES.airtime]: airtimeFact,
    [AI_BRIEF_FACT_CODES.forecastP50]: forecastFact,
    [AI_BRIEF_FACT_CODES.dataQuality]: dataQualityFact,
};

/**
 * Состояние сравнения пакета — по тому, что реально сравнилось: прошлый
 * период раньше сравнимой истории → несопоставим; хотя бы один факт
 * сравнён с прошлым периодом → сравнение есть; о прошлом периоде нет
 * ничего → данных нет; иначе расчёт не готов (джоба не дождалась обзора
 * прошлого окна либо обзора самого периода ещё нет в кэше). Так статус
 * пакета и изменения фактов не могут разойтись.
 */
export function compareStatus(
    sources: BriefPackSources,
    facts: readonly AiBriefFact[],
): BriefCompareStatus {
    if (sources.beforeComparable) {
        return {
            previousPeriod: null,
            reason: AI_BRIEF_COMPARE_REASONS.beforeComparable,
        };
    }
    if (facts.some(fact => fact.comparable)) {
        return { previousPeriod: sources.previousPeriod, reason: null };
    }

    return {
        previousPeriod: null,
        reason:
            sources.prevFacts === null
                ? AI_BRIEF_COMPARE_REASONS.noData
                : AI_BRIEF_COMPARE_REASONS.prevNotReady,
    };
}

/**
 * Сборка пакета фактов AI-резюме (план Фазы 2, таблица состава потока 18,
 * версия 2 «что изменилось и что делать»).
 *
 * Источники — ТОЛЬКО кэш витрины и снапшоты ночного конвейера
 * (`EvidencePackSourceReader`): в Bitrix и в транскрипции сборщик не
 * ходит, тяжёлых загрузчиков не зовёт. При промахе кэша факт берётся из
 * снапшота, при промахе обоих — пропускается. Каждый факт, у которого
 * есть прошлый период той же длины, несёт `prev` и изменение; статус
 * сравнения входит в хэш пакета. Итог обрезается `trimEvidencePack` до
 * лимитов контракта.
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром.
 */
@Injectable()
export class EvidencePackBuilder {
    private readonly logger = new Logger(EvidencePackBuilder.name);
    private readonly reader: EvidencePackSourceReader;

    constructor(
        cache: AiAnalyticsCacheService,
        snapshots: AiAnalyticsSnapshotStore,
        settings: SettingsLoader,
        appCache: AppCacheService,
    ) {
        this.reader = new EvidencePackSourceReader(
            cache,
            snapshots,
            settings,
            appCache,
        );
    }

    async build(input: BriefPackInput): Promise<AiEvidencePack> {
        const sources = await this.reader.load(input);
        const managerIds = input.managerIds.map(String);
        const facts: AiBriefFact[] = [];
        for (const code of AI_BRIEF_PACK_ORDER) {
            const fact = FACT_BUILDERS[code](sources, managerIds);
            if (fact !== null) facts.push(fact);
        }
        const pack = trimWithCompare(sources, facts);
        this.logger.debug(
            `Пакет резюме ${input.domain} ${input.from}–${input.to}: ` +
                `${pack.facts.length} фактов, сравнение ` +
                `${pack.compare.reason ?? 'есть'}, hash ${pack.hash}`,
        );

        return pack;
    }
}

/**
 * Обрезка пакета вместе со статусом сравнения. Статус считается по
 * фактам, которые в пакете ОСТАЛИСЬ: если обрезка выбросила все
 * сравнённые факты, пакет не должен обещать сравнение.
 */
export function trimWithCompare(
    sources: BriefPackSources,
    facts: readonly AiBriefFact[],
    limits: Pick<EvidencePackOptions, 'maxFacts' | 'maxBytes'> = {},
): AiEvidencePack {
    const pack = trimEvidencePack(facts, {
        ...limits,
        compare: compareStatus(sources, facts),
    });
    const compare = compareStatus(sources, pack.facts);

    return compare.reason === pack.compare.reason
        ? pack
        : trimEvidencePack(facts, { ...limits, compare });
}
