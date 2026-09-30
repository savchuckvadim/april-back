/**
 * Месячная модель портала (план Фазы 2, поток 16a): раз в месяц из
 * накопленных месячных снапшотов менеджеров собираются нормы слоёв,
 * сила усадки, качество, потолок темпа, шкала лага, стадийные θ,
 * готовность и журнал автособытий.
 *
 * Сценарий именно ОРКЕСТРИРУЕТ: считают готовые функции библиотеки
 * (`buildPortalNorms` → `leaveOneOutNorm` + `estimateEdgeKappa`,
 * `estimateMS`, `capacityQuantile`, `kaplanMeierLagCdf`, `buildReadiness`,
 * `betaGateCountdown`, `detectPortalEvents`), здесь — чтение входов,
 * штатная деградация и запись снапшота.
 *
 * Деградация (§5.4): месячных снапшотов в окне нет — переиспользуется
 * прошлая модель с пометкой `reused` и причиной; прошлой тоже нет —
 * запись не создаётся, а шаг уходит в журнал «частично» с причиной.
 * Повтор за тот же месяц на той же версии параметров (и тех же входах
 * Фазы 4 — пул с учётом согласия, связь качества) запись НЕ переписывает
 * (`freshResult`, аудит M4).
 *
 * `@Injectable` без bitrix-состояния: Битрикс на месячном шаге не
 * вызывается вовсе — все входы уже лежат в `ais`.
 */
import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    type ParamContext,
} from '@lib/sales-ai-analytics';
import { mergePortalEvents } from '@lib/sales-ai-analytics/model/portal-events';
import type { AiPortalEvent } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { monthKeysBack } from '../../constants/ai-manager-snapshot.const';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import {
    AI_PORTAL_MODEL_REASONS,
    AI_PORTAL_MODEL_WINDOW_MONTHS,
} from '../../constants/ai-portal-model.const';
import { AI_PORTAL_SEASON_WINDOW_MONTHS } from '../assembler/portal-model.estimates.phase4';
import { AiAnalyticsSettingsStore } from '../../store/ai-analytics-settings.store';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { buildPortalModelPayload } from '../assembler/portal-model.assembler';
import type {
    PortalModelFacts,
    PortalModelPayload,
    PortalModelRequest,
    PortalModelResult,
} from '../assembler/portal-model.types';
import { AiAnalyticsParamsLoader } from '../loaders/params.loader';
import {
    PortalModelLoader,
    type PortalModelRecord,
} from '../loaders/portal-model.loader';
import { Phase4SnapshotsLoader } from '../loaders/phase4-snapshots.loader';
import { SettingsLoader } from '../loaders/settings.loader';
import {
    detectedEventsOf,
    phase4InputsKeyOf,
    phase4LinksOf,
    portalPhase4FactsOf,
    portalReadinessFactsOf,
} from './portal-model.inputs';
import {
    freshResult,
    NO_MODEL_RESULT,
    portalModelMetaOf,
    priceMedianOf,
    reusedPayload,
} from './portal-model.reuse';

@Injectable()
export class PortalModelUseCase {
    constructor(
        private readonly settings: SettingsLoader,
        private readonly params: AiAnalyticsParamsLoader,
        private readonly loader: PortalModelLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly settingsStore: AiAnalyticsSettingsStore,
    ) {}

