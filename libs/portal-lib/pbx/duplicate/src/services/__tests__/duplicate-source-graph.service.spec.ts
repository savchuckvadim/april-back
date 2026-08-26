import { DuplicateSourceGraphService } from '../duplicate-source-graph.service';
import {
    DuplicateEntityType,
    SOURCE_GRAPH_LIMITS_DEEP,
    SOURCE_GRAPH_LIMITS_FAST,
} from '../../type/duplicate.type';

/**
 * Фейковый bitrix: копит команды, отдаёт сценарные ответы на каждый
 * callBatchAsync и считает round-trip'ы — стоимость проверяется тестом.
 */
const makeBitrix = (waves: Record<string, unknown>[]) => {
    let pending: Record<string, { method: string; params: unknown }> = {};
    const sentWaves: Record<string, { method: string; params: unknown }>[] = [];
    let waveIndex = 0;

    const addCmd = (cmd: string, method: string, params: unknown) => {
        pending[cmd] = { method, params };
    };
    const bitrix = {
        api: {
            addCmdBatch: jest.fn(addCmd),
            callBatchAsync: jest.fn(() => {
                sentWaves.push(pending);
                pending = {};
                const result = waves[waveIndex] ?? {};
                waveIndex += 1;
                return Promise.resolve([{ result }]);
            }),
        },
        batch: {
            requisite: {
                getList: jest.fn(
                    (cmd: string, filter: unknown, select: unknown) =>
                        addCmd(cmd, 'crm.requisite.list', { filter, select }),
                ),
            },
        },
    };
    return { bitrix, sentWaves };
};

const LEAD_ROOT = { entityType: DuplicateEntityType.LEAD, id: 42 };

