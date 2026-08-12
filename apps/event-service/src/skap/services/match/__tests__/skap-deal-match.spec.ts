import {
    SkapDealCandidate,
    SkapDealMatchService,
} from '../skap-deal-match.service';

describe('SkapDealMatchService.pickDeal (чистая логика выбора)', () => {
    // pickDeal не трогает bitrix/portalModel — заглушки достаточны.
    const service = new SkapDealMatchService(null as never, null as never);
    const august = new Date(2024, 7, 1);

    const deal = (
        id: number,
        opts: Partial<SkapDealCandidate> = {},
    ): SkapDealCandidate => ({
        id,
        closed: false,
        contractStart: null,
        contractEnd: null,
        complectIds: [],
        ...opts,
    });

    it('период + комплект — идеальный матч без ворнинга', () => {
        const pick = service.pickDeal(
            [
                deal(1, {
                    contractStart: new Date(2024, 0, 1),
                    contractEnd: new Date(2024, 11, 31),
                    complectIds: ['999'],
                }),
                deal(2, {
                    contractStart: new Date(2024, 0, 1),
                    contractEnd: new Date(2024, 11, 31),
                    complectIds: ['361'],
                }),
            ],
            august,
            '361',
        );
        expect(pick.dealId).toBe(2);
        expect(pick.warning).toBeNull();
    });

    it('один комплект в двух сделках на разные периоды — период отделяет', () => {
        const pick = service.pickDeal(
            [
                // старый договор того же комплекта (закончился до августа)
                deal(1, {
                    contractStart: new Date(2023, 0, 1),
                    contractEnd: new Date(2023, 11, 31),
                    complectIds: ['361'],
                }),
                // действующий договор того же комплекта
                deal(2, {
                    contractStart: new Date(2024, 0, 1),
                    contractEnd: new Date(2024, 11, 31),
                    complectIds: ['361'],
                }),
            ],
            august,
            '361',
        );
        expect(pick.dealId).toBe(2);
        expect(pick.warning).toBeNull();
    });

    it('период покрыт, комплект не совпал — берётся по периоду', () => {
        const pick = service.pickDeal(
            [
                deal(5, {
                    contractStart: new Date(2024, 6, 1),
                    contractEnd: new Date(2024, 8, 30),
                    complectIds: ['777'],
                }),
            ],
            august,
            '361',
        );
        expect(pick.dealId).toBe(5);
        expect(pick.warning).toBeNull();
    });

    it('период не покрыт — спор решает комплект АРМ (с ворнингом)', () => {
        const pick = service.pickDeal(
            [
                deal(3, { complectIds: ['361'] }),
                deal(4, { complectIds: ['777'] }),
            ],
            august,
            '361',
        );
        expect(pick.dealId).toBe(3);
        expect(pick.warning).toContain('комплект');
    });

    it('ни периода, ни комплекта — свежая открытая с ворнингом', () => {
        const pick = service.pickDeal(
            [deal(7, { closed: true }), deal(8), deal(9)],
            august,
            '361',
        );
        expect(pick.dealId).toBe(9);
        expect(pick.warning).toContain('deal_period_mismatch');
    });

    it('все закрыты — последняя с ворнингом; нет сделок — null', () => {
        const pick = service.pickDeal(
            [deal(1, { closed: true }), deal(2, { closed: true })],
            august,
        );
        expect(pick.dealId).toBe(2);
        expect(pick.warning).toContain('закрыты');
        expect(service.pickDeal([], august)).toEqual({
            dealId: null,
            warning: null,
        });
        expect(service.pickDeal(undefined, august)).toEqual({
            dealId: null,
            warning: null,
        });
    });
});
