/**
 * Разметка текста письма из старой версии: `<color>…</color>` — акцентный
 * цвет, `<bold>…</bold>` — жирный, `<red>…</red>` — красный. Переводы строк
 * — `\n` (в т. ч. записанные литералом «\\n», как хранили в БД).
 */
export interface RichTextRun {
    text: string;
    color: boolean;
    bold: boolean;
    red: boolean;
}

type RichTextFlag = Exclude<keyof RichTextRun, 'text'>;

const TAG_SPLIT = /(<\/?(?:color|bold|red)>)/;
const TAG_MATCH = /^<(\/?)(color|bold|red)>$/;

export const parseRichText = (source: string): RichTextRun[] => {
    const text = source.replace(/\\n/g, '\n');
    const state: Record<RichTextFlag, boolean> = {
        color: false,
        bold: false,
        red: false,
    };
    const runs: RichTextRun[] = [];
    for (const part of text.split(TAG_SPLIT)) {
        if (!part) continue;
        const tag = TAG_MATCH.exec(part);
        if (tag) {
            state[tag[2] as RichTextFlag] = tag[1] !== '/';
            continue;
        }
        runs.push({ text: part, ...state });
    }
    return runs;
};

/**
 * Абзацы по переводам строк. Пустые строки между абзацами не создают
 * пустых абзацев — отступ между абзацами задаёт шаблон.
 */
export const splitRichTextParagraphs = (
    runs: RichTextRun[],
): RichTextRun[][] => {
    const paragraphs: RichTextRun[][] = [];
    let current: RichTextRun[] = [];
    const flush = (): void => {
        if (current.some(run => run.text.trim().length > 0)) {
            paragraphs.push(current);
        }
        current = [];
    };
    for (const run of runs) {
        const lines = run.text.split('\n');
        lines.forEach((line, index) => {
            if (index > 0) flush();
            if (line.length > 0) current.push({ ...run, text: line });
        });
    }
    flush();
    return paragraphs;
};

export const parseRichTextParagraphs = (source: string): RichTextRun[][] =>
    splitRichTextParagraphs(parseRichText(source));