describe('DuplicateSourceGraphService', () => {
    const service = new DuplicateSourceGraphService();

    it('FAST: 2 волны = ровно 2 HTTP-запроса, независимо от числа узлов', async () => {
        const { bitrix } = makeBitrix([
            {
                LEAD_42: {
                    ID: '42',
                    COMPANY_ID: '7',
                    CONTACT_ID: '3',
                    CONTACT_IDS: ['3', '4'],
                },
            },
            {
                COMPANY_7: { ID: '7', TITLE: 'Ромашка' },
                CONTACT_3: { ID: '3', COMPANY_ID: '7' },
                CONTACT_4: { ID: '4' },
            },
        ]);

        const result = await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [5],
        );

        expect(result.httpRequests).toBe(2);
        expect(bitrix.api.callBatchAsync).toHaveBeenCalledTimes(2);
        expect(result.nodes.map(n => `${n.entityType}_${n.id}`)).toEqual(
            expect.arrayContaining([
                'LEAD_42',
                'COMPANY_7',
                'CONTACT_3',
                'CONTACT_4',
            ]),
        );
    });

    it('ВЕСЬ граф попадает в excluded — включая зеркальные сделки', async () => {
        const { bitrix } = makeBitrix([
            { LEAD_42: { ID: '42', COMPANY_ID: '7' } },
            {
                COMPANY_7: { ID: '7' },
                mirror_COMPANY_ID_1: [{ ID: '900', COMPANY_ID: '7' }],
            },
        ]);

        const result = await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [5],
        );

        const keys = result.excluded.map(ref => `${ref.entityType}_${ref.id}`);
        expect(keys).toEqual(
            expect.arrayContaining(['LEAD_42', 'COMPANY_7', 'DEAL_900']),
        );
    });

    /*
     * Кейс владельца (22.08, сделка 25329): у компании-источника строка
     * компании не несёт id её контактов, и без отдельной list-команды они
     * не попадали в граф — а значит и в excluded. Поиск находил их по их же
     * телефонам/почтам и показывал «дублями» собственной компании.
     */
    it('контакты компании-источника читаются и уходят в excluded', async () => {
        const { bitrix, sentWaves } = makeBitrix([
            {
                COMPANY_7: { ID: '7', TITLE: 'Ромашка' },
                company_contacts_0: [
                    { ID: '31', COMPANY_ID: '7' },
                    { ID: '32', COMPANY_ID: '7' },
                ],
            },
            {},
        ]);

        const result = await service.collect(
            bitrix as never,
            { entityType: DuplicateEntityType.COMPANY, id: 7 },
            SOURCE_GRAPH_LIMITS_FAST,
            [5],
        );

        const listCmd = sentWaves[0]['company_contacts_0'];
        expect(listCmd.method).toBe('crm.contact.list');
        expect(
            (listCmd.params as { filter: { COMPANY_ID: number[] } }).filter
                .COMPANY_ID,
        ).toEqual([7]);

        const keys = result.excluded.map(ref => `${ref.entityType}_${ref.id}`);
        expect(keys).toEqual(
            expect.arrayContaining(['COMPANY_7', 'CONTACT_31', 'CONTACT_32']),
        );
    });

    /*
     * Лид, из которого выросла сделка, — часть ТОЙ ЖЕ работы, а не другая
     * запись о клиенте. Без ребра «сделка → её лиды» он не попадал в
     * excluded и показывался менеджеру как дубль самого себя.
     */
    it('сделка-источник тянет свои лиды: LEAD_ID и наши поля графа', async () => {
        const { bitrix } = makeBitrix([
            {
                DEAL_500: {
                    ID: '500',
                    LEAD_ID: '337065',
                    UF_CRM_DEAL_FROM_LEAD_ID: 'L_337065',
                    UF_CRM_DEAL_JOINED_LEADS: ['L_337065', '42'],
                },
            },
            { LEAD_337065: { ID: '337065' }, LEAD_42: { ID: '42' } },
        ]);

        const result = await service.collect(
            bitrix as never,
            { entityType: DuplicateEntityType.DEAL, id: 500 },
            SOURCE_GRAPH_LIMITS_FAST,
            [5],
        );

        const keys = result.excluded.map(ref => `${ref.entityType}_${ref.id}`);
        expect(keys).toEqual(
            expect.arrayContaining(['DEAL_500', 'LEAD_337065', 'LEAD_42']),
        );
    });

    it('зеркальные сделки читаются ТОЛЬКО с фильтром наших воронок', async () => {
        const { bitrix, sentWaves } = makeBitrix([
            { LEAD_42: { ID: '42', COMPANY_ID: '7' } },
            { COMPANY_7: { ID: '7' } },
        ]);

        await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [5, 11],
        );

        const mirror = Object.entries(sentWaves[1]).find(([cmd]) =>
            cmd.startsWith('mirror_COMPANY_ID'),
        );
        expect(mirror).toBeDefined();
        expect(
            (mirror?.[1].params as { filter: Record<string, unknown> }).filter
                .CATEGORY_ID,
        ).toEqual([5, 11]);
    });

    it('без сконфигурированных воронок зеркальные deal.list не отправляются', async () => {
        const { bitrix, sentWaves } = makeBitrix([
            { LEAD_42: { ID: '42', COMPANY_ID: '7' } },
            { COMPANY_7: { ID: '7' } },
        ]);

        await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [],
        );

        const mirrorCommands = sentWaves
            .flatMap(wave => Object.keys(wave))
            .filter(cmd => cmd.startsWith('mirror_'));
        expect(mirrorCommands).toEqual([]);
    });

    it('реквизиты фильтруются только по ENTITY_ID, пары матчятся на нашей стороне', async () => {
        const { bitrix, sentWaves } = makeBitrix([
            {
                LEAD_42: { ID: '42', COMPANY_ID: '5' },
                // Реквизит контакта №5 при волне с лидом 42 — НЕ наш.
                rq_wave_0: [
                    { ID: '1', ENTITY_TYPE_ID: 3, ENTITY_ID: 5, RQ_INN: '111' },
                    {
                        ID: '2',
                        ENTITY_TYPE_ID: 1,
                        ENTITY_ID: 42,
                        RQ_INN: '7707083893',
                    },
                ],
            },
            { COMPANY_5: { ID: '5' } },
        ]);

        const result = await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [5],
        );

        // Фильтр запроса — только ENTITY_ID (без ENTITY_TYPE_ID: IN×IN даёт декартово).
        const rqCall = Object.entries(sentWaves[0]).find(([cmd]) =>
            cmd.startsWith('rq_wave_'),
        );
        expect(rqCall?.[1].params).toMatchObject({
            filter: { ENTITY_ID: [42] },
        });

        // Чужая пара (CONTACT 5) отброшена, наша (LEAD 42) осталась.
        expect(result.requisiteRows).toHaveLength(1);
        expect(result.requisiteRows[0].RQ_INN).toBe('7707083893');
    });

    it('квоты по типам соблюдаются: лишние контакты не читаются', async () => {
        const manyContacts = Array.from({ length: 30 }, (_, i) =>
            String(100 + i),
        );
        const { bitrix } = makeBitrix([
            { LEAD_42: { ID: '42', CONTACT_IDS: manyContacts } },
            {},
        ]);

        const result = await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_FAST,
            [],
        );

        const contactNodes = result.excluded.filter(
            ref => ref.entityType === DuplicateEntityType.CONTACT,
        );
        expect(contactNodes.length).toBeLessThanOrEqual(
            SOURCE_GRAPH_LIMITS_FAST.quotas[DuplicateEntityType.CONTACT] ?? 0,
        );
    });

    it('DEEP добавляет третью волну — окружение зеркальных сделок', async () => {
        const { bitrix } = makeBitrix([
            { LEAD_42: { ID: '42', COMPANY_ID: '7' } },
            {
                COMPANY_7: { ID: '7' },
                mirror_COMPANY_ID_1: [
                    { ID: '900', COMPANY_ID: '7', CONTACT_ID: '55' },
                ],
            },
            { CONTACT_55: { ID: '55' } },
        ]);

        const result = await service.collect(
            bitrix as never,
            LEAD_ROOT,
            SOURCE_GRAPH_LIMITS_DEEP,
            [5],
        );

        expect(result.httpRequests).toBe(3);
        expect(
            result.excluded.some(
                ref =>
                    ref.entityType === DuplicateEntityType.CONTACT &&
                    ref.id === 55,
            ),
        ).toBe(true);
    });
});
