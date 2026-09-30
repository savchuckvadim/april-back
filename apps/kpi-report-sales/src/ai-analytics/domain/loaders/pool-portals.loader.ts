/**
 * Входы пула порталов (план `ai-sales-analytics` §4.4 «Пул», §4.7 SI_0,
 * §4.10 E2; Фаза 4, П17/П22): порталы AI-аналитики → настройки согласия →
 * модель портала и оценка связи качества за месяц расчёта (или ближайший
 * прошлый) → вход пула `PoolPortalInput` библиотеки.
 *
 * ⚠ Обезличенно: ключ портала — `snapshotHashKey([domain])`, домен в
 * результат не попадает. Участник — портал с `poolOptIn` и датой согласия
 * (`ai_analytics_pool_opt_in` / `ai_analytics_pool_consent_at`); остальные
 * не читаются вовсе.
 * ⚠ Битрикс не вызывается: чужие домены читаются только из `ais` через
 * стор снапшотов. Сбой одного портала (настройки, стор) — лог и пропуск
 * портала, пул собирается по остальным.
 * ⚠ Месяц записи — не позже расчётного (`recordUpTo`): догон истории пишет
 * прошлые месяцы после текущего, «последняя записанная» была бы старой.
 *
 * Разбор нагрузок — `pool-portals.facts.ts`. `@Injectable` без
 * bitrix-состояния.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    type AiAnalyticsSnapshotType,
    type PoolPortalInput,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import type { AiAnalyticsSnapshotRecord } from '../../store/ai-analytics-snapshot.types';
import {
    isPoolParticipant,
    poolPortalInputOf,
    poolPortalKeyOf,
    recordUpTo,
} from './pool-portals.facts';
import { AiAnalyticsPortalsLoader } from './portals.loader';
import { SettingsLoader } from './settings.loader';

@Injectable()
export class PoolPortalsLoader {
    private readonly logger = new Logger(PoolPortalsLoader.name);

    constructor(
        private readonly portals: AiAnalyticsPortalsLoader,
        private readonly settings: SettingsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
    ) {}

    /**
     * Входы пула за месяц `monthKey` ('YYYY-MM') по всем порталам с
     * согласием, в порядке обезличенного ключа (детерминированно).
     * Порталы без согласия не читаются.
     */
    async load(monthKey: string): Promise<PoolPortalInput[]> {
        const domains = await this.portals.listDomains();
        const inputs: PoolPortalInput[] = [];
        for (const domain of domains) {
            const input = await this.portalInput(domain, monthKey);
            if (input !== null) inputs.push(input);
        }

        return inputs.sort((a, b) => a.portalKey.localeCompare(b.portalKey));
    }

    private async portalInput(
        domain: string,
        monthKey: string,
    ): Promise<PoolPortalInput | null> {
        const portalKey = poolPortalKeyOf(domain);
        try {
            const settings = await this.settings.load(domain);
            if (!isPoolParticipant(settings)) return null;
            const [model, qualityLink] = await Promise.all([
                this.upTo(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.portalModel,
                    monthKey,
                ),
                this.upTo(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.qualityLink,
                    monthKey,
                ),
            ]);

            return poolPortalInputOf({
                portalKey,
                consentAt: settings.poolConsentAt,
                model: model?.payload ?? null,
                qualityLink: qualityLink?.payload ?? null,
            });
        } catch (error) {
            this.logger.warn(
                `Портал ${portalKey} не вошёл в пул: ${String(error)}`,
            );

            return null;
        }
    }

    /** Портальная запись типа за месяц не позже расчётного. */
    private async upTo(
        domain: string,
        type: AiAnalyticsSnapshotType,
        monthKey: string,
    ): Promise<AiAnalyticsSnapshotRecord | null> {
        const records = await this.snapshots.findByKeys(domain, type, {
            managerIds: [null],
            latestOnly: true,
            limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
        });

        return recordUpTo(records, monthKey);
    }
}
