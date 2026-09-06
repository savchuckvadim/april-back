import { CALL_REPORT_SECTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { MatrixCellCore, MatrixSectionAggregate } from './matrix.types';
import { MetricValue } from './metric';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Контекст объяснения: команда и прошлый период (для «Изменение»). */
export interface ExplanationContext {
    /** Медиана оценки команды (шкала 1–10); null/undefined — не показывать. */
    teamMedian?: number | null;
    /** Оценка той же ячейки за прошлый сравнимый период. */
    previous?: MetricValue | null;
    /** σ оценок прошлого периода (для ±интервала изменения). */
    previousSd?: number | null;
}

export interface CellExplanation {
    text: string;
    /** Машиночитаемые опоры каждого числа текста (code=value). */
    basis: string[];
}

/** Слова, запрещённые в объяснениях до Фазы 3 (план §4.11). */
export const EXPLANATION_FORBIDDEN_WORDS = ['значимо'] as const;

type ScoredSection = MatrixSectionAggregate & { avgScore: number };

const SECTION_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

/** Число с одной десятичной и запятой (6,4). */
const ru1 = (value: number): string => value.toFixed(1).replace('.', ',');
/** Число с одной десятичной и точкой для basis (6.4). */
const en1 = (value: number): string => value.toFixed(1);
const signed = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${ru1(Math.abs(value))}`;

/** Подпись раздела строчными: «работа по цене»; неизвестный код — как есть. */
export function sectionTitle(code: string): string {
    const title = SECTION_TITLES.get(code);
    return title ? title.charAt(0).toLowerCase() + title.slice(1) : code;
}

const compareByScore = (a: ScoredSection, b: ScoredSection): number =>
    a.avgScore - b.avgScore || a.section.localeCompare(b.section);

function scoredSections(cell: MatrixCellCore): ScoredSection[] {
    return cell.sections
        .filter((item): item is ScoredSection => item.avgScore !== null)
        .sort(compareByScore);
}

function sectionSentences(
    sections: readonly ScoredSection[],
    basis: string[],
): string[] {
    if (sections.length === 0) {
        return [
            `Разделы: нет оценённых (нужно n ≥ ${AI_ANALYTICS_THRESHOLDS.scoreNone}).`,
        ];
    }
    const weak = sections[0];
    const describe = (item: ScoredSection): string =>
        `${sectionTitle(item.section)} ${ru1(item.avgScore)} (n = ${item.n})`;
    if (sections.length === 1) {
        basis.push(`section=${weak.section}:${en1(weak.avgScore)}:n=${weak.n}`);
        return [`Раздел: ${describe(weak)}.`];
    }
    const strong = sections[sections.length - 1];
    basis.push(
        `strong=${strong.section}:${en1(strong.avgScore)}:n=${strong.n}`,
    );
    basis.push(`weak=${weak.section}:${en1(weak.avgScore)}:n=${weak.n}`);
    return [`Сильно: ${describe(strong)}.`, `Слабо: ${describe(weak)}.`];
}

function changeSentence(
    cell: MatrixCellCore,
    current: number,
    context: ExplanationContext,
    basis: string[],
): string {
    const previous = context.previous;
    if (previous === undefined || previous === null) {
        return 'Изменение: нет сравнимой истории.';
    }
    if (previous.value === null) {
        basis.push(`n_prev=${previous.n}`);
        return `Изменение: мало данных за прошлый период (n = ${previous.n}).`;
    }
    const delta = current - previous.value;
    basis.push(`delta=${en1(delta)}`, `n_prev=${previous.n}`);
    const sd = cell.scoreSd;
    const sdPrev = context.previousSd ?? null;
    if (sd === null || sdPrev === null || previous.n <= 0 || cell.n <= 0) {
        return `Изменение ${signed(delta)} (n = ${cell.n}/${previous.n}).`;
    }
    const halfWidth =
        AI_ANALYTICS_THRESHOLDS.z90 *
        Math.sqrt(sd ** 2 / cell.n + sdPrev ** 2 / previous.n);
    basis.push(`halfwidth=${en1(halfWidth)}`);
    const withinNoise =
        Math.abs(delta) <= halfWidth ? ' — в пределах разброса' : '';
    return `Изменение ${signed(delta)} (n = ${cell.n}/${previous.n}; ±${ru1(halfWidth)})${withinNoise}.`;
}

function adviceSentence(
    sections: readonly ScoredSection[],
    cell: MatrixCellCore,
): string {
    if (sections.length === 0) {
        return 'Совет: накопить разборы, чтобы увидеть разделы.';
    }
    const weak = sections[0];
    const where =
        cell.evidenceCallIds.worst === null
            ? 'на ближайших звонках'
            : `на звонке ${cell.evidenceCallIds.worst}`;
    return `Совет: разобрать «${sectionTitle(weak.section)}» ${where}.`;
}

/**
 * Объяснение оценки ячейки по шаблону плана (§3, ТЗ FR-23):
 * «Оценка 6,4/10 (n = 18). Сильно: приветствие 8,1 (n = 18). Слабо: работа
 * по цене 4,2 (n = 11). Изменение −0,9 (n = 18/22; ±0,5). Один совет.»
 * Каждое число текста продублировано в basis (code=value, точка как
 * разделитель). Слово «значимо» не используется. При confidence none —
 * «мало данных (n = …)». ±интервал изменения — z90·√(σ²/n + σ′²/n′).
 */
export function renderCellExplanation(
    cell: MatrixCellCore,
    context: ExplanationContext = {},
): CellExplanation {
    if (cell.score.value === null) {
        return { text: `мало данных (n = ${cell.n})`, basis: [`n=${cell.n}`] };
    }
    const basis: string[] = [`score=${en1(cell.score.value)}`, `n=${cell.n}`];
    const sections = scoredSections(cell);
    const sentences = [
        `Оценка ${ru1(cell.score.value)}/10 (n = ${cell.n}).`,
        ...sectionSentences(sections, basis),
        changeSentence(cell, cell.score.value, context, basis),
    ];
    if (typeof context.teamMedian === 'number') {
        basis.push(`team_median=${en1(context.teamMedian)}`);
        sentences.push(`Команда: медиана ${ru1(context.teamMedian)}.`);
    }
    sentences.push(adviceSentence(sections, cell));
    const { best, worst, median } = cell.evidenceCallIds;
    basis.push(
        `evidence=best:${best ?? '-'};worst:${worst ?? '-'};median:${median ?? '-'}`,
    );
    return { text: sentences.join(' '), basis };
}
