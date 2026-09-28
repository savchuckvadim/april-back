import { CALL_REPORT_SECTIONS } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { MatrixCellCore, MatrixSectionAggregate } from './matrix.types';
import { MetricValue } from './metric';
import { RU_FORMS, ruCount, ruDecimal } from './ru-text.util';
import { AI_ANALYTICS_THRESHOLDS } from './thresholds.const';

/** Контекст объяснения: команда и прошлый период (для «Изменение»). */
export interface ExplanationContext {
    /** Медиана оценки команды (шкала 1–10); null/undefined — не показывать. */
    teamMedian?: number | null;
    /** Оценка той же ячейки за прошлый сравнимый период. */
    previous?: MetricValue | null;
    /** σ оценок прошлого периода (для ±интервала изменения). */
    previousSd?: number | null;
    /**
     * Факт о манере работы менеджера (подпись стиля в родных единицах).
     * Попадает в объяснение отдельным предложением с разделителем
     * «Независимо от стиля» — стиль не объясняет разрыв к норме и не
     * является его причиной (документ ai/tasks/ai-analytics-manager-style.md,
     * §1.4, §2.5). Пусто — предложения нет, текст прежний.
     */
    styleNote?: string | null;
}

/**
 * Разделитель перед оценочной частью объяснения: то, что идёт после
 * него, — описание манеры, а не причина оценки. Слово «поэтому» между
 * стилем и результатом запрещено: связи «стиль → результат» на одном
 * портале нет.
 */
export const EXPLANATION_STYLE_SEPARATOR = 'Независимо от стиля' as const;

export interface CellExplanation {
    text: string;
    /**
     * Машиночитаемые опоры каждого числа текста (code=value). Формат
     * фиксирован для факт-чека и тестов; на витрине не показывается.
     */
    basis: string[];
}

/** Слова, запрещённые в объяснениях до Фазы 3 (план §4.11). */
export const EXPLANATION_FORBIDDEN_WORDS = ['значимо'] as const;

type ScoredSection = MatrixSectionAggregate & { avgScore: number };

const SECTION_TITLES: ReadonlyMap<string, string> = new Map(
    CALL_REPORT_SECTIONS.map(section => [section.code, section.title]),
);

