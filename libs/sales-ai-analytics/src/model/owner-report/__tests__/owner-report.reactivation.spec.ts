import {
    buildReactivationFacts,
    isReactivationCall,
    reactivationOf,
} from '../owner-report.reactivation';

describe('отчёт собственнику: источник отказа у реактивации', () => {
    it('источник — у последнего отказа; в один день финал сделки важнее записей и полей', () => {
        expect(
            reactivationOf('2026-10-20', [
                { date: '2026-06-01', kind: 'refusal' },
                { date: '2026-08-01', kind: 'refusal', source: 'history' },
            ]),
        ).toBe('history');
        expect(
            reactivationOf('2026-10-20', [
                { date: '2026-08-01', kind: 'refusal', source: 'fields' },
                { date: '2026-08-01', kind: 'refusal', source: 'stage' },
            ]),
        ).toBe('stage');
        // Свежий отказ по полям перекрывает давний финал — доработка, не возврат.
        expect(
            reactivationOf('2026-10-20', [
                { date: '2026-06-01', kind: 'refusal' },
                { date: '2026-10-10', kind: 'refusal', source: 'fields' },
            ]),
        ).toBeNull();
    });

    it('факты возвратов периода: только группа «возврат», источники считаются отдельно', () => {
        expect(
            buildReactivationFacts([
                { typeGroup: 'reactivation', reactivationSource: 'stage' },
                { typeGroup: 'reactivation', reactivationSource: null },
                { typeGroup: 'reactivation', reactivationSource: 'history' },
                { typeGroup: 'cold', reactivationSource: null },
            ]),
        ).toEqual({
            calls: 3,
            bySource: { stage: 2, history: 1, fields: 0 },
        });
    });
});

describe('отчёт собственнику: признак реактивации', () => {
    it('отказ больше 30 дней назад и без успеха после — реактивация', () => {
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2026-08-01', kind: 'refusal' },
            ]),
        ).toBe(true);
    });

    it('отказ свежее 30 дней — доработка, не реактивация', () => {
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2026-10-01', kind: 'refusal' },
            ]),
        ).toBe(false);
        // Старый отказ, но был ещё и свежий — тоже доработка.
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2026-06-01', kind: 'refusal' },
                { date: '2026-10-10', kind: 'refusal' },
            ]),
        ).toBe(false);
    });

    it('после отказа была продажа — клиент уже свой, не реактивация', () => {
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2026-05-01', kind: 'refusal' },
                { date: '2026-07-15', kind: 'won' },
            ]),
        ).toBe(false);
        // Продажа была до отказа — не мешает.
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2025-12-01', kind: 'won' },
                { date: '2026-05-01', kind: 'refusal' },
            ]),
        ).toBe(true);
    });

    it('отказов нет или отказ после звонка — не реактивация; ровно 30 дней — реактивация', () => {
        expect(isReactivationCall('2026-10-20', [])).toBe(false);
        expect(
            isReactivationCall('2026-10-20', [
                { date: '2026-10-25', kind: 'refusal' },
            ]),
        ).toBe(false);
        expect(
            isReactivationCall('2026-10-31', [
                { date: '2026-10-01', kind: 'refusal' },
            ]),
        ).toBe(true);
    });
});
