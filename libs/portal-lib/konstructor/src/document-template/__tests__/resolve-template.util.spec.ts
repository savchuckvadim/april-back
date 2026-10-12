import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    TemplateCandidate,
    TemplateCriteria,
} from '../document-template.criteria';
import { isEligible, rankTemplates } from '../lib/resolve-template.util';

const PORTAL = 10n;
const OTHER_PORTAL = 20n;
const AGENT = 100n;
const OTHER_AGENT = 200n;

const candidate = (
    over: Partial<TemplateCandidate> & { id: string },
): TemplateCandidate => ({
    filePath: 'konstructor/templates/any.docx',
    portalId: null,
    agentId: null,
    contractType: null,
    clientTypes: null,
    supplyTypes: null,
    isDefault: false,
    updatedAt: null,
    createdAt: null,
    ...over,
});

const criteria = (over: Partial<TemplateCriteria> = {}): TemplateCriteria => ({
    portalId: PORTAL,
    agentId: AGENT,
    clientType: ClientTypeEnum.ORG,
    supplyType: SupplyTypeEnum.INTERNET,
    ...over,
});

describe('isEligible — жёсткие отсечки', () => {
    it('шаблон чужого портала не участвует', () => {
        expect(
            isEligible(
                candidate({ id: '1', portalId: OTHER_PORTAL }),
                criteria(),
            ),
        ).toBe(false);
    });

    it('шаблон чужого поставщика не участвует', () => {
        expect(
            isEligible(
                candidate({ id: '1', agentId: OTHER_AGENT }),
                criteria(),
            ),
        ).toBe(false);
    });

    it('общий шаблон (portal NULL, agent NULL) подходит всегда', () => {
        expect(isEligible(candidate({ id: '1' }), criteria())).toBe(true);
    });

    it('шаблон под другой тип клиента не участвует', () => {
        expect(
            isEligible(
                candidate({ id: '1', clientTypes: [ClientTypeEnum.FIZ] }),
                criteria({ clientType: ClientTypeEnum.ORG }),
            ),
        ).toBe(false);
    });

    it('шаблон под другой тип поставки не участвует', () => {
        expect(
            isEligible(
                candidate({ id: '1', supplyTypes: [SupplyTypeEnum.PROXIMA] }),
                criteria({ supplyType: SupplyTypeEnum.INTERNET }),
            ),
        ).toBe(false);
    });

    it('портальный шаблон не подходит, когда портал не определён', () => {
        expect(
            isEligible(
                candidate({ id: '1', portalId: PORTAL }),
                criteria({ portalId: null }),
            ),
        ).toBe(false);
    });
});

describe('rankTemplates — приоритет разрядов', () => {
    it('точный поставщик важнее портального универсального', () => {
        const portalWide = candidate({ id: 'a', portalId: PORTAL });
        const byAgent = candidate({
            id: 'b',
            portalId: PORTAL,
            agentId: AGENT,
        });

        const { winner } = rankTemplates([portalWide, byAgent], criteria());
        expect(winner?.candidate.id).toBe('b');
    });

    it('портальный важнее общего', () => {
        const common = candidate({ id: 'a' });
        const portalWide = candidate({ id: 'b', portalId: PORTAL });

        const { winner } = rankTemplates([common, portalWide], criteria());
        expect(winner?.candidate.id).toBe('b');
    });

    it('КЛЮЧЕВОЕ: поставщик побеждает даже против кучи слабых совпадений — сумма весов тут давала бы ошибку', () => {
        // Универсальный портальный шаблон, у которого совпали И тип поставки,
        // И тип клиента, И стоит is_default. При аддитивных весах (8/4/2/1)
        // он обошёл бы шаблон поставщика. При лексикографическом сравнении —
        // нет: разряд agentExact старше всех последующих.
        const loaded = candidate({
            id: 'a',
            portalId: PORTAL,
            supplyTypes: [SupplyTypeEnum.INTERNET],
            clientTypes: [ClientTypeEnum.ORG],
            isDefault: true,
        });
        const byAgent = candidate({
            id: 'b',
            portalId: PORTAL,
            agentId: AGENT,
        });

        const { winner } = rankTemplates([loaded, byAgent], criteria());
        expect(winner?.candidate.id).toBe('b');
    });

    it('тип поставки важнее типа клиента', () => {
        const bySupply = candidate({
            id: 'a',
            portalId: PORTAL,
            supplyTypes: [SupplyTypeEnum.INTERNET],
        });
        const byClient = candidate({
            id: 'b',
            portalId: PORTAL,
            clientTypes: [ClientTypeEnum.ORG],
        });

        const { winner } = rankTemplates([byClient, bySupply], criteria());
        expect(winner?.candidate.id).toBe('a');
    });

    it('явный тип клиента важнее универсального', () => {
        const universal = candidate({ id: 'a', portalId: PORTAL });
        const byClient = candidate({
            id: 'b',
            portalId: PORTAL,
            clientTypes: [ClientTypeEnum.ORG],
        });

        const { winner } = rankTemplates([universal, byClient], criteria());
        expect(winner?.candidate.id).toBe('b');
    });

    it('is_default решает только при прочих равных', () => {
        const plain = candidate({ id: 'a', portalId: PORTAL });
        const def = candidate({ id: 'b', portalId: PORTAL, isDefault: true });

        const { winner } = rankTemplates([plain, def], criteria());
        expect(winner?.candidate.id).toBe('b');
    });

    it('свежесть решает после is_default', () => {
        const old = candidate({
            id: 'a',
            portalId: PORTAL,
            updatedAt: new Date('2026-01-01'),
        });
        const fresh = candidate({
            id: 'b',
            portalId: PORTAL,
            updatedAt: new Date('2026-06-01'),
        });

        const { winner } = rankTemplates([old, fresh], criteria());
        expect(winner?.candidate.id).toBe('b');
    });
});

