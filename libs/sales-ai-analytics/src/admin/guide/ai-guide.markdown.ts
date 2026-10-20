import {
    AI_GUIDE_THEORY_HEADINGS,
    type AiGuideTheoryHeading,
} from './ai-guide.types';

/** Подраздел теории: заголовок `##` и текст до следующего `##`. */
export interface AiGuideTheoryBlock {
    heading: string;
    body: string;
}

const H2 = /^##\s+(.+?)\s*$/;
const H3_OR_DEEPER = /^###+\s/;

/**
 * Разбивает markdown теории на подразделы по заголовкам второго уровня.
 * Заголовки глубже (`###`) остаются внутри тела своего подраздела.
 * Текст до первого `##` — подраздел с пустым заголовком (преамбула).
 */
export function splitTheoryBlocks(markdown: string): AiGuideTheoryBlock[] {
    const blocks: AiGuideTheoryBlock[] = [];
    let current: AiGuideTheoryBlock = { heading: '', body: '' };
    for (const line of markdown.split('\n')) {
        const match = H2.exec(line);
        if (match && !H3_OR_DEEPER.test(line)) {
            blocks.push(current);
            current = { heading: match[1] ?? '', body: '' };
            continue;
        }
        current.body += `${line}\n`;
    }
    blocks.push(current);
    return blocks
        .map(block => ({ heading: block.heading, body: block.body.trim() }))
        .filter(block => block.heading !== '' || block.body !== '');
}

/**
 * Обязательные подразделы, которых нет или которые пусты. Пустой
 * результат — теория полная.
 */
export function missingTheoryHeadings(
    markdown: string,
): AiGuideTheoryHeading[] {
    const filled = new Set(
        splitTheoryBlocks(markdown)
            .filter(block => block.body.length > 0)
            .map(block => block.heading),
    );
    return AI_GUIDE_THEORY_HEADINGS.filter(heading => !filled.has(heading));
}
