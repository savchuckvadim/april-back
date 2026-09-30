/**
 * Части сборки обзора, вынесенные из `overview.presenter.ts` по лимиту
 * 300 строк: календарные счётчики периода, объединение ростера с
 * менеджерами матрицы, версии разбора, медиана команды и итоги по типам.
 * Чистые функции.
 */
import {
    isWorkday,
    shiftDate,
    TypeTotalsCell,
    versionsSignature,
    WorkCalendar,
} from '@lib/sales-ai-analytics';
import { AiManagerRowDto } from '../../dto/ai-manager-row.dto';
import {
    AiAnalysisVersionsDto,
    AiTypeTotalsDto,
} from '../../dto/ai-overview.dto';
import { emptyCellKpi, sumCellKpi } from '../assembler/manager-facts.assembler';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import {
    emptyCellCore,
    median,
    orderedCallTypes,
    toCellDto,
} from './type-cell.presenter';

/** Рабочих дней [from; to] по календарю портала. */
export function countWorkdays(
    from: string,
    to: string,
    calendar: WorkCalendar,
): number {
    let count = 0;
    for (let day = from; day <= to; day = shiftDate(day, 1)) {
        if (isWorkday(day, calendar)) count += 1;
    }
    return count;
}

/** Календарных дней [from; to]. */
export function countDays(from: string, to: string): number {
    const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
    return Math.round(ms / 86_400_000) + 1;
}

/** Объединение ростера и менеджеров матрицы, строками, по возрастанию id. */
export function unionManagerIds(
    roster: readonly number[],
    fromMatrix: readonly string[],
): string[] {
    return [...new Set([...roster.map(String), ...fromMatrix])].sort(
        (a, b) => Number(a) - Number(b),
    );
}

/** Версии последнего разобранного звонка + число разных сигнатур. */
export function resolveVersions(
    rows: readonly DatedLiteRow[],
): AiAnalysisVersionsDto {
    const analyzed = rows.filter(row => row.analysisPresent);
    const latest = [...analyzed]
        .filter(row => row.versions !== null)
        .sort(
            (a, b) => b.callStartedAt.getTime() - a.callStartedAt.getTime(),
        )[0];
    const versions = latest?.versions ?? {};
    return {
        prompt: versions.prompt ?? null,
        rubric: versions.rubric ?? null,
        registry: versions.registry ?? null,
        attribution: versions.attribution ?? null,
        classifier: versions.classifier ?? null,
        distinct: new Set(analyzed.map(versionsSignature)).size,
    };
}

/** Медиана оценок менеджеров по каждому типу (для «Команда: медиана …»). */
export function teamMediansOf(
    rows: readonly AiManagerRowDto[],
): Map<string, number | null> {
    const values = new Map<string, number[]>();
    for (const row of rows) {
        for (const cell of row.byType) {
            if (cell.score.value === null) continue;
            const list = values.get(cell.callType) ?? [];
            list.push(cell.score.value);
            values.set(cell.callType, list);
        }
    }
    return new Map(
        [...values.entries()].map(([callType, list]) => [
            callType,
            median(list),
        ]),
    );
}

/** Итоги по типам: ядро ячейки итога + суммы KPI по строкам группы. */
export function toTotals(
    totals: readonly TypeTotalsCell[],
    rows: readonly AiManagerRowDto[],
): AiTypeTotalsDto[] {
    const byType = new Map(totals.map(cell => [cell.callType, cell]));
    return orderedCallTypes(byType.keys()).map(callType => {
        const cell = byType.get(callType);
        const cells = rows.flatMap(row =>
            row.byType.filter(item => item.callType === callType),
        );
        const kpi = sumCellKpi(cells.map(item => item.kpi));
        const primaryCode = cells.find(item => item.primaryKpi)?.primaryKpi
            ?.code;
        return {
            ...toCellDto(callType, cell ?? emptyCellCore(), emptyCellKpi(), {
                teamMedian: null,
            }),
            kpi,
            primaryKpi: kpi.find(item => item.code === primaryCode) ?? null,
            kpiReason: cells[0]?.kpiReason ?? null,
            managers: cell?.managers ?? 0,
        };
    });
}
