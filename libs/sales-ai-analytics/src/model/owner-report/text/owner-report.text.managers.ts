import type {
    OwnerReportFacts,
    OwnerReportManagerRow,
    OwnerShare,
} from '../owner-report.types';
import { pctText, shareText } from './owner-report.format';
import {
    MANAGER_COLUMNS,
    type ManagerColumn,
    type OwnerReportManagerText,
} from './owner-report.text.types';

/**
 * Карточки сотрудников шаблоном: сильные стороны и риски — отклонения от
 * команды по тем же долям, вывод — сложение самого заметного плюса и
 * самого заметного риска. Без рейтинга напоказ (решение 07.09.2026):
 * сравнение с командой словами, без мест.
 */

/** Отклонение от команды в пунктах, с которого признак считается заметным. */
export const MANAGER_MARGIN_PCT = 10;
/** С какой доли продвижений команды сотрудник — «ядро продаж». */
const CORE_SHARE_PCT = 35;
/** Минимум разговоров, чтобы делать выводы по сотруднику. */
export const MANAGER_MIN_CALLS = 5;
const TRAITS_LIMIT = 3;

type ShareColumn = Exclude<ManagerColumn, 'calls' | 'crm'>;

interface Trait {
    column: ShareColumn;
    /** Что измеряет доля — для строки-подтверждения. */
    measure: string;
    /** Чем выше, тем лучше (для конфликта и ухода от ответа — наоборот). */
    higherBetter: boolean;
    good: string;
    bad: string;
}

const TRAITS: readonly Trait[] = [
    {
        column: 'contactedAdvanced',
        measure: 'шаг вперёд в разговорах с ЛПР',
        higherBetter: true,
        good: 'разговор с ЛПР чаще других заканчивается шагом вперёд',
        bad: 'разговор с ЛПР реже других заканчивается шагом вперёд',
    },
    {
        column: 'coldAdvanced',
        measure: 'холодные с шагом вперёд',
        higherBetter: true,
        good: 'холодный вход работает лучше, чем у команды',
        bad: 'холодный вход почти не работает',
    },
    {
        column: 'needsFound',
        measure: 'выяснил задачи',
        higherBetter: true,
        good: 'выясняет задачи клиента чаще других',
        bad: 'задачи клиента выясняет реже других — продаёт скриптом',
    },
    {
        column: 'presentationByNeeds',
        measure: 'показ под задачи',
        higherBetter: true,
        good: 'показывает систему под задачи клиента',
        bad: 'показывает систему по шаблону, не под задачи клиента',
    },
    {
        column: 'closingAttempted',
        measure: 'попытка закрытия',
        higherBetter: true,
        good: 'пробует закрыть разговор на шаг',
        bad: 'редко пробует закрыть разговор на шаг',
    },
    {
        column: 'nextStepDated',
        measure: 'шаг с датой',
        higherBetter: true,
        good: 'фиксирует шаг с датой',
        bad: 'оставляет разговор без шага с датой',
    },
    {
        column: 'objectionsHandled',
        measure: 'отработано возражений',
        higherBetter: true,
        good: 'отрабатывает возражения',
        bad: 'оставляет возражения без ответа',
    },
    {
        column: 'postponedWithDate',
        measure: 'отложенные с датой возврата',
        higherBetter: true,
        good: 'у отложенных разговоров есть дата возврата',
        bad: 'отложенные разговоры остаются без даты возврата',
    },
    {
        column: 'conflict',
        measure: 'разговоры с конфликтным тоном',
        higherBetter: false,
        good: 'чистая коммуникация без конфликтного тона',
        bad: 'конфликтный тон или давление в разговорах',
    },
    {
        column: 'evasive',
        measure: 'ушёл от ответа',
        higherBetter: false,
        good: 'прямо отвечает, зачем звонит',
        bad: 'уходит от ответа «вы что-то предлагаете?» — риск для репутации',
    },
];

export function buildManagerTexts(
    facts: OwnerReportFacts,
    names: Readonly<Record<string, string>>,
): OwnerReportManagerText[] {
    const team = teamShares(facts.managers);
    return facts.managers.map(row => managerText(row, team, names));
}

/** Доли команды по тем же знаменателям (сумма числителей / сумма n). */
function teamShares(
    rows: readonly OwnerReportManagerRow[],
): Record<ShareColumn, number | null> {
    const columns = TRAITS.map(trait => trait.column);
    const result = {} as Record<ShareColumn, number | null>;
    for (const column of [
        ...columns,
        'reactivationAdvanced',
        'advancedShareOfTeam',
        'upsellShareOfTeam',
    ] as ShareColumn[]) {
        let successes = 0;
        let n = 0;
        for (const row of rows) {
            successes += row[column].successes;
            n += row[column].n;
        }
        result[column] = n > 0 ? (successes / n) * 100 : null;
    }
    return result;
}

