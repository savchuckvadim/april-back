import { Injectable, Logger } from '@nestjs/common';
import { AI_ANALYTICS_SNAPSHOT_TYPE } from '@lib/sales-ai-analytics';
import { AI_DOSSIER_SNAPSHOT_LIMIT } from '../../constants/ai-dossier.const';
import type { AiDossierJobData } from '../../dto/ai-dossier.dto';
import type { ReadinessDto } from '../../dto/readiness.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { AiAnalyticsRopMarkStore } from '../../store/ai-analytics-rop-mark.store';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import { StyleSettingsLoader } from '../../style/style-settings.loader';
import {
    DossierNeighboursLoader,
    type DossierNeighbourSources,
} from './dossier-neighbours.loader';
import type { StyleSnapshotPayload } from '../../style/style-card.presenter';
import type {
    DossierFeedbackView,
    DossierRopMarkView,
} from '../assembler/dossier.assembler';
import type { DossierSnapshotView } from '../assembler/dossier.reader';
import {
    monthAfter,
    toReadiness,
    toView,
    weekKeysOf,
} from './dossier-sources.util';

// Чистые помощники выборки живут в `dossier-sources.util.ts` (правило
// «файл ≤ 300 строк»); реэкспорт — чтобы спеки и соседи импортировали их
// из загрузчика, как раньше.
export { toReadiness, weekKeysOf } from './dossier-sources.util';

/** Снапшот стиля в том объёме, в каком его читает карточка. */
export interface DossierStyleView {
    periodKey: string;
    generatedAt: string;
    payload: StyleSnapshotPayload;
}

/** Всё, из чего собирается досье: только `ais` и настройки портала. */
export interface DossierSources {
    months: DossierSnapshotView[];
    weeks: DossierSnapshotView[];
    style: DossierStyleView | null;
    styleOptOut: boolean;
    readiness: ReadinessDto | null;
    feedback: DossierFeedbackView[];
    ropMarks: DossierRopMarkView[];
    /** Источники разделов соседних ручек: тренды, план-факт, год назад. */
    neighbours: DossierNeighbourSources;
    /** Идентификаторы всех прочитанных записей ais (для meta досье). */
    snapshotIds: string[];
}

/**
 * Чтение источников досье менеджера (план Фазы 3, П4). В Битрикс не
 * ходит: месяцы, недели, стиль и модель портала лежат в `ais`, отказ от
 * профилирования — в настройках приложения портала.
 *
 * Отдельный загрузчик, а не тело джобы: джоба отвечает за конверт, кэш и
 * WS, загрузчик — за источники (одна ответственность на сервис, CLAUDE.md;
 * оба файла держатся в пределах 300 строк).
 *
 * `@Injectable` без bitrix-состояния: домен приходит параметром джобы.
 */
@Injectable()
export class DossierSourcesLoader {
    private readonly logger = new Logger(DossierSourcesLoader.name);

    constructor(
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly feedback: AiAnalyticsFeedbackStore,
        private readonly ropMarks: AiAnalyticsRopMarkStore,
        private readonly styleSettings: StyleSettingsLoader,
        private readonly neighbours: DossierNeighboursLoader,
    ) {}

    async load(data: AiDossierJobData): Promise<DossierSources> {
        const { domain, managerId, months } = data;
        const [monthRecords, weekRecords, style, readiness, marks, neighbours] =
            await Promise.all([
                this.monthSnapshots(domain, managerId, months),
                this.weekSnapshots(domain, managerId, months),
                this.styleSnapshot(domain, managerId, months),
                this.readiness(domain, months),
                this.marks(domain, managerId, months),
                this.neighbours.load(data),
            ]);
        const feedback = await this.feedbackOf(domain, managerId, months);

        return {
            months: monthRecords,
            weeks: weekRecords,
            style,
            styleOptOut: await this.optedOut(domain, managerId),
            readiness,
            feedback,
            ropMarks: marks,
            neighbours,
            snapshotIds: [
                ...monthRecords.map(record => record.id),
                ...weekRecords.map(record => record.id),
                ...neighbours.snapshotIds,
            ],
        };
    }

    /** Месяцы менеджера за окно (по одному актуальному на ключ месяца). */
    private async monthSnapshots(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierSnapshotView[]> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerMonth,
            {
                periodKeys: [...months],
                managerIds: [managerId],
                latestOnly: true,
            },
        );

        return records.map(toView);
    }

    /**
     * Недели менеджера за окно: ключи недель выводятся из месяцев окна
     * (первое и последнее число каждого месяца плюс шаг в 7 дней), чтобы
     * выборка шла по ключам, а не широким окном `created_at`.
     */
    private async weekSnapshots(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierSnapshotView[]> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.managerWeek,
            {
                periodKeys: weekKeysOf(months),
                managerIds: [managerId],
                latestOnly: true,
                limit: AI_DOSSIER_SNAPSHOT_LIMIT,
            },
        );

        return records.map(toView);
    }

    /** Последний профиль стиля менеджера в пределах окна. */
    private async styleSnapshot(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierStyleView | null> {
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            {
                periodKeys: [...months],
                managerIds: [managerId],
                latestOnly: true,
            },
        );
        const last = [...records].sort((left, right) =>
            left.periodKey.localeCompare(right.periodKey),
        )[records.length - 1];
        if (last === undefined) return null;

        return {
            periodKey: last.periodKey,
            generatedAt: last.generatedAt,
            payload: last.payload as StyleSnapshotPayload,
        };
    }

    /** Готовность витрины из модели портала последнего месяца окна. */
    private async readiness(
        domain: string,
        months: readonly string[],
    ): Promise<ReadinessDto | null> {
        const last = months[months.length - 1];
        if (last === undefined) return null;
        const record = await this.snapshots.latestModel(domain, last);

        return record === null ? null : toReadiness(record.payload);
    }

    /** Метки руководителя по звонкам менеджера за недели окна. */
    private async marks(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierRopMarkView[]> {
        const collected: DossierRopMarkView[] = [];
        for (const weekKey of weekKeysOf(months)) {
            const marks = await this.ropMarks.listMarks(domain, weekKey);
            collected.push(
                ...marks
                    .filter(
                        mark =>
                            mark.managerId !== null &&
                            String(Number(mark.managerId)) === managerId,
                    )
                    .map(mark => ({
                        managerId: mark.managerId,
                        agree: mark.agree,
                        ropScore: mark.ropScore,
                        sections: [...mark.sections],
                    })),
            );
        }

        return collected;
    }

    /** Реакции по менеджеру за окно (по created_at записей ais). */
    private async feedbackOf(
        domain: string,
        managerId: string,
        months: readonly string[],
    ): Promise<DossierFeedbackView[]> {
        const first = months[0];
        const last = months[months.length - 1];
        if (first === undefined || last === undefined) return [];
        const records = await this.feedback.listInPeriod(
            domain,
            new Date(`${first}-01T00:00:00.000Z`),
            new Date(`${monthAfter(last)}-01T00:00:00.000Z`),
            managerId,
        );

        return records.map(record => ({
            kind: record.kind,
            managerId: record.managerId,
        }));
    }

    /** Отказ сотрудника от профилирования; сбой настроек — «не отказывался». */
    private async optedOut(
        domain: string,
        managerId: string,
    ): Promise<boolean> {
        try {
            return await this.styleSettings.isOptedOut(domain, managerId);
        } catch (error) {
            this.logger.warn(
                `Настройка отказа от стиля ${domain} не прочитана: ` +
                    `${(error as Error).message}`,
            );

            return false;
        }
    }
}
