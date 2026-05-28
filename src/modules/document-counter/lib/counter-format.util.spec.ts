import {
    fallbackDocumentNumber,
    formatDocumentNumber,
} from './counter-format.util';

interface FormatPivot {
    prefix: string | null;
    postfix: string | null;
    day: boolean;
    month: boolean;
    year: boolean;
}

const basePivot: FormatPivot = {
    prefix: null,
    postfix: null,
    day: false,
    month: false,
    year: false,
};

describe('counter-format.util', () => {
    describe('formatDocumentNumber', () => {
        beforeAll(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-09T10:00:00Z'));
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        it('возвращает только число, когда нет ни префикса, ни флагов даты', () => {
            expect(formatDocumentNumber(basePivot, 42)).toBe('42');
        });

        it('добавляет префикс перед числом', () => {
            const result = formatDocumentNumber(
                { ...basePivot, prefix: 'INV' },
                7,
            );
            expect(result).toBe('INV-7');
        });

        it('добавляет постфикс в конец', () => {
            const result = formatDocumentNumber(
                { ...basePivot, postfix: '2026' },
                7,
            );
            expect(result).toBe('7-2026');
        });

        it('добавляет день, месяц и год с padStart для дня/месяца', () => {
            const result = formatDocumentNumber(
                {
                    ...basePivot,
                    prefix: 'INV',
                    day: true,
                    month: true,
                    year: true,
                },
                15,
            );
            // 2026-04-09 в UTC — в локальной таре сервера дата может отличаться,
            // но порядок частей фиксирован.
            expect(result).toMatch(/^INV-15-\d{2}-\d{2}-\d{4}$/);
        });

        it('собирает префикс + число + дату + постфикс в нужном порядке', () => {
            const result = formatDocumentNumber(
                {
                    prefix: 'A',
                    postfix: 'Z',
                    day: true,
                    month: true,
                    year: true,
                },
                1,
            );
            expect(result).toMatch(/^A-1-\d{2}-\d{2}-\d{4}-Z$/);
        });
    });

    describe('fallbackDocumentNumber', () => {
        beforeAll(() => {
            jest.useFakeTimers();
            jest.setSystemTime(new Date('2026-04-09T10:00:00Z'));
        });

        afterAll(() => {
            jest.useRealTimers();
        });

        it('возвращает строку, начинающуюся с rqId', () => {
            const result = fallbackDocumentNumber(123);
            expect(result.startsWith('123')).toBe(true);
        });

        it('содержит ровно одну "-" — разделитель между блоками', () => {
            const result = fallbackDocumentNumber(1);
            expect(result.split('-')).toHaveLength(2);
        });

        it('соответствует шаблону `${rqId}${month}-${random}${day}`', () => {
            jest.spyOn(Math, 'random').mockReturnValue(0);
            const result = fallbackDocumentNumber(5);
            expect(result).toMatch(/^5\d+-1\d+$/);
            jest.spyOn(Math, 'random').mockRestore();
        });
    });
});