function managerText(
    row: OwnerReportManagerRow,
    team: Record<ShareColumn, number | null>,
    names: Readonly<Record<string, string>>,
): OwnerReportManagerText {
    const name = names[row.managerId] ?? `Сотрудник ${row.managerId}`;
    // Без стены «мало данных» (правило владельца 06.11): выводы считаются
    // всегда, у малого числа разговоров — пометка «предварительно».
    const enough = row.calls >= MANAGER_MIN_CALLS;
    const strengths: string[] = [];
    const risks: string[] = [];
    if ((row.advancedShareOfTeam.pct ?? 0) >= CORE_SHARE_PCT) {
        strengths.push(
            `даёт ${shareText(row.advancedShareOfTeam)} продвижений команды`,
        );
    }
    for (const trait of TRAITS) {
        const verdict = traitVerdict(
            row[trait.column],
            team[trait.column],
            trait,
        );
        const evidence = evidenceOf(
            trait,
            row[trait.column],
            team[trait.column],
        );
        if (verdict === 'good' && strengths.length < TRAITS_LIMIT) {
            strengths.push(`${trait.good}: ${evidence}`);
        }
        if (verdict === 'bad' && risks.length < TRAITS_LIMIT) {
            risks.push(`${trait.bad}: ${evidence}`);
        }
    }
    return {
        managerId: row.managerId,
        name,
        headline: headlineOf(row, strengths, risks, enough),
        cells: cellsOf(row),
        strengths,
        risks,
        conclusion: conclusionOf(row, strengths, risks, enough),
        source: 'template',
    };
}

/**
 * Чем подтверждён признак: «шаг с датой — в 0 из 10 разговоров, в среднем
 * по отделу 24 %». Раньше было «(0%)» рядом с риском — читалось как «риска
 * нет» (замечание владельца 07.11.2026).
 */
function evidenceOf(
    trait: Trait,
    share: OwnerShare,
    teamPct: number | null,
): string {
    const team =
        teamPct === null ? '' : `, в среднем по отделу ${pctText(teamPct)}`;
    return `${trait.measure} — ${share.successes} из ${share.n} (${pctText(share.pct)})${team}`;
}

function traitVerdict(
    share: OwnerShare,
    teamPct: number | null,
    trait: Trait,
): 'good' | 'bad' | null {
    if (share.pct === null || teamPct === null) return null;
    const delta = trait.higherBetter
        ? share.pct - teamPct
        : teamPct - share.pct;
    if (!trait.higherBetter && share.successes > 0 && delta <= 0) return 'bad';
    if (delta >= MANAGER_MARGIN_PCT) return 'good';
    if (delta <= -MANAGER_MARGIN_PCT) return 'bad';
    return null;
}

function headlineOf(
    row: OwnerReportManagerRow,
    strengths: readonly string[],
    risks: readonly string[],
    enough: boolean,
): string {
    const base = baseHeadline(row, strengths, risks);
    return enough ? base : `${base} · предварительно, ${row.calls} разг.`;
}

function baseHeadline(
    row: OwnerReportManagerRow,
    strengths: readonly string[],
    risks: readonly string[],
): string {
    if ((row.advancedShareOfTeam.pct ?? 0) >= CORE_SHARE_PCT) {
        return risks.length > 0 ? 'Ядро продаж — с рисками' : 'Ядро продаж';
    }
    if (strengths.length > 0 && risks.length === 0)
        return 'Сильные стороны без заметных рисков';
    if (strengths.length === 0 && risks.length > 0) return 'Есть что поправить';
    if (strengths.length > 0) return 'Сильные стороны и риски рядом';
    return 'На уровне команды';
}

function conclusionOf(
    row: OwnerReportManagerRow,
    strengths: readonly string[],
    risks: readonly string[],
    enough: boolean,
): string {
    const advanced =
        row.contactedAdvanced.n > 0
            ? `, шаг вперёд в ${pctText(row.contactedAdvanced.pct)} разговоров с ЛПР`
            : '';
    const parts: string[] = [
        `${shareText(row.shareOfTeam)} разговоров команды${advanced}.`,
    ];
    if (!enough) parts.push('Разговоров немного — выводы предварительные.');
    if (strengths.length > 0) parts.push(`Сильная сторона: ${strengths[0]}.`);
    if (risks.length > 0) parts.push(`Риск: ${risks[0]}.`);
    return parts.join(' ');
}

function cellsOf(row: OwnerReportManagerRow): Record<ManagerColumn, string> {
    const cells = {} as Record<ManagerColumn, string>;
    for (const column of MANAGER_COLUMNS) {
        if (column === 'calls') {
            cells.calls = `${row.calls} (${pctText(row.shareOfTeam.pct)})`;
        } else if (column === 'crm') {
            cells.crm = row.crm
                ? `${row.crm.deals} / ${row.crm.invoices} / ${row.crm.presentations}`
                : '—';
        } else {
            cells[column] = shareText(row[column]);
        }
    }
    return cells;
}
