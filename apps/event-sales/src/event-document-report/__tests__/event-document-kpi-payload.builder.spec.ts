import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import { KpiEventPayload } from '../../shared/kpi-list-flow/type/kpi-event-payload.type';
import { EventDocumentKpiPayloadBuilder } from '../services/kpi-list/event-document-kpi-payload.builder';
import {
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_COMPANY_ID,
    DOCUMENT_CREATED_AT_MOSCOW,
    DOCUMENT_PRESENTATION_DEAL_ID,
    DOCUMENT_USER_ID,
    SnapshotOptions,
    makeContext,
} from './event-document.fixtures';

const { offer, invoice, contract, supply } = SALES_DOCUMENT_KIND;

const COMPANY_LINK = `CO_${DOCUMENT_COMPANY_ID}`;
const BASE_DEAL_LINK = `D_${DOCUMENT_BASE_DEAL_ID}`;
const PRESENTATION_DEAL_LINK = `D_${DOCUMENT_PRESENTATION_DEAL_ID}`;

const build = (
    event: Partial<SalesDocumentEventJobData> = {},
    snapshot?: SnapshotOptions,
) => {
    const { ctx } = makeContext({ event, snapshot });
    return new EventDocumentKpiPayloadBuilder(ctx).build();
};

const kpiKey = (eventType: string): string =>
    `${DOCUMENT_COMPANY_ID}_${DOCUMENT_BASE_DEAL_ID}_${eventType}`;

const eventTypes = (rows: KpiEventPayload[]): (string | undefined)[] =>
    rows.map(row => row.items.event_type);

/** Все ссылки строк на сущности CRM (значения поля «CRM»). */
const crmLinks = (rows: KpiEventPayload[]): string[] =>
    rows.flatMap(row => {
        const crm: Record<string, string> = row.values.crm ?? {};
        return Object.values(crm);
    });

/**
 * Строки списков по документам: в «Историю» идёт каждый документ, в «ОП KPI»
 * каждый тип засчитывается один раз на пару «компания + основная сделка»
 * (тот же код строки, что писал легаси, — дублей со старыми строками нет).
 */
