import {
    buildPartitionUnits,
    spanCompletedRange,
    monthOfDate,
    todayIso,
} from '../lib/airtime-partition.util';
import type { AirtimeSpanUnit } from '../lib/airtime-partition.util';
import type { IsoDate } from '../../shared/lib/month-segments.util';

// «Сейчас» во всех тестах: 30 июля 2026, середина дня.
const NOW = new Date(2026, 6, 30, 12, 0, 0);

describe('buildPartitionUnits', () => {
    it('полные прошлые месяцы → month-юниты', () => {
        const units = buildPartitionUnits('2026-03-01', '2026-04-30', NOW);
        expect(units).toEqual([
            { kind: 'month', month: '2026-03' },
            { kind: 'month', month: '2026-04' },
        ]);
    });

    it('частичный краевой прошлый месяц → span-юнит без сегодня', () => {
        const units = buildPartitionUnits('2026-03-15', '2026-04-30', NOW);
        expect(units).toEqual([
            {
                kind: 'span',
                month: '2026-03',
                from: '2026-03-15',
                to: '2026-03-31',
                includesToday: false,
            },
            { kind: 'month', month: '2026-04' },
        ]);
    });

    it('текущий месяц → span-юнит до сегодня включительно с includesToday', () => {
        const units = buildPartitionUnits('2026-07-01', '2026-07-31', NOW);
        expect(units).toEqual([
            {
                kind: 'span',
                month: '2026-07',
                from: '2026-07-01',
                to: '2026-07-30',
                includesToday: true,
            },
        ]);
    });

    it('прошедшие дни текущего месяца без сегодня → span-юнит без includesToday', () => {
        const units = buildPartitionUnits('2026-07-01', '2026-07-15', NOW);
        expect(units).toEqual([
            {
                kind: 'span',
                month: '2026-07',
                from: '2026-07-01',
                to: '2026-07-15',
                includesToday: false,
            },
        ]);
    });

    it('период целиком в будущем → юнитов нет (достоверные нули)', () => {
        expect(buildPartitionUnits('2026-08-01', '2026-08-31', NOW)).toEqual(
            [],
        );
    });

    it('from > to → юнитов нет', () => {
        expect(buildPartitionUnits('2026-07-10', '2026-07-01', NOW)).toEqual(
            [],
        );
    });

    it('год целиком → прошлые месяцы month-юнитами, текущий — span-юнитом', () => {
        const units = buildPartitionUnits('2026-01-01', '2026-12-31', NOW);
        const monthUnits = units.filter(u => u.kind === 'month');
        const spanUnits = units.filter(u => u.kind === 'span');
        expect(monthUnits).toHaveLength(6); // январь..июнь
        expect(spanUnits).toEqual([
            {
                kind: 'span',
                month: '2026-07',
                from: '2026-07-01',
                to: '2026-07-30',
                includesToday: true,
            },
        ]);
    });
});

describe('spanCompletedRange', () => {
    const today = todayIso(NOW);

    const span = (from: IsoDate, to: IsoDate): AirtimeSpanUnit => ({
        kind: 'span',
        month: monthOfDate(from),
        from,
        to,
        includesToday: to >= today,
    });

    it('диапазон с сегодняшним днём → завершённые дни по вчера', () => {
        expect(
            spanCompletedRange(span('2026-07-01', '2026-07-30'), today),
        ).toEqual({ from: '2026-07-01', to: '2026-07-29' });
    });

    it('диапазон только из сегодня → завершённых дней нет', () => {
        expect(
            spanCompletedRange(span('2026-07-30', '2026-07-30'), today),
        ).toBeNull();
    });

    it('полностью прошедший диапазон возвращается как есть', () => {
        expect(
            spanCompletedRange(span('2026-07-01', '2026-07-15'), today),
        ).toEqual({ from: '2026-07-01', to: '2026-07-15' });
    });
});
