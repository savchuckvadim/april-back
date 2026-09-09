import {
    detectPortalEvents,
    mergePortalEvents,
    PORTAL_EVENT_DEFAULTS,
} from '../model/portal-events';
import type { AiPortalEvent } from '../settings/ai-settings.types';

/**
 * Автособытия журнала портала (план Фазы 2, P2-28). Проверяется главное:
 * событие появляется только при РЕАЛЬНОМ расхождении двух известных
 * значений, несёт дату и не дублируется при повторном пересчёте.
 */
const WINDOW = { from: '2026-09-01', to: '2026-09-30' } as const;

describe('detectPortalEvents', () => {
    it('смена версии рубрики даёт событие rubric_change с датой', () => {
        const events = detectPortalEvents({
            ...WINDOW,
            previousRubricVersion: 'sections-7-v1',
            rubricVersion: 'sections-8-v2',
        });

        expect(events).toEqual([
            {
                date: WINDOW.to,
                kind: 'rubric_change',
                note: 'Версия рубрики: sections-7-v1 → sections-8-v2',
                source: 'auto',
            },
        ]);
    });

    it('дата события берётся из самой версии, когда она там есть', () => {
        const events = detectPortalEvents({
            ...WINDOW,
            previousRubricVersion: 'focus-v2.0-2026-06-01',
            rubricVersion: 'focus-v2.1-2026-09-05',
        });

        expect(events[0].date).toBe('2026-09-05');
    });

    it('та же версия рубрики события не создаёт', () => {
        expect(
            detectPortalEvents({
                ...WINDOW,
                previousRubricVersion: 'sections-7-v1',
                rubricVersion: 'sections-7-v1',
            }),
        ).toEqual([]);
    });

    it('первый пересчёт (прошлой версии нет) события не создаёт', () => {
        expect(
            detectPortalEvents({
                ...WINDOW,
                previousRubricVersion: null,
                rubricVersion: 'sections-7-v1',
                previousScriptHash: null,
                scriptHash: 'abc',
                previousPriceMedian: null,
                priceMedian: 120_000,
            }),
        ).toEqual([]);
    });

    it('новичок реестра: дата стажа внутри окна даёт new_hire', () => {
        const events = detectPortalEvents({
            ...WINDOW,
            roster: [
                { managerId: '11', since: '2026-09-10' },
                { managerId: '12', since: '2025-01-09' },
                { managerId: '13', since: null },
            ],
        });

        expect(events).toEqual([
            {
                date: '2026-09-10',
                kind: 'new_hire',
                note: 'Новый менеджер: 11',
                source: 'auto',
            },
        ]);
    });

    it('смена методички ловится по хэшу', () => {
        const events = detectPortalEvents({
            ...WINDOW,
            previousScriptHash: 'h1',
            scriptHash: 'h2',
        });

        expect(events.map(event => event.kind)).toEqual(['script_change']);
        expect(events[0].date).toBe(WINDOW.to);
    });

    it('сдвиг медианы цены: ниже порога молчит, выше — событие', () => {
        const small = detectPortalEvents({
            ...WINDOW,
            previousPriceMedian: 100_000,
            priceMedian: 105_000,
        });
        const big = detectPortalEvents({
            ...WINDOW,
            previousPriceMedian: 100_000,
            priceMedian: 120_000,
        });

        expect(PORTAL_EVENT_DEFAULTS.priceShiftPct).toBe(10);
        expect(small).toEqual([]);
        expect(big.map(event => event.kind)).toEqual(['price_change']);
        expect(big[0].note).toContain('+20');
    });

    it('повторный пересчёт не дублирует уже записанное событие', () => {
        const known: AiPortalEvent[] = [
            {
                date: WINDOW.to,
                kind: 'rubric_change',
                note: 'Версия рубрики: sections-7-v1 → sections-8-v2',
                source: 'auto',
            },
        ];

        expect(
            detectPortalEvents({
                ...WINDOW,
                previousRubricVersion: 'sections-7-v1',
                rubricVersion: 'sections-8-v2',
                known,
            }),
        ).toEqual([]);
    });

    it('события выдаются по возрастанию даты и по порядку видов', () => {
        const events = detectPortalEvents({
            ...WINDOW,
            roster: [{ managerId: '11', since: '2026-09-10' }],
            previousRubricVersion: 'r1',
            rubricVersion: 'r2',
            previousScriptHash: 'h1',
            scriptHash: 'h2',
            previousPriceMedian: 100,
            priceMedian: 200,
        });

        expect(events.map(event => event.kind)).toEqual([
            'new_hire',
            'rubric_change',
            'script_change',
            'price_change',
        ]);
    });
});

describe('mergePortalEvents', () => {
    it('ручные отметки сохраняются, новые встают по дате', () => {
        const known: AiPortalEvent[] = [
            {
                date: '2026-09-05',
                kind: 'manual',
                note: 'Переезд офиса',
                source: 'manual',
            },
        ];
        const detected = detectPortalEvents({
            ...WINDOW,
            roster: [{ managerId: '11', since: '2026-09-01' }],
        });

        expect(
            mergePortalEvents(known, detected).map(item => item.kind),
        ).toEqual(['new_hire', 'manual']);
    });
});
