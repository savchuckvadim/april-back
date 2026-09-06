/**
 * Срез обзора по типу звонка или возражениям (ТЗ FR-21): «широкая»
 * раскладка — строка на менеджера; «длинная» — строка на (сотрудник ×
 * показатель): оценка типа, разделы, чек-листы, KPI-факты, категории
 * возражений — каждая с оценкой (MetricDto) и объяснением. Чистые функции
 * над уже отфильтрованным по периметру AiOverviewDto.
 */
import { confidenceFor, MetricValue } from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_BY_TYPE_OBJECTIONS,
    AiAnalyticsByTypeCode,
    AiAnalyticsByTypeLayout,
} from '../../constants/ai-overview.const';
import {
    AiByTypeDto,
    AiByTypeLongRowDto,
    AiByTypeWideRowDto,
} from '../../dto/ai-by-type.dto';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import {
    AiCellChecklistsDto,
    AiManagerTypeCellDto,
} from '../../dto/ai-manager-type-cell.dto';
import { AiObjectionsManagerDto } from '../../dto/ai-objections.dto';
import { AiOverviewDto } from '../../dto/ai-overview.dto';
import { ru1, typeTitle } from './type-cell.presenter';

const OBJECTIONS_TITLE = 'Возражения';

/** Ключи чек-листов ячейки в порядке показа. */
const CHECKLIST_CODES = [
    'nextStepDateRatePct',
    'hvostDonePct',
    'fiveKDonePct',
    'handledRatePct',
] as const satisfies readonly (keyof AiCellChecklistsDto)[];

const CHECKLIST_TITLES: Record<(typeof CHECKLIST_CODES)[number], string> = {
    nextStepDateRatePct: 'Шаг с датой',
    hvostDonePct: '«Хвост»',
    fiveKDonePct: '«5К»',
    handledRatePct: 'Отработано возражений',
};

/** Метрика-факт без доверительной оценки (KPI-счётчик). */
const factMetric = (fact: number | null): MetricValue => ({
    value: fact,
    n: 0,
    confidence: {
        level: fact === null ? 'none' : 'ok',
        ...(fact === null ? { reason: 'not-enough-data' } : {}),
    },
});

/** Средняя раздела как метрика (доверие по n оценок). */
const sectionMetric = (avgScore: number | null, n: number): MetricValue => ({
    value: avgScore,
    n,
    confidence: confidenceFor(n, 'score'),
});

const pctText = (metric: MetricValue): string =>
    metric.value === null
        ? `мало данных (n = ${metric.n})`
        : `${Math.round(metric.value)} % (n = ${metric.n})`;

function cellOf(
    row: AiManagerRowDto,
    callType: string,
): AiManagerTypeCellDto | undefined {
    return row.byType.find(cell => cell.callType === callType);
}

export function toWideRow(
    row: AiManagerRowDto,
    cell: AiManagerTypeCellDto,
): AiByTypeWideRowDto {
    return {
        managerId: row.managerId,
        level: row.level,
        departmentId: row.departmentId,
        cell,
        primaryKpi: cell.primaryKpi,
        finance: row.finance,
    };
}

/** Строки «сотрудник | показатель | оценка | объяснение» по ячейке типа. */
export function toLongRows(
    managerId: string,
    cell: AiManagerTypeCellDto,
): AiByTypeLongRowDto[] {
    const rows: AiByTypeLongRowDto[] = [
        {
            managerId,
            kind: 'score',
            indicator: 'score',
            title: `Оценка: ${cell.title}`,
            metric: cell.score,
            explanation: cell.explanation.text,
        },
        ...cell.sections.map(section => ({
            managerId,
            kind: 'section' as const,
            indicator: section.section,
            title: section.title,
            metric: sectionMetric(section.avgScore, section.n),
            explanation: section.explanation.text,
        })),
    ];
    // Object.entries по DTO-классу выводит значение как any — идём по
    // известным ключам чек-листов.
    for (const code of CHECKLIST_CODES) {
        const metric = cell.checklists[code];
        if (!metric) continue;
        rows.push({
            managerId,
            kind: 'checklist',
            indicator: code,
            title: CHECKLIST_TITLES[code] ?? code,
            metric,
            explanation: `${CHECKLIST_TITLES[code] ?? code}: ${pctText(metric)}.`,
        });
    }
    for (const kpi of cell.kpi) {
        const plan =
            kpi.planCrm !== undefined ? `, план CRM ${kpi.planCrm}` : '';
        rows.push({
            managerId,
            kind: 'kpi',
            indicator: kpi.code,
            title: `KPI ${kpi.code}`,
            metric: factMetric(kpi.fact),
            explanation:
                kpi.fact === null
                    ? `Факта нет (${kpi.reason ?? 'нет данных'}).`
                    : `Факт ${kpi.fact}${plan}.`,
        });
    }
    return rows;
}

/** Строки по категориям возражений менеджера. */
export function toObjectionLongRows(
    manager: AiObjectionsManagerDto,
): AiByTypeLongRowDto[] {
    return manager.byCategory.map(category => {
        const outcomes = category.outcomes;
        const handled =
            category.handledRatePct.value === null
                ? 'мало данных'
                : `отработано ${ru1(category.handledRatePct.value)} %`;
        return {
            managerId: manager.managerId,
            kind: 'objection',
            indicator: category.category,
            title: category.category,
            metric: category.handledRatePct,
            explanation:
                `${category.n} возражений в ${category.calls} звонках, ${handled}; ` +
                `исходы: продолжили ${outcomes.continued}, согласились ${outcomes.converted}, ` +
                `ушли ${outcomes.disengaged}, без исхода ${outcomes.other}.`,
        };
    });
}

export function buildByType(
    overview: AiOverviewDto,
    callType: AiAnalyticsByTypeCode,
    layout: AiAnalyticsByTypeLayout,
): AiByTypeDto {
    if (callType === AI_ANALYTICS_BY_TYPE_OBJECTIONS) {
        return {
            callType,
            title: OBJECTIONS_TITLE,
            layout,
            period: overview.period,
            wide: null,
            long:
                layout === 'long'
                    ? overview.objections.byManager.flatMap(toObjectionLongRows)
                    : null,
            totals: null,
            objections: overview.objections,
        };
    }
    const pairs = overview.managers.flatMap(row => {
        const cell = cellOf(row, callType);
        return cell ? [{ row, cell }] : [];
    });
    return {
        callType,
        title: typeTitle(callType),
        layout,
        period: overview.period,
        wide:
            layout === 'wide'
                ? pairs.map(pair => toWideRow(pair.row, pair.cell))
                : null,
        long:
            layout === 'long'
                ? pairs.flatMap(pair =>
                      toLongRows(pair.row.managerId, pair.cell),
                  )
                : null,
        totals:
            overview.totals.find(item => item.callType === callType) ?? null,
        objections: null,
    };
}
