import {
    AI_TENURE_BAND_ITEMS,
    AI_TENURE_BANDS,
    AiTenureBandCode,
    isAiTenureBand,
    levelByTenureBand,
    parseTenureGates,
    TENURE_GATES_DEFAULT,
    tenureBandOf,
    tenureMonths,
    tenureMonthsBetween,
} from '../model/tenure-bands';

describe('Полосы стажа (план 4.6)', () => {
    it('полосы объявлены в порядке возрастания стажа', () => {
        expect([...AI_TENURE_BANDS]).toEqual(['0-6', '6-18', '18+']);
        expect(isAiTenureBand('6-18')).toBe(true);
        expect(isAiTenureBand('junior')).toBe(false);
    });

    it('границы 5 / 6 / 18 месяцев', () => {
        expect(tenureBandOf(5)).toBe('0-6');
        expect(tenureBandOf(6)).toBe('6-18');
        expect(tenureBandOf(17)).toBe('6-18');
        expect(tenureBandOf(18)).toBe('18+');
    });

    it('стаж неизвестен — полосы нет (норма берётся слоем портала)', () => {
        expect(tenureBandOf(null)).toBeNull();
        expect(tenureBandOf(Number.NaN)).toBeNull();
    });

    it('границы полос переопределяются кодом реестра tenure_gates', () => {
        const gates = parseTenureGates('3/12');

        expect(gates).toEqual({ junior: 3, senior: 12 });
        expect(tenureBandOf(5, gates)).toBe('6-18');
        expect(tenureBandOf(12, gates)).toBe('18+');
    });

    it('битое значение tenure_gates — дефолт реестра, а не исключение', () => {
        expect(parseTenureGates('')).toEqual(TENURE_GATES_DEFAULT);
        expect(parseTenureGates('18/6')).toEqual(TENURE_GATES_DEFAULT);
        expect(parseTenureGates('шесть/восемнадцать')).toEqual(
            TENURE_GATES_DEFAULT,
        );
        expect(parseTenureGates(6)).toEqual(TENURE_GATES_DEFAULT);
        expect(parseTenureGates(undefined)).toEqual(TENURE_GATES_DEFAULT);
    });
});

describe('Стаж в месяцах', () => {
    it('неполный месяц не засчитывается', () => {
        expect(tenureMonthsBetween('2026-04-01', '2026-09-08')).toBe(5);
        expect(tenureMonthsBetween('2026-03-09', '2026-09-08')).toBe(5);
        expect(tenureMonthsBetween('2026-03-08', '2026-09-08')).toBe(6);
        expect(tenureMonthsBetween('2025-03-01', '2026-09-08')).toBe(18);
    });

    it('нет даты, битая дата и дата в будущем — стаж неизвестен', () => {
        expect(tenureMonthsBetween(null, '2026-09-08')).toBeNull();
        expect(tenureMonthsBetween('01.04.2026', '2026-09-08')).toBeNull();
        expect(tenureMonthsBetween('2026-12-01', '2026-09-08')).toBeNull();
    });

    it('день выхода — стаж 0 месяцев, а не null', () => {
        expect(tenureMonthsBetween('2026-09-08', '2026-09-08')).toBe(0);
    });
});

describe('Контракт плана Фазы 2 (поток p2-model-norms)', () => {
    it('AI_TENURE_BAND_ITEMS — те же коды в том же порядке, что AI_TENURE_BANDS', () => {
        expect(AI_TENURE_BAND_ITEMS.map(item => item.code)).toEqual([
            ...AI_TENURE_BANDS,
        ]);
        AI_TENURE_BAND_ITEMS.forEach(item =>
            expect(isAiTenureBand(item.code)).toBe(true),
        );
    });

    it('tenureMonths — тот же расчёт, что tenureMonthsBetween', () => {
        expect(tenureMonths).toBe(tenureMonthsBetween);
        expect(tenureMonths('2026-04-01', '2026-09-08')).toBe(5);
        expect(tenureMonths(null, '2026-09-08')).toBeNull();
    });

    it('tenureBandOf возвращает код полосы контракта', () => {
        const band: AiTenureBandCode | null = tenureBandOf(7, {
            junior: 6,
            senior: 18,
        });

        expect(band).toBe(AI_TENURE_BAND_ITEMS[1].code);
    });
});

describe('Подсказка уровня по полосе стажа', () => {
    it('0-6 → junior, 6-18 → middle, 18+ → senior, нет полосы → middle', () => {
        expect(levelByTenureBand('0-6')).toBe('junior');
        expect(levelByTenureBand('6-18')).toBe('middle');
        expect(levelByTenureBand('18+')).toBe('senior');
        expect(levelByTenureBand(null)).toBe('middle');
    });
});
