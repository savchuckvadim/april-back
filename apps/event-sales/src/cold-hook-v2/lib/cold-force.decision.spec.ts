import { EnumColdCallForce } from '../dto/cold.dto';
import { decideColdStart } from './cold-force.decision';

/**
 * Таблица решений по `force` (владелец 02.09.2026): Y — забираем всегда;
 * N — уступаем только чужой ОТКРЫТОЙ основной сделке, своя вторая и
 * входная не мешают.
 */
const deal = (ID: string, ASSIGNED_BY_ID: string, CLOSED = 'N') => ({
    ID,
    ASSIGNED_BY_ID,
    CLOSED,
});

const decide = (
    force: EnumColdCallForce,
    openBaseDeals: ReturnType<typeof deal>[],
    entryDealId: number | null = 500,
) =>
    decideColdStart({
        force,
        responsibleId: 447,
        entryDealId,
        openBaseDeals: openBaseDeals as never,
    });

describe('decideColdStart', () => {
    it('force=Y — забираем даже при чужой открытой основной; у кого — в foreign', () => {
        const decision = decide(EnumColdCallForce.Y, [deal('700', '448')]);
        expect(decision.mode).toBe('proceed');
        expect(decision.foreign).toEqual([{ dealId: 700, responsibleId: 448 }]);
        expect(decision.reason).toContain('забираем клиента у сотрудника #448');
    });

    it('force=Y без чужой работы — foreign пуст', () => {
        expect(decide(EnumColdCallForce.Y, [deal('700', '447')]).foreign).toEqual([]);
    });

    it('force=N, других основных нет — полный старт', () => {
        expect(decide(EnumColdCallForce.N, []).mode).toBe('proceed');
    });

    it('force=N, вторая основная своя — не мешает', () => {
        expect(
            decide(EnumColdCallForce.N, [deal('700', '447')]).mode,
        ).toBe('proceed');
    });

    it('force=N, входная сделка — чужая основная: забираем, режим не меняется, владельцу — takenEntry', () => {
        const decision = decide(EnumColdCallForce.N, [deal('500', '448')], 500);
        expect(decision.mode).toBe('proceed');
        expect(decision.foreign).toEqual([]);
        expect(decision.takenEntry).toEqual({ dealId: 500, responsibleId: 448 });
    });

    it('входная своя или вход-компания — takenEntry пуст', () => {
        expect(decide(EnumColdCallForce.N, [deal('500', '447')], 500).takenEntry).toBeNull();
        expect(decide(EnumColdCallForce.N, [deal('700', '448')], null).takenEntry).toBeNull();
    });

    it('force=N, открытая основная другого сотрудника — уступаем с адресатом', () => {
        const decision = decide(EnumColdCallForce.N, [deal('700', '448')]);
        expect(decision.mode).toBe('yield');
        expect(decision.foreign).toEqual([{ dealId: 700, responsibleId: 448 }]);
        expect(decision.reason).toContain('#448');
        expect(decision.reason).toContain('#700');
    });

    it('закрытая чужая основная и сделка без ответственного не считаются', () => {
        expect(
            decide(EnumColdCallForce.N, [
                deal('700', '448', 'Y'),
                deal('710', '0'),
                deal('720', ''),
            ]).mode,
        ).toBe('proceed');
    });

    it('несколько чужих — все в списке, свежие первыми', () => {
        const decision = decide(EnumColdCallForce.N, [
            deal('700', '448'),
            deal('900', '449'),
            deal('800', '448'),
        ]);
        expect(decision.foreign.map(f => f.dealId)).toEqual([900, 800, 700]);
        expect(decision.reason).toContain('#449');
    });

    it('вход-компания: исключать нечего, чужая основная — уступаем', () => {
        expect(
            decide(EnumColdCallForce.N, [deal('700', '448')], null).mode,
        ).toBe('yield');
    });
});
