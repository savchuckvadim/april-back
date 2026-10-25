import { baseDealTitle } from '../lib/base-deal-title';
import { DealFlowService } from '../services/flows/deal-flow.service';

/**
 * Основная сделка называется по клиенту, а не по событию ХО (garant, чат
 * внедрения 07–08.10.2026: при ХО по списку все сделки получали название
 * списка; решение владельца 13.10.2026).
 */

describe('baseDealTitle', () => {
    it('компания клиента важнее всего', () => {
        expect(
            baseDealTitle({
                company: { TITLE: 'ООО «Ромашка»' },
                lead: { COMPANY_TITLE: 'Ромашка', TITLE: 'Заявка с сайта' },
                leadId: 1,
            }),
        ).toBe('ООО «Ромашка»');
    });

    it('без компании — название компании из лида, затем название лида', () => {
        expect(
            baseDealTitle({
                company: null,
                lead: { COMPANY_TITLE: '  ИП Иванов ', TITLE: 'Иванов' },
                leadId: 1,
            }),
        ).toBe('ИП Иванов');
        expect(
            baseDealTitle({
                company: null,
                lead: { COMPANY_TITLE: '', TITLE: 'Иванов Иван' },
                leadId: 1,
            }),
        ).toBe('Иванов Иван');
    });

    it('ИНН в «Название компании» лида — берётся название лида (garant, лид 196219)', () => {
        expect(
            baseDealTitle({
                company: null,
                lead: {
                    COMPANY_TITLE: '4703142743',
                    TITLE: 'ГАНПОУ ЛО "МЦ СИТИ"',
                },
                leadId: 196219,
            }),
        ).toBe('ГАНПОУ ЛО "МЦ СИТИ"');
    });

    it('совсем пусто — «Лид N»', () => {
        expect(baseDealTitle({ company: null, lead: {}, leadId: 42 })).toBe(
            'Лид 42',
        );
    });
});

describe('лид → работа: новая основная сделка', () => {
    const makeService = () => {
        const commands: { cmd: string; fields: Record<string, unknown> }[] = [];
        const bitrix = {
            batch: {
                deal: {
                    set: (cmd: string, fields: Record<string, unknown>) =>
                        commands.push({ cmd, fields }),
                    update: (
                        cmd: string,
                        _id: number,
                        fields: Record<string, unknown>,
                    ) => commands.push({ cmd, fields }),
                },
            },
        };
        const portal = {
            getSalesTaskGroupId: () => 5,
            getEntityFieldByCode: () => undefined,
            getFieldBitrixId: () => '',
            getTimezone: () => 'Europe/Moscow',
        };
        const buffer = { queue: (fn: () => unknown) => fn() };
        const service = new DealFlowService(bitrix as never, portal as never);
        return { service, commands, buffer };
    };

    it('ХО по списку: сделка называется по клиенту, а не названием списка', () => {
        const { service, commands, buffer } = makeService();
        service.queueBase(
            {
                leadId: 42,
                responsible: 7,
                isXo: 'Y',
                name: 'Холодный обзвон В работу Лиды-заявки с сайта',
            } as never,
            {
                contactIds: [],
                company: null,
                lead: { COMPANY_TITLE: 'ООО Ромашка', TITLE: 'Заявка' },
            } as never,
            { dealCategoryId: '31', dealStageId: 'C31:COLD' } as never,
            null,
            null,
            buffer as never,
        );
        const deal = commands.find(c => c.cmd.startsWith('lw_deal_'));
        expect(deal?.fields.TITLE).toBe('ООО Ромашка');
    });

    it('существующей основной сделке название не меняется', () => {
        const { service, commands, buffer } = makeService();
        service.queueBase(
            { leadId: 42, responsible: 7, isXo: 'Y', name: 'Список' } as never,
            {
                contactIds: [],
                company: null,
                lead: { TITLE: 'Заявка' },
                existingOurDeal: { ID: '500', TITLE: 'ООО Ромашка' },
            } as never,
            { dealCategoryId: '31', dealStageId: 'C31:COLD' } as never,
            null,
            null,
            buffer as never,
        );
        const update = commands.find(c => c.cmd.startsWith('lw_deal_upd_'));
        expect(update).toBeDefined();
        expect(update?.fields).not.toHaveProperty('TITLE');
    });
});
