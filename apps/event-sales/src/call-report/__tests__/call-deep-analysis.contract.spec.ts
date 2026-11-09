import { buildDeepAnalysisUserContent } from '../contracts/call-deep-analysis.contract';

describe('buildDeepAnalysisUserContent — user-часть глубокого разбора', () => {
    it('тип звонка — русским названием, код только как значение поля callType', () => {
        const content = buildDeepAnalysisUserContent(
            'текст',
            'presentation',
            '- паспорт',
        );
        expect(content).toContain(
            'Тип звонка по классификатору: Презентация (код для поля callType: presentation).',
        );
        // Паспорт идёт перед заданием и расшифровкой.
        expect(content.indexOf('- паспорт')).toBeLessThan(
            content.indexOf('Разбери звонок'),
        );
        expect(
            content.endsWith('Разбери звонок по расшифровке:\n\nтекст'),
        ).toBe(true);
    });

    it('без типа и паспорта — только задание и расшифровка', () => {
        expect(buildDeepAnalysisUserContent('текст', null)).toBe(
            '\nРазбери звонок по расшифровке:\n\nтекст',
        );
    });
});
