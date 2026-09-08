import {
    isMeaningfulRefusalReason,
    renderRefusalMismatchNote,
} from '../services/refusal-reason.util';

/**
 * Порог «содержательности» задан не длиной строки, а наличием смысла
 * (владелец, §3 ai/tasks/call-report-prod-fixes.md): комментарий из даты и
 * слова «отказ» — признак того, что поля НЕ заполнены.
 */
describe('isMeaningfulRefusalReason', () => {
    it('живой прод-случай «08.09 отказ» содержательным не считается', () => {
        expect(isMeaningfulRefusalReason('08.09 отказ')).toBe(false);
    });

    it('комментарий из одного слова «Отказ» — не заполнение', () => {
        expect(isMeaningfulRefusalReason('Отказ')).toBe(false);
        expect(isMeaningfulRefusalReason('отказались')).toBe(false);
        expect(isMeaningfulRefusalReason('Клиент отказался')).toBe(false);
    });

    it('пусто и мусор из дат — тоже не заполнение', () => {
        expect(isMeaningfulRefusalReason(null)).toBe(false);
        expect(isMeaningfulRefusalReason(undefined)).toBe(false);
        expect(isMeaningfulRefusalReason('   ')).toBe(false);
        expect(isMeaningfulRefusalReason('08.09.2026 — отказ, 12:30')).toBe(
            false,
        );
    });

    it('названная причина считается зафиксированной', () => {
        expect(isMeaningfulRefusalReason('Нет денег')).toBe(true);
        expect(
            isMeaningfulRefusalReason(
                'Работают с «Консультантом», договор оплачен до декабря',
            ),
        ).toBe(true);
        expect(isMeaningfulRefusalReason('Слишком дорого')).toBe(true);
    });
});

describe('renderRefusalMismatchNote', () => {
    it('называет финал сделки и подставляет услышанную AI причину', () => {
        const note = renderRefusalMismatchNote(
            'Работают с «Консультантом» до декабря',
            'Не состоялась',
        );

        expect(note).toContain('«Не состоялась»');
        expect(note).toContain('Консультантом');
    });

    it('AI причину не услышал — честно говорит об этом, а не выдумывает', () => {
        const note = renderRefusalMismatchNote(null, 'Отказ');

        expect(note).toContain('причина тоже не прозвучала');
    });
});