    async execute(
        request: PortalModelRequest,
        now: Date = new Date(),
    ): Promise<PortalModelResult> {
        const facts = request.facts ?? {};
        const settings = await this.settings.load(request.domain);
        const layers = await this.layers(request.domain, facts);
        const window = monthKeysBack(
            request.monthKey,
            AI_PORTAL_MODEL_WINDOW_MONTHS,
        );
        // Одна выборка на глубину сезона (≥ гейта 36 мес.): окну норм — его
        // 12 месяцев, сезону — вся глубина, иначе гейт сезона недостижим.
        const seasonMonths = await this.loader.loadMonths(
            request.domain,
            monthKeysBack(request.monthKey, AI_PORTAL_SEASON_WINDOW_MONTHS),
        );
        const inWindow = new Set(window);
        const months = seasonMonths.filter(month =>
            inWindow.has(month.monthKey),
        );
        const previous = await this.loader.latestModel(request.domain);
        const phase4 = new Phase4SnapshotsLoader(this.snapshots);
        const stored = await phase4.loadForMonth(
            request.domain,
            request.monthKey,
        );
        const phase4Key = phase4InputsKeyOf(
            phase4LinksOf(facts, request.monthKey, stored, settings),
        );
        // Идемпотентность до любой записи — и модели, и деградации (M4).
        const fresh = freshResult(
            previous,
            request,
            layers.paramsVersion,
            months,
            phase4Key,
        );
        if (fresh) return fresh;
        if (months.length === 0) {
            return this.degrade(request, previous, layers, now);
        }
        const detected = detectedEventsOf(
            request,
            facts,
            months,
            settings.events,
            previous,
        );
        const weekly = await phase4.loadWeeklyActivity(
            request.domain,
            request.monthKey,
            settings.calendar,
        );
        const payload = buildPortalModelPayload({
            monthKey: request.monthKey,
            window,
            months,
            seasonMonths,
            registry: layers.registry,
            qualityGroups: facts.qualityGroups ?? [],
            stageThetas: facts.stageThetas ?? [],
            saleLags: facts.saleLags ?? [],
            cycleMedianDays: facts.cycleMedianDays ?? null,
            chainSharePct: facts.chainSharePct ?? 0,
            edgeKind: facts.edgeKind ?? 'rate',
            edgeKindReason: facts.edgeKindReason ?? 'chain-below-enter',
            historyMonths: facts.historyMonths ?? 0,
            hypothesisPairs: settings.hypothesis?.pairs.length ?? 0,
            readiness: portalReadinessFactsOf(
                settings,
                facts,
                months,
                layers.comparableFrom,
            ),
            phase4: portalPhase4FactsOf(
                facts,
                request.monthKey,
                stored,
                weekly,
                settings,
            ),
            // Отчёт панели — только из шины этого прогона (ключ `sanity`);
            // старый из прошлой модели не тянется: он про другой месяц (N1).
            sanity: facts.sanity ?? null,
            events: mergePortalEvents(settings.events, detected),
            detectedEvents: detected,
            signature: {
                rubricVersion: facts.rubricVersion ?? null,
                scriptHash: facts.scriptHash ?? null,
                priceMedian: priceMedianOf(months, request.monthKey),
                phase4InputsKey: phase4Key,
            },
            meta: portalModelMetaOf(layers, now),
        });
        await this.saveEvents(request.domain, settings.events, detected);
        const { id } = await this.write(request, layers, payload, now);

        return {
            id,
            payload,
            reused: false,
            reason: null,
            months: months.length,
            written: 1,
        };
    }

    /** Слои реестра прогона: из контекста конвейера либо загруженные. */
    private async layers(
        domain: string,
        facts: PortalModelFacts,
    ): Promise<{
        registry: ParamContext;
        paramsVersion: string;
        comparableFrom: string;
        calcVersion: string;
        inputsHash: string;
    }> {
        const resolved =
            facts.registry === undefined
                ? await this.params.load(domain)
                : {
                      ctx: facts.registry,
                      paramsVersion: facts.paramsVersion ?? '',
                      comparableFrom: facts.comparableFrom ?? '',
                  };

        return {
            registry: resolved.ctx,
            paramsVersion: facts.paramsVersion ?? resolved.paramsVersion,
            comparableFrom: facts.comparableFrom ?? resolved.comparableFrom,
            calcVersion: facts.calcVersion ?? AI_ANALYTICS_CALC_VERSION,
            inputsHash: facts.inputsHash ?? '',
        };
    }

    /**
     * Данных окна нет: переиспользуем прошлую модель под ключом текущего
     * месяца — витрина остаётся с нормами, но честно помечена.
     */
    private async degrade(
        request: PortalModelRequest,
        previous: PortalModelRecord | null,
        layers: {
            paramsVersion: string;
            comparableFrom: string;
            calcVersion: string;
            inputsHash: string;
        },
        now: Date,
    ): Promise<PortalModelResult> {
        const payload = reusedPayload(
            previous,
            request.monthKey,
            portalModelMetaOf(layers, now),
        );
        if (payload === null) return NO_MODEL_RESULT;
        const { id } = await this.write(request, layers, payload, now);

        return {
            id,
            payload,
            reused: true,
            reason: AI_PORTAL_MODEL_REASONS.reusedPrevious,
            months: 0,
            written: 1,
        };
    }

    /** Журнал портала: автособытия дописываются ключом `ai_analytics_events`. */
    private async saveEvents(
        domain: string,
        known: readonly AiPortalEvent[],
        detected: readonly AiPortalEvent[],
    ): Promise<void> {
        if (detected.length === 0) return;
        await this.settingsStore.savePortalSettings(domain, {
            events: JSON.stringify(mergePortalEvents(known, detected)),
        });
    }

    /** Запись снапшота модели: ключ периода — месяц, менеджера нет. */
    private async write(
        request: PortalModelRequest,
        layers: {
            paramsVersion: string;
            calcVersion: string;
            inputsHash: string;
        },
        payload: PortalModelPayload,
        now: Date,
    ): Promise<{ id: string }> {
        const { id } = await this.snapshots.upsert({
            domain: request.domain,
            type: AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
            periodKey: request.monthKey,
            managerId: null,
            calcVersion: layers.calcVersion,
            paramsVersion: layers.paramsVersion,
            inputsHash: layers.inputsHash,
            generatedAt: now.toISOString(),
            payload,
        });

        return { id };
    }
}
