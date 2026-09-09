/**
 * Применимость разделов рубрики к типу звонка (план §4.3, поток 14b):
 * раздел с приором релевантности ниже порога в знаменатель оценок типа не
 * входит. «Презентация» в холодном звонке (приор 20) — не провал
 * менеджера, а раздел, которого в таком разговоре и не должно быть:
 * посчитав его, отдел получил бы систематически заниженную оценку
 * холодных.
 *
 * Таблица не настраивается и не хранится — она выводится из профилей
 * типов (`buildApplicability`, поток 5) и здесь только применяется. След
 * вычеркнутых разделов уезжает в снапшот: «Как считаем» обязано показать,
 * что именно не считалось, иначе число выглядит необъяснимым.
 *
 * Чистые детерминированные функции: вход не мутируется.
 */
import {
    buildApplicability,
    isSectionApplicable,
    type ApplicabilityTable,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import type { ManagerApplicabilityTrace } from './manager-snapshot.types';

export interface SectionApplicabilityResult {
    /** Строки без неприменимых разделов (в том же порядке). */
    rows: DatedLiteRow[];
    /** Порог приора релевантности таблицы — он же в следе менеджера. */
    minRelevance: number;
    /** След вычеркнутых разделов по менеджеру (ключ — managerId строкой). */
    byManager: Map<string, ManagerApplicabilityTrace>;
}

/** Пустой след: у менеджера все разделы разборов применимы к их типам. */
export const emptyApplicabilityTrace = (
    minRelevance: number,
): ManagerApplicabilityTrace => ({ minRelevance, excluded: [] });

/** Счётчик вычеркнутого раздела в следе (создаётся при первой встрече). */
function countCut(
    trace: ManagerApplicabilityTrace,
    callType: string,
    section: string,
): void {
    const found = trace.excluded.find(
        cut => cut.callType === callType && cut.section === section,
    );
    if (found) {
        found.calls += 1;
        return;
    }
    trace.excluded.push({ callType, section, calls: 1 });
}

/** Порядок следа детерминирован: тип звонка, затем код раздела. */
const compareCuts = (
    a: { callType: string; section: string },
    b: { callType: string; section: string },
): number =>
    a.callType.localeCompare(b.callType) || a.section.localeCompare(b.section);

/**
 * Вычёркивание неприменимых разделов из разборов периода. Звонок без
 * известного типа проходит целиком: гейт применимости не должен молча
 * терять данные, для которых тип ещё не определён (см. `isSectionApplicable`).
 */
export function applySectionApplicability(
    rows: readonly DatedLiteRow[],
    table: ApplicabilityTable = buildApplicability(),
): SectionApplicabilityResult {
    const byManager = new Map<string, ManagerApplicabilityTrace>();
    const filtered = rows.map(row => {
        const applicable = row.sections.filter(section =>
            isSectionApplicable(table, row.callType, section.section),
        );
        if (applicable.length === row.sections.length) return row;
        if (row.managerId !== null) {
            const trace =
                byManager.get(row.managerId) ??
                emptyApplicabilityTrace(table.minRelevance);
            byManager.set(row.managerId, trace);
            for (const section of row.sections) {
                if (applicable.includes(section)) continue;
                countCut(trace, row.callType ?? '', section.section);
            }
        }
        return { ...row, sections: applicable };
    });
    for (const trace of byManager.values()) trace.excluded.sort(compareCuts);
    return { rows: filtered, minRelevance: table.minRelevance, byManager };
}

/** След менеджера или пустой (все разделы его разборов применимы). */
export function applicabilityTraceOf(
    result: SectionApplicabilityResult,
    managerId: string,
): ManagerApplicabilityTrace {
    return (
        result.byManager.get(managerId) ??
        emptyApplicabilityTrace(result.minRelevance)
    );
}