/** Число с одной десятичной и запятой (6,4). */
const ru1 = (value: number): string => ruDecimal(value);
/** Число с одной десятичной и точкой для basis (6.4). */
const en1 = (value: number): string => value.toFixed(1);
const signed = (value: number): string =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${ru1(Math.abs(value))}`;

/** «18 разборов» / «по 11 разборам» — объём словами, без «n = …». */
const reviews = (n: number): string => ruCount(n, RU_FORMS.reviews);
const byReviews = (n: number): string =>
    `по ${ruCount(n, RU_FORMS.reviewsDative)}`;

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
            'Оценённых разделов нет: нужно не меньше ' +
                `${reviews(AI_ANALYTICS_THRESHOLDS.scoreNone)}.`,
        ];
    }
    const weak = sections[0];
    const weakText = `${sectionTitle(weak.section)} (${ru1(weak.avgScore)}, ${byReviews(weak.n)})`;
    if (sections.length === 1) {
        basis.push(`section=${weak.section}:${en1(weak.avgScore)}:n=${weak.n}`);
        return [`Единственный оценённый раздел — ${weakText}.`];
    }
    const strong = sections[sections.length - 1];
    basis.push(
        `strong=${strong.section}:${en1(strong.avgScore)}:n=${strong.n}`,
    );
    basis.push(`weak=${weak.section}:${en1(weak.avgScore)}:n=${weak.n}`);
    return [
        `Лучше всего — ${sectionTitle(strong.section)} (${ru1(strong.avgScore)}), ` +
            `слабее всего — ${weakText}.`,
    ];
}

function changeSentence(
    cell: MatrixCellCore,
    current: number,
    context: ExplanationContext,
    basis: string[],
): string {
    const previous = context.previous;
    if (previous === undefined || previous === null) {
        return 'С прошлым периодом сравнить не с чем.';
    }
    if (previous.value === null) {
        basis.push(`n_prev=${previous.n}`);
        return `За прошлый период мало данных (${reviews(previous.n)}).`;
    }
    const delta = current - previous.value;
    basis.push(`delta=${en1(delta)}`, `n_prev=${previous.n}`);
    const volumes = `${reviews(cell.n)} против ${previous.n}`;
    const sd = cell.scoreSd;
    const sdPrev = context.previousSd ?? null;
    if (sd === null || sdPrev === null || previous.n <= 0 || cell.n <= 0) {
        return `По сравнению с прошлым периодом ${signed(delta)} (${volumes}).`;
    }
    const halfWidth =
        AI_ANALYTICS_THRESHOLDS.z90 *
        Math.sqrt(sd ** 2 / cell.n + sdPrev ** 2 / previous.n);
    basis.push(`halfwidth=${en1(halfWidth)}`);
    const spread =
        Math.abs(delta) <= halfWidth
            ? 'в пределах обычного разброса'
            : 'больше обычного разброса';
    return (
        `По сравнению с прошлым периодом ${signed(delta)} (${volumes}) — ` +
        `${spread} (±${ru1(halfWidth)}).`
    );
}

/**
 * Предложение о манере с разделителем: «Независимо от стиля: …».
 * Пустая заметка — предложения нет (пустого разделителя быть не должно).
 */
export function styleNoteSentence(
    styleNote: string | null | undefined,
): string | null {
    const note = (styleNote ?? '').trim();
    if (note === '') return null;
    const text = note.endsWith('.') ? note.slice(0, -1) : note;
    return `${EXPLANATION_STYLE_SEPARATOR}: ${text}.`;
}

function adviceSentence(
    sections: readonly ScoredSection[],
    cell: MatrixCellCore,
): string {
    if (sections.length === 0) {
        return 'Совет: накопить разборы, чтобы увидеть разделы.';
    }
    const weak = sections[0];
    // Сам звонок — в evidenceCallIds (basis и ссылка витрины), в тексте id
    // не печатается: человек читает слова, а не коды.
    const where =
        cell.evidenceCallIds.worst === null
            ? 'на ближайших звонках'
            : 'на самом слабом звонке';
    return `Совет: разобрать раздел «${sectionTitle(weak.section)}» ${where}.`;
}

/**
 * Объяснение оценки ячейки по шаблону плана (§3, ТЗ FR-23) словами:
 * «Оценка 6,4 из 10 по 18 разборам. Лучше всего — приветствие (8,1),
 * слабее всего — работа по цене (4,2, по 11 разборам). По сравнению с
 * прошлым периодом −0,9 (18 разборов против 22) — в пределах обычного
 * разброса (±0,5). У команды обычно 6,8. Совет: …». Каждое число текста
 * продублировано в basis (code=value, точка как разделитель). Слово
 * «значимо» не используется. При confidence none — «мало данных: …».
 * ±интервал изменения — z90·√(σ²/n + σ′²/n′).
 */
export function renderCellExplanation(
    cell: MatrixCellCore,
    context: ExplanationContext = {},
): CellExplanation {
    if (cell.score.value === null) {
        return {
            text: `мало данных: ${reviews(cell.n)}`,
            basis: [`n=${cell.n}`],
        };
    }
    const basis: string[] = [`score=${en1(cell.score.value)}`, `n=${cell.n}`];
    const sections = scoredSections(cell);
    const sentences = [
        `Оценка ${ru1(cell.score.value)} из 10 ${byReviews(cell.n)}.`,
        ...sectionSentences(sections, basis),
        changeSentence(cell, cell.score.value, context, basis),
    ];
    if (typeof context.teamMedian === 'number') {
        basis.push(`team_median=${en1(context.teamMedian)}`);
        sentences.push(`У команды обычно ${ru1(context.teamMedian)}.`);
    }
    const styleSentence = styleNoteSentence(context.styleNote);
    if (styleSentence !== null) {
        basis.push('style=note');
        sentences.push(styleSentence);
    }
    sentences.push(adviceSentence(sections, cell));
    const { best, worst, median } = cell.evidenceCallIds;
    basis.push(
        `evidence=best:${best ?? '-'};worst:${worst ?? '-'};median:${median ?? '-'}`,
    );
    return { text: sentences.join(' '), basis };
}
