import {
    countDistinctClients,
    guardEmailDomain,
} from '../lib/repeat-domain-guard';

const ref = (companyId: number | null, inns: string[] = []) => ({
    companyId,
    inns,
});

describe('repeat-domain-guard', () => {
    it('клиенты: компания или общий ИНН — один; без компании и ИНН — не считаются', () => {
        expect(
            countDistinctClients([
                ref(1),
                ref(1, ['77']),
                ref(2, ['77']),
                ref(null),
                ref(null, []),
            ]),
        ).toBe(1);
        expect(countDistinctClients([ref(1), ref(2)])).toBe(2);
        expect(countDistinctClients([ref(null, ['5']), ref(null, ['6'])])).toBe(
            2,
        );
        expect(countDistinctClients([])).toBe(0);
    });

    it('ИНН заявки совпал хотя бы с одним ИНН сделки — сделка остаётся', () => {
        const res = guardEmailDomain([ref(1, ['10', '20'])], [], ['20']);
        expect(res).toEqual({ deals: [ref(1, ['10', '20'])], skipped: null });
    });

    it('у заявки нет ИНН или у сделки нет ИНН — конфликта нет', () => {
        expect(guardEmailDomain([ref(1, ['10'])], [], []).skipped).toBeNull();
        expect(guardEmailDomain([ref(1, [])], [], ['20']).skipped).toBeNull();
    });

    it('часть сделок с чужим ИНН — отбрасываются, остальные остаются', () => {
        const res = guardEmailDomain(
            [ref(1, ['10']), ref(1, ['20'])],
            [],
            ['20'],
        );
        expect(res.skipped).toBeNull();
        expect(res.deals).toEqual([ref(1, ['20'])]);
    });
});
