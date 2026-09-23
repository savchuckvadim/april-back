/**
 * Сборка досье менеджера (план Фазы 3, П4): прочитанные снапшоты, метки
 * руководителя и реакции → `AiDossierDto`.
 *
 * Правило раздела одно: раздел либо есть целиком, либо он `null` и в
 * `reasons[]` лежит код причины с подписью. Ни один пустой раздел не
 * роняет досье — так сформулирована приёмка потока. Чужие нагрузки
 * читаются структурно (`unknown` + проверки), чтобы незнакомое значение
 * соседнего потока не роняло карточку.
 *
 * Чистые функции: без DI, Bitrix и Prisma. Всё, что нужно для сборки,
 * приходит параметрами — читают источники use-case'ы.
 */
import {
    AI_DOSSIER_REASONS,
    AI_DOSSIER_REASON_TEXTS,
    AI_DOSSIER_SECTIONS,
    type AiDossierReason,
    type AiDossierSection,
} from '../../constants/ai-dossier.const';
import { AI_ANALYTICS_CALC_VERSION } from '../../constants/ai-overview.const';
import type {
    AiDossierFeedbackSummaryDto,
    AiDossierMetaDto,
    AiDossierPassportDto,
    AiDossierReasonDto,
    AiDossierRopMarksDto,
    AiDossierSeriesDto,
    AiDossierSeriesPointDto,
} from '../../dto/ai-dossier-parts.dto';
import type { AiDossierDto } from '../../dto/ai-dossier.dto';
import type { AiObjectionCategoryDto } from '../../dto/ai-objections.dto';
import type { MetricDto } from '../../dto/metric.dto';
import {
    emptyMetric,
    scoreMetricOf,
    toObjectionCategories,
    toPassport,
    type DossierSnapshotView,
} from './dossier.reader';

export type { DossierSnapshotView } from './dossier.reader';

/** Копилка причин: раздел пуст → код причины и её подпись. */
export class DossierReasons {
    private readonly items: AiDossierReasonDto[] = [];

    add(section: AiDossierSection, reason: AiDossierReason): null {
        this.items.push({
            section,
            reason,
            text: AI_DOSSIER_REASON_TEXTS[reason],
        });

        return null;
    }

    list(): AiDossierReasonDto[] {
        return [...this.items];
    }
}

/**
 * Секция или `null` с причиной: значение `null`/`undefined` и любая
 * ошибка чтения превращаются в пустой раздел с подписью, а не в отказ
 * всего досье.
 */
export function section<T>(
    reasons: DossierReasons,
    code: AiDossierSection,
    read: () => T | null | undefined,
    missing: AiDossierReason = AI_DOSSIER_REASONS.noSnapshots,
): T | null {
    try {
        const value = read();

        return value === null || value === undefined
            ? reasons.add(code, missing)
            : value;
    } catch {
        return reasons.add(code, AI_DOSSIER_REASONS.sectionFailed);
    }
}

/** Ряд периодов: снапшоты по возрастанию ключа → точки ряда. */
export function toSeriesPoints(
    records: readonly DossierSnapshotView[],
): AiDossierSeriesPointDto[] {
    return [...records]
        .sort((left, right) => left.periodKey.localeCompare(right.periodKey))
        .map(record => ({
            periodKey: record.periodKey,
            n: numberOf(record.payload, 'n'),
            score: scoreMetricOf(record.payload),
        }));
}

/** Ряды досье; null — ни недель, ни месяцев за окно нет. */
export function toSeries(
    weeks: readonly DossierSnapshotView[],
    months: readonly DossierSnapshotView[],
): AiDossierSeriesDto | null {
    if (weeks.length === 0 && months.length === 0) return null;

    return {
        weeks: toSeriesPoints(weeks),
        months: toSeriesPoints(months),
    };
}

/** Реакция из ais глазами досье (форма стора, без зависимости от него). */
export interface DossierFeedbackView {
    kind: string;
    managerId: string | null;
}