describe('rankTemplates — вырожденные случаи', () => {
    it('пустой список кандидатов — null, без исключения', () => {
        expect(rankTemplates([], criteria()).winner).toBeNull();
    });

    it('все кандидаты отсеяны жёсткими условиями — null', () => {
        const foreign = candidate({ id: 'a', portalId: OTHER_PORTAL });
        expect(rankTemplates([foreign], criteria()).winner).toBeNull();
    });

    it('полная ничья разрешается детерминированно по id и помечается ambiguous', () => {
        const first = candidate({ id: 'b', portalId: PORTAL });
        const second = candidate({ id: 'a', portalId: PORTAL });

        const run1 = rankTemplates([first, second], criteria());
        const run2 = rankTemplates([second, first], criteria());

        expect(run1.ambiguous).toBe(true);
        expect(run1.winner?.candidate.id).toBe('a');
        // порядок на входе не влияет на победителя
        expect(run2.winner?.candidate.id).toBe('a');
    });

    it('не помечает ambiguous, когда кортежи различаются', () => {
        const weak = candidate({ id: 'a', portalId: PORTAL });
        const strong = candidate({ id: 'b', portalId: PORTAL, agentId: AGENT });

        expect(rankTemplates([weak, strong], criteria()).ambiguous).toBe(false);
    });

    it('поставщик не выбран (agentId null): берётся шаблон без поставщика, чужой НЕ берётся', () => {
        const byAgent = candidate({
            id: 'a',
            portalId: PORTAL,
            agentId: AGENT,
        });
        const noAgent = candidate({ id: 'b', portalId: PORTAL });

        const { winner, ranked } = rankTemplates(
            [byAgent, noAgent],
            criteria({ agentId: null }),
        );

        expect(winner?.candidate.id).toBe('b');
        expect(ranked).toHaveLength(1);
    });

    it('reason объясняет выбор', () => {
        const byAgent = candidate({
            id: 'a',
            portalId: PORTAL,
            agentId: AGENT,
            contractType: 'lic',
            supplyTypes: [SupplyTypeEnum.INTERNET],
        });

        const { winner } = rankTemplates([byAgent], criteria());
        expect(winner?.reason).toContain('портал');
        expect(winner?.reason).toContain('поставщик');
        expect(winner?.reason).toContain('lic');
    });
});

describe('rankTemplates — матрица портал × поставщик', () => {
    // 4 комбинации присутствия признаков: каждая должна выбрать
    // самый специфичный доступный шаблон.
    const common = candidate({ id: 'common' });
    const portalWide = candidate({ id: 'portal', portalId: PORTAL });
    const agentOnly = candidate({ id: 'agent', agentId: AGENT });
    const both = candidate({ id: 'both', portalId: PORTAL, agentId: AGENT });
    const all = [common, portalWide, agentOnly, both];

    it.each([
        ['всё доступно', all, 'both'],
        ['без точного совпадения', [common, portalWide, agentOnly], 'portal'],
        ['только общий и по поставщику', [common, agentOnly], 'agent'],
        ['только общий', [common], 'common'],
    ])('%s → %s', (_name, pool, expected) => {
        const { winner } = rankTemplates(pool, criteria());
        expect(winner?.candidate.id).toBe(expected);
    });
});
