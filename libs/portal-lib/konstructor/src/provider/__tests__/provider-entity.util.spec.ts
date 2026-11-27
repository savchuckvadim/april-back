import { createProviderEntityWithRqFromPrisma } from '../lib/provider-entity.util';

type AgentRow = Parameters<typeof createProviderEntityWithRqFromPrisma>[0][number];
type RqRow = Parameters<typeof createProviderEntityWithRqFromPrisma>[1];

const agent = (patch: Partial<AgentRow>): AgentRow =>
    ({
        id: BigInt(5),
        name: 'Апрель',
        code: 'april-garant.bitrix24.ru',
        withTax: false,
        rqId: null,
        ...patch,
    }) as AgentRow;

const rq = (patch: Partial<RqRow>): RqRow =>
    ({ id: BigInt(3), agentId: BigInt(5), name: 'ООО Апрель', type: 'org', ...patch }) as RqRow;

describe('createProviderEntityWithRqFromPrisma', () => {
    it('rqId — id набора реквизитов, даже когда agents.rqId пуст', () => {
        const entity = createProviderEntityWithRqFromPrisma([agent({ rqId: null })], rq({}));
        expect(entity.rqId).toBe('3');
        expect(entity.rq.id).toBe(3);
    });

    it('у поставщика с несколькими реквизитами rqId каждой записи — свой', () => {
        const agents = [agent({ rqId: BigInt(3) })];
        expect(createProviderEntityWithRqFromPrisma(agents, rq({ id: BigInt(3) })).rqId).toBe('3');
        expect(createProviderEntityWithRqFromPrisma(agents, rq({ id: BigInt(8) })).rqId).toBe('8');
    });

    it('поставщика реквизитов нет среди агентов портала — ошибка, как раньше', () => {
        expect(() => createProviderEntityWithRqFromPrisma([agent({ id: BigInt(9) })], rq({}))).toThrow();
    });
});