/** Свод обратной связи; null — реакций по менеджеру за окно не было. */
export function toFeedbackSummary(
    records: readonly DossierFeedbackView[],
    managerId: string,
): AiDossierFeedbackSummaryDto | null {
    const own = records.filter(
        record =>
            record.managerId !== null &&
            String(Number(record.managerId)) === managerId,
    );
    if (own.length === 0) return null;
    const byKind: Record<string, number> = {};
    for (const record of own) {
        byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    }

    return { total: own.length, byKind };
}

/** Метка руководителя глазами досье (форма стора, без зависимости). */
export interface DossierRopMarkView {
    managerId: string | null;
    agree: boolean;
    ropScore: number | null;
    sections: string[];
}

/** Свод меток руководителя; null — меток по менеджеру за окно не было. */
export function toRopMarks(
    records: readonly DossierRopMarkView[],
    managerId: string,
): AiDossierRopMarksDto | null {
    const own = records.filter(
        record =>
            record.managerId !== null &&
            String(Number(record.managerId)) === managerId,
    );
    if (own.length === 0) return null;
    const scores = own
        .map(record => record.ropScore)
        .filter((score): score is number => typeof score === 'number');

    return {
        total: own.length,
        agree: own.filter(record => record.agree).length,
        ropScore: averageMetric(scores),
        sections: rankSections(own),
    };
}

/** Средняя оценка руководителя по меткам с оценкой (пусто — value null). */
function averageMetric(scores: readonly number[]): MetricDto {
    if (scores.length === 0) return emptyMetric();
    const sum = scores.reduce((total, score) => total + score, 0);

    return {
        value: sum / scores.length,
        n: scores.length,
        confidence: { level: 'ok' },
    };
}

/** Коды разделов замечаний по убыванию частоты, при равенстве — по коду. */
function rankSections(records: readonly DossierRopMarkView[]): string[] {
    const counts = new Map<string, number>();
    for (const record of records) {
        for (const code of record.sections) {
            counts.set(code, (counts.get(code) ?? 0) + 1);
        }
    }

    return [...counts.entries()]
        .sort(
            (left, right) =>
                right[1] - left[1] || left[0].localeCompare(right[0]),
        )
        .map(([code]) => code);
}

/** Целое поле чужой нагрузки; не число — 0 (а не «данных нет»). */
function numberOf(payload: unknown, field: string): number {
    const value = (payload as Record<string, unknown> | null)?.[field];

    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Служебный блок досье: версия расчёта, прочитанные записи, момент. */
export function toMeta(
    snapshotIds: readonly string[],
    months: readonly string[],
    now: Date,
): AiDossierMetaDto {
    return {
        calcVersion: AI_ANALYTICS_CALC_VERSION,
        snapshotIds: [...new Set(snapshotIds)].sort(),
        generatedAt: now.toISOString(),
        months: [...months],
    };
}

/** Разделы, которые досье получает готовыми от соседних потоков. */
export interface DossierSections {
    passport: AiDossierPassportDto | null;
    series: AiDossierSeriesDto | null;
    trends: AiDossierDto['trends'];
    planFact: AiDossierDto['planFact'];
    yoy: AiDossierDto['yoy'];
    style: AiDossierDto['style'];
    objections: AiObjectionCategoryDto[] | null;
    feedbackSummary: AiDossierFeedbackSummaryDto | null;
    ropMarks: AiDossierRopMarksDto | null;
    readiness: AiDossierDto['readiness'];
}

/** Досье целиком: разделы, причины пустых разделов и служебный блок. */
export function buildDossier(
    managerId: string,
    sections: DossierSections,
    reasons: DossierReasons,
    meta: AiDossierMetaDto,
): AiDossierDto {
    return {
        managerId,
        ...sections,
        reasons: reasons.list(),
        meta,
    };
}

export {
    AI_DOSSIER_SECTIONS,
    emptyMetric,
    scoreMetricOf,
    toObjectionCategories,
    toPassport,
};
