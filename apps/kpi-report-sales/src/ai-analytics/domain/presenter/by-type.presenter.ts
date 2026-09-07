/**
 * Срез обзора по типу звонка, по всем типам вместе (all) или по возражениям
 * (ТЗ FR-21): «широкая» раскладка — строка на пару (менеджер × тип);
 * «длинная» — строка на (сотрудник × показатель): оценка типа, разделы,
 * чек-листы, KPI-факты, категории возражений — каждая с оценкой (MetricDto)
 * и объяснением. Чистые функции над уже отфильтрованным по периметру
 * AiOverviewDto.
 */
import { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    confidenceFor,
    isCallTypeCode,
    MetricValue,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_BY_TYPE_ALL,
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
const ALL_TITLE = 'Все типы';

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

/** Пара «строка менеджера × ячейка типа» — единица обеих раскладок. */
interface ByTypePair {
    row: AiManagerRowDto;
    cell: AiManagerTypeCellDto;
    callType: CallReportCallTypeCode;
}

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

/**
 * Пары в порядке менеджеров обзора, внутри менеджера — в порядке типов
 * справочника: row.byType уже упорядочен compareCallTypes, то есть как
 * ключи AI_ANALYTICS_EVENT_KINDS и подвкладки settings.callTypes. При all
 * берутся все ячейки строки, включая other и irrelevant — buildManagerCells
 * строит ячейку на каждый код справочника, так что в обзоре они есть
 * (bucket = null, но n и чек-листы свои). Коды вне справочника
 * (orderedCallTypes допускает их) в срез не попадают: callType строк
 * типизирован кодом справочника.
 */
function pairsOf(
    overview: AiOverviewDto,
    callType: CallReportCallTypeCode | typeof AI_ANALYTICS_BY_TYPE_ALL,
): ByTypePair[] {
    const wanted = (code: CallReportCallTypeCode): boolean =>
        callType === AI_ANALYTICS_BY_TYPE_ALL || code === callType;
    return overview.managers.flatMap(row =>
        row.byType.flatMap(cell =>
            isCallTypeCode(cell.callType) && wanted(cell.callType)
                ? [{ row, cell, callType: cell.callType }]
                : [],
        ),
    );
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
    callType: AiAnalyticsByTypeCode,
): AiByTypeLongRowDto[] {
    const base = { managerId, callType };
    const rows: AiByTypeLongRowDto[] = [
        {
            ...base,
            kind: 'score',
            indicator: 'score',
            title: `Оценка: ${cell.title}`,
            metric: cell.score,
            explanation: cell.explanation.text,
        },
        ...cell.sections.map(
            (section): AiByTypeLongRowDto => ({
                ...base,
                kind: 'section',
                indicator: section.section,
                title: section.title,
                metric: sectionMetric(section.avgScore, section.n),
                explanation: section.explanation.text,
            }),
        ),
    ];
    // Object.entries по DTO-классу выводит значение как any — идём по
    // известным ключам чек-листов.
    for (const code of CHECKLIST_CODES) {
        const metric = cell.checklists[code];
        if (!metric) continue;
        rows.push({
            ...base,
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
            ...base,
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
            callType: AI_ANALYTICS_BY_TYPE_OBJECTIONS,
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

function buildObjectionsSlice(
    overview: AiOverviewDto,
    layout: AiAnalyticsByTypeLayout,
): AiByTypeDto {
    return {
        callType: AI_ANALYTICS_BY_TYPE_OBJECTIONS,
        title: OBJECTIONS_TITLE,
        layout,
        period: overview.period,
        wide: null,
        long:
            layout === 'long'
                ? overview.objections.byManager.flatMap(toObjectionLongRows)
                : null,
        totals: null,
        totalsByType: null,
        objections: overview.objections,
    };
}

/**
 * Срез по типу: один тип — totals по нему; all — строки на каждую пару
 * менеджер × тип, totals = null, totalsByType = итоги обзора по всем типам.
 */
export function buildByType(
    overview: AiOverviewDto,
    callType: AiAnalyticsByTypeCode,
    layout: AiAnalyticsByTypeLayout,
): AiByTypeDto {
    if (callType === AI_ANALYTICS_BY_TYPE_OBJECTIONS) {
        return buildObjectionsSlice(overview, layout);
    }
    const isAll = callType === AI_ANALYTICS_BY_TYPE_ALL;
    const pairs = pairsOf(overview, callType);
    return {
        callType,
        title: isAll ? ALL_TITLE : typeTitle(callType),
        layout,
        period: overview.period,
        wide:
            layout === 'wide'
                ? pairs.map(pair => toWideRow(pair.row, pair.cell))
                : null,
        long:
            layout === 'long'
                ? pairs.flatMap(pair =>
                      toLongRows(pair.row.managerId, pair.cell, pair.callType),
                  )
                : null,
        totals: isAll
            ? null
            : (overview.totals.find(item => item.callType === callType) ??
              null),
        totalsByType: isAll ? overview.totals : null,
        objections: null,
    };
}
