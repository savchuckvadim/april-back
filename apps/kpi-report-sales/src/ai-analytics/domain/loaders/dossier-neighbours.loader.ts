import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    samePeriodKey,
    type PlanSnapshot,
    type WorkCalendar,
} from '@lib/sales-ai-analytics';
import { AI_DOSSIER_SNAPSHOT_LIMIT } from '../../constants/ai-dossier.const';
import type { AiDossierJobData } from '../../dto/ai-dossier.dto';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { planDayCeilingOf } from '../assembler/plan-fact.assembler';
import type { DossierSnapshotView } from '../assembler/dossier.reader';
import { toView, weekKeysOf } from './dossier-sources.util';
import { SettingsLoader } from './settings.loader';

/** Что нужно реконсиляции план-факт последнего месяца окна. */
export interface DossierPlanFactSource {
    monthKey: string;
    /** Снимок целей руководителя; null — снимка за месяц нет. */
    plan: PlanSnapshot | null;
    calendar: WorkCalendar;
    timeZone: string;
    dailyPlanEnabled: boolean;
    /** `plan_day_ceiling` портала; undefined — дефолт реестра. */
    dayCeiling?: number;
}

/** Источники разделов соседних ручек: тренды, план-факт, «год назад». */
export interface DossierNeighbourSources {
    /** Последний снапшот трендов менеджера в неделях окна; null — нет. */
    trends: DossierSnapshotView | null;
    /** Месяц менеджера год назад (M−12 последнего месяца окна). */
    baseMonth: DossierSnapshotView | null;
    /** Вход план-факта; null — настройки портала не прочитаны. */
    planFact: DossierPlanFactSource | null;
    /** Идентификаторы прочитанных записей ais (в meta досье). */
    snapshotIds: string[];
}

/**
 * Чтение источников для разделов досье, которые в отдельных ручках
 * собирают соседние срезы (план Фазы 3: П1 тренды, П2 план-факт, П3
 * год назад). Досье их не пересчитывает: снапшот трендов, снимок целей и
 * месяц M−12 уже лежат в `ais`, в Битрикс отсюда не ходят.
 *
 * Отдельный загрузчик, а не рост `DossierSourcesLoader` (правило «файл
 * не длиннее 300 строк»); `@Injectable` без bitrix-состояния — домен
 * приходит параметром джобы.
 */
@Injectable()
export class DossierNeighboursLoader {
    private readonly logger = new Logger(DossierNeighboursLoader.name);

    constructor(
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly settings: SettingsLoader,
    ) {}

    async load(data: AiDossierJobData): Promise<DossierNeighbourSources> {
        const { domain, managerId, months } = data;
        const last = months[months.length - 1];
        if (last === undefined) {
            return {
                trends: null,
                baseMonth: null,
                planFact: null,
                snapshotIds: [],
            };
        }
        const [trends, baseMonth, planFact] = await Promise.all([
            this.trends(domain, managerId, months),
            this.baseMonth(domain, managerId, last),
            this.planFact(domain, last),
        ]);

        return {
            trends,
            baseMonth,
            planFact,
            snapshotIds: [trends, baseMonth].flatMap(record =>
                record === null ? [] : [record.id],
            ),
        };
    }

    /**
     * Снапшот трендов за самую позднюю неделю окна: шаг трендов пишет
     * запись раз в неделю по закрытой ISO-неделе, окно досье — недели
     * его месяцев.
     */
    private async trends(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierSnapshotView | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.trends,
            {
                periodKeys: weekKeysOf(months),
                managerIds: [managerId],
                latestOnly: true,
                limit: AI_DOSSIER_SNAPSHOT_LIMIT,
            },
        );
        const last = [...records].sort((left, right) =>
            left.periodKey.localeCompare(right.periodKey),
        )[records.length - 1];

        return last === undefined ? null : toView(last);
    }

    /** Месяц менеджера год назад; ключ M−12 не месяц или записи нет — null. */
    private async baseMonth(
        domain: string,
        managerId: string,
        monthKey: string,
    ): Promise<DossierSnapshotView | null> {
        const baseKey = samePeriodKey(monthKey);
        if (baseKey === null) return null;
        const records = await this.snapshots.findManagerMonths(
            domain,
            [baseKey],
            { limit: AI_DOSSIER_SNAPSHOT_LIMIT, managerIds: [managerId] },
        );
        const record = records[records.length - 1];

        return record === undefined ? null : toView(record);
    }

    /**
     * Снимок целей месяца и настройки портала (календарь, план дня,
     * потолок дня). Настройки не прочитаны — null: раздел план-факта
     * придёт пустым с причиной, остальное досье соберётся.
     */
    private async planFact(
        domain: string,
        monthKey: string,
    ): Promise<DossierPlanFactSource | null> {
        try {
            const [settings, records] = await Promise.all([
                this.settings.load(domain),
                this.snapshots.findByKeys(
                    domain,
                    AI_ANALYTICS_SNAPSHOT_TYPE.plan,
                    { periodKeys: [monthKey], latestOnly: true },
                ),
            ]);
            const record = records[records.length - 1];
            const ceiling = planDayCeilingOf(settings);

            return {
                monthKey,
                plan:
                    record === undefined
                        ? null
                        : (record.payload as PlanSnapshot),
                calendar: settings.calendar,
                timeZone: settings.calendar.timeZone,
                dailyPlanEnabled: settings.dailyPlanEnabled,
                ...(ceiling === undefined ? {} : { dayCeiling: ceiling }),
            };
        } catch (error) {
            this.logger.warn(
                `План-факт досье ${domain} ${monthKey} без источников: ` +
                    `${(error as Error).message}`,
            );

            return null;
        }
    }
}
