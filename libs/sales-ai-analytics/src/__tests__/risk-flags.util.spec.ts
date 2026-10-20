import {
    isActiveRiskFlag,
    isRetiredRiskFlag,
    provenRiskFlagCodes,
    provenRiskFlags,
} from '../model/risk-flags.util';

/**
 * Этап 2 плана 2026-10-19-ai-focus-plan: сигнал риска — только действующий
 * флаг с цитатой; отменённые коды и флаги без доказательства — не сигнал.
 */
describe('risk-flags.util', () => {
    it('действующие и отменённые коды различаются, чужой код — ни то ни другое', () => {
        expect(isActiveRiskFlag('conflict')).toBe(true);
        expect(isActiveRiskFlag('compliance')).toBe(true);
        expect(isActiveRiskFlag('door_closed')).toBe(true);
        expect(isActiveRiskFlag('promise')).toBe(false);
        expect(isActiveRiskFlag('client_negative')).toBe(false);
        expect(isActiveRiskFlag('urgent')).toBe(false);
        expect(isActiveRiskFlag(null)).toBe(false);

        expect(isRetiredRiskFlag('promise')).toBe(true);
        expect(isRetiredRiskFlag('client_negative')).toBe(true);
        expect(isRetiredRiskFlag('conflict')).toBe(false);
        expect(isRetiredRiskFlag(undefined)).toBe(false);
    });

    it('доказанные флаги: по одному на флаг с первой непустой цитатой, порядок справочника', () => {
        expect(
            provenRiskFlags(
                ['door_closed', 'conflict', 'conflict'],
                [
                    { flag: 'door_closed', quote: '  ' },
                    { flag: 'door_closed', quote: 'Ладно, до свидания' },
                    { flag: 'conflict', quote: 'Вы меня не слушаете' },
                    { flag: 'conflict', quote: 'Вторая цитата' },
                ],
            ),
        ).toEqual([
            { flag: 'conflict', quote: 'Вы меня не слушаете' },
            { flag: 'door_closed', quote: 'Ладно, до свидания' },
        ]);
    });

    it('отменённый флаг с цитатой и действующий без цитаты — не сигнал', () => {
        expect(
            provenRiskFlags(
                ['promise', 'client_negative', 'compliance'],
                [
                    { flag: 'promise', quote: 'Завтра всё сделаем' },
                    { flag: 'client_negative', quote: 'Не звоните' },
                    { flag: 'compliance', quote: null },
                ],
            ),
        ).toEqual([]);
        // Доказательство без флага в riskFlags тоже не считается.
        expect(
            provenRiskFlags([], [{ flag: 'conflict', quote: 'цитата' }]),
        ).toEqual([]);
        expect(provenRiskFlagCodes(['conflict'], undefined)).toEqual([]);
        expect(provenRiskFlagCodes(null, null)).toEqual([]);
    });
});