describe('EventDocumentKpiPayloadBuilder — строки «ОП KPI» и «ОП История»', () => {
    // КП: каждая отправка видна в «Истории», в KPI засчитывается один раз.
    describe('КП', () => {
        it('даёт одну строку «Истории» без правила дедупликации', () => {
            const { history } = build();

            expect(history).toHaveLength(1);
            expect(history[0].name).toBe('КП');
            expect(history[0].items).toMatchObject({
                event_type: 'ev_offer',
                event_action: 'act_send',
            });
            expect(history[0].dedup).toBeUndefined();
        });

        it('даёт одну строку KPI, которая засчитывается один раз на сделку', () => {
            const { kpi } = build();

            expect(kpi).toHaveLength(1);
            expect(kpi[0].name).toBe('КП');
            expect(kpi[0].items.event_type).toBe('ev_offer');
            expect(kpi[0].dedup).toEqual({
                key: kpiKey('ev_offer'),
                scope: 'kpi',
                mode: 'insert-once',
                requireEventTypeItem: true,
            });
        });

        it('код строки KPI такой же, как у легаси: компания_сделка_тип', () => {
            expect(build().kpi[0].dedup?.key).toBe('700_5000_ev_offer');
        });
    });

    // Каждый документ события получает свои строки в фиксированном порядке.
    describe('несколько документов одним событием', () => {
        it('КП со счётом: две строки «Истории» и две строки KPI', () => {
            const { history, kpi } = build({ kinds: [offer, invoice] });

            expect(history.map(row => row.name)).toEqual(['КП', 'Счет']);
            expect(eventTypes(history)).toEqual(['ev_offer', 'ev_invoice']);
            expect(kpi.map(row => row.dedup?.key)).toEqual([
                kpiKey('ev_offer'),
                kpiKey('ev_invoice'),
            ]);
        });

        it('порядок строк не зависит от порядка документов в событии', () => {
            const { history } = build({ kinds: [invoice, offer] });

            expect(eventTypes(history)).toEqual(['ev_offer', 'ev_invoice']);
        });
    });

    // Вариант «после презентации» пишется только в KPI, в «Историю» не идёт.
    describe('после презентации', () => {
        it('КП: в «Истории» одна строка, в KPI две — «КП» и «КП после презентации»', () => {
            const { history, kpi } = build({ presentation: {} });

            expect(history).toHaveLength(1);
            expect(eventTypes(history)).toEqual(['ev_offer']);
            expect(kpi).toHaveLength(2);
            expect(eventTypes(kpi)).toEqual(['ev_offer', 'ev_offer_pres']);
            expect(kpi[1].name).toBe('КП после презентации');
            expect(kpi[1].values.event_title).toBe('КП после презентации');
            expect(kpi[1].dedup?.key).toBe(kpiKey('ev_offer_pres'));
        });

        it('счёт: в KPI вторая строка «Счет после презентации»', () => {
            const { history, kpi } = build({
                kinds: [invoice],
                presentation: {},
            });

            expect(history).toHaveLength(1);
            expect(eventTypes(kpi)).toEqual(['ev_invoice', 'ev_invoice_pres']);
            expect(kpi[1].name).toBe('Счет после презентации');
        });

        it('договор: в KPI одна строка — варианта «после презентации» нет', () => {
            const { history, kpi } = build({
                kinds: [contract],
                presentation: {},
            });

            expect(history).toHaveLength(1);
            expect(kpi).toHaveLength(1);
            expect(eventTypes(kpi)).toEqual(['ev_contract']);
        });

        it('без блока presentation строк «после презентации» нет', () => {
            const { kpi } = build({ kinds: [offer, invoice] });

            expect(eventTypes(kpi)).toEqual(['ev_offer', 'ev_invoice']);
        });
    });

    // У поставки свой тип события и действие «выполнено», а не «отправлен».
    describe('поставка', () => {
        it('пишется типом «поставка» с действием «выполнено»', () => {
            const { history, kpi } = build({ kinds: [supply] });

            expect(history[0].name).toBe('Отчет о поставке');
            expect(history[0].items).toMatchObject({
                event_type: 'ev_supply',
                event_action: 'done',
            });
            expect(kpi[0].items).toMatchObject({
                event_type: 'ev_supply',
                event_action: 'done',
            });
            expect(kpi[0].dedup?.key).toBe(kpiKey('ev_supply'));
        });
    });

    // Поле «CRM» ссылается только на компанию и сделки: лиды и смарты Битрикс
    // портала мог бы не принять и отклонить строку целиком.
    describe('ссылки на карточки (поле «CRM»)', () => {
        it('компания и основная сделка', () => {
            const { history, kpi } = build();

            expect(history[0].values.crm).toEqual({
                n0: COMPANY_LINK,
                n1: BASE_DEAL_LINK,
            });
            expect(kpi[0].values.crm).toEqual(history[0].values.crm);
        });

        it('после презентации со сделкой презентации — добавляется и она', () => {
            const { history, kpi } = build(
                { presentation: {} },
                {
                    presentationDeal: {
                        ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
                    },
                },
            );

            const expected = {
                n0: COMPANY_LINK,
                n1: BASE_DEAL_LINK,
                n2: PRESENTATION_DEAL_LINK,
            };
            expect(history[0].values.crm).toEqual(expected);
            expect(kpi.map(row => row.values.crm)).toEqual([
                expected,
                expected,
            ]);
        });

        it('после презентации, но сделка презентации не найдена — только компания и основная', () => {
            const { kpi } = build({ presentation: {} });

            expect(kpi[0].values.crm).toEqual({
                n0: COMPANY_LINK,
                n1: BASE_DEAL_LINK,
            });
        });

        it('сделка презентации есть в снимке, но документ не «после презентации» — не добавляется', () => {
            const { history } = build(
                {},
                {
                    presentationDeal: {
                        ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
                    },
                },
            );

            expect(history[0].values.crm).toEqual({
                n0: COMPANY_LINK,
                n1: BASE_DEAL_LINK,
            });
        });

        it('ссылок на лиды и смарты нет ни в каком случае', () => {
            // Поле «CRM» списка на портале может не принимать эти типы, и
            // Битрикс отклонил бы строку целиком (gsr, 23.11.2026).
            const { history, kpi } = build(
                {
                    kinds: [offer, invoice, contract, supply],
                    presentation: { dealId: 77, smartItemId: 12 },
                },
                {
                    baseDeal: {
                        ID: String(DOCUMENT_BASE_DEAL_ID),
                        LEAD_ID: '33',
                        UF_CRM_TASK: ['L_33', 'T9_12'],
                    },
                    presentationDeal: {
                        ID: String(DOCUMENT_PRESENTATION_DEAL_ID),
                        LEAD_ID: '34',
                    },
                },
            );

            const links = crmLinks([...history, ...kpi]);

            expect(links.length).toBeGreaterThan(0);
            for (const link of links) {
                expect(link).toMatch(/^(CO|D)_\d+$/);
            }
        });
    });

    // Автор, дата, комментарий и пометки у всех строк одни и те же.
    describe('общие значения строки', () => {
        it('компания, сотрудник, дата и пометки «в работе» и «перспективная»', () => {
            const { history } = build();

            expect(history[0].values).toMatchObject({
                event_date: DOCUMENT_CREATED_AT_MOSCOW,
                event_title: 'КП',
                author: DOCUMENT_USER_ID,
                responsible: DOCUMENT_USER_ID,
                su: DOCUMENT_USER_ID,
                crm_company: { n0: COMPANY_LINK },
            });
            expect(history[0].items).toEqual({
                event_type: 'ev_offer',
                event_action: 'act_send',
                op_work_status: 'op_status_in_work',
                op_result_status: 'op_call_result_yes',
                op_prospects_type: 'op_prospects_good',
            });
        });

        it('комментарий менеджера — summary события без пробелов по краям', () => {
            const { history, kpi } = build({
                summary: '  КП: 3 позиции, 15 000 руб.  \n',
            });

            expect(history[0].values.manager_comment).toBe(
                'КП: 3 позиции, 15 000 руб.',
            );
            expect(kpi[0].values.manager_comment).toBe(
                'КП: 3 позиции, 15 000 руб.',
            );
        });

        it('summary нет — комментарий пустой', () => {
            expect(build().history[0].values.manager_comment).toBe('');
        });

        it('строка «после презентации» несёт тот же комментарий и сотрудника', () => {
            const { kpi } = build({
                presentation: {},
                summary: 'Позиции КП',
            });

            expect(kpi[1].values).toMatchObject({
                manager_comment: 'Позиции КП',
                author: DOCUMENT_USER_ID,
                event_title: 'КП после презентации',
            });
            expect(kpi[1].items.event_action).toBe('act_send');
        });
    });
});
