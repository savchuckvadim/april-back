import {
    parseRichText,
    parseRichTextParagraphs,
} from '../templates/shared/rich-text';

describe('разметка текста письма', () => {
    it('теги color/bold/red дают отдельные фрагменты с флагами', () => {
        const runs = parseRichText(
            'Обычный <color>акцент</color> и <bold>жирный</bold>',
        );
        expect(runs).toEqual([
            { text: 'Обычный ', color: false, bold: false, red: false },
            { text: 'акцент', color: true, bold: false, red: false },
            { text: ' и ', color: false, bold: false, red: false },
            { text: 'жирный', color: false, bold: true, red: false },
        ]);
    });

    it('вложенные теги складываются', () => {
        const runs = parseRichText('<red><bold>важно</bold></red>');
        expect(runs).toEqual([
            { text: 'важно', color: false, bold: true, red: true },
        ]);
    });

    it('незакрытый тег действует до конца текста', () => {
        const runs = parseRichText('<color>всё акцентом');
        expect(runs).toEqual([
            { text: 'всё акцентом', color: true, bold: false, red: false },
        ]);
    });

    it('абзацы по переводу строки, в том числе записанному литералом «\\n»', () => {
        const paragraphs = parseRichTextParagraphs(
            'Первый\\nВторой <bold>с\nпереносом</bold>\n\nТретий',
        );
        expect(
            paragraphs.map(runs => runs.map(run => run.text).join('')),
        ).toEqual(['Первый', 'Второй с', 'переносом', 'Третий']);
        expect(paragraphs[2][0].bold).toBe(true);
    });

    it('пустой текст — ни одного абзаца', () => {
        expect(parseRichTextParagraphs('')).toEqual([]);
        expect(parseRichTextParagraphs('\n \n')).toEqual([]);
    });
});
