import {
    detectUfSkewHours,
    isSpontaneous,
    shiftDateTime,
    linkedDealId,
    mapPresentationDeal,
    mapSaleDeal,
    presentationDayStatus,
    type PresentationDealFacts,
} from '../lib/digest-presentation.mapper';
import { resolveDigestDealFields } from '../lib/digest-deal-fields.util';
import { portalModelMock } from './digest-list-fields.fixture';
import { DEAL_PORTAL } from './digest-deal-portal.fixture';

const DAY = '2026-10-14';

const facts = (
    overrides: Partial<PresentationDealFacts>,
): PresentationDealFacts => ({
    stageCode: 'spres_plan',
    planDate: null,
    planCreatedAt: null,
    doneDate: null,
    createdAt: '2026-10-10 10:00:00',
    movedAt: null,
    title: 'Презентация',
    ...overrides,
});

describe('presentationDayStatus', () => {
    it('проведена в день — по дате проведения', () => {
        expect(
            presentationDayStatus(
                facts({
                    stageCode: 'spres_success',
                    doneDate: '2026-10-14 11:00:00',
                }),
                DAY,
            ),
        ).toBe('held');
    });

    it('не состоялась, отказ, перенос — по стадии и смене стадии в день', () => {
        expect(
            presentationDayStatus(
                facts({
                    stageCode: 'spres_noresult',
                    movedAt: '2026-10-14 12:00:00',
                }),
                DAY,
            ),
        ).toBe('notHeld');
        expect(
            presentationDayStatus(
                facts({
                    stageCode: 'spres_fail',
                    movedAt: '2026-10-14 12:00:00',
                }),
                DAY,
            ),
        ).toBe('refused');
        expect(
            presentationDayStatus(
                facts({
                    stageCode: 'spres_pending',
                    movedAt: '2026-10-14 12:00:00',
                    planDate: '2026-10-16 10:00:00',
                }),
                DAY,
            ),
        ).toBe('postponed');
    });

    it('стоит на день и не отработана — pending; запланирована сегодня на потом — plannedNext', () => {
        expect(
            presentationDayStatus(
                facts({ planDate: '2026-10-14 15:00:00' }),
                DAY,
            ),
        ).toBe('pending');
        expect(
            presentationDayStatus(
                facts({
                    planCreatedAt: '2026-10-14 09:00:00',
                    planDate: '2026-10-20 10:00:00',
                }),
                DAY,
            ),
        ).toBe('plannedNext');
        expect(
            presentationDayStatus(
                facts({ planDate: '2026-10-20 10:00:00' }),
                DAY,
            ),
        ).toBe('other');
    });

    it('спонтанная: по названию или созданная сразу проведённой без плана', () => {
        expect(
            isSpontaneous(facts({ title: 'Презентация (незапланированная)' })),
        ).toBe(true);
        expect(isSpontaneous(facts({ stageCode: 'spres_success' }))).toBe(true);
        expect(
            isSpontaneous(
                facts({
                    stageCode: 'spres_success',
                    planDate: '2026-10-14 10:00:00',
                }),
            ),
        ).toBe(false);
    });

    it('linkedDealId понимает 123, D_123 и массивы', () => {
        expect(linkedDealId('123')).toBe(123);
        expect(linkedDealId(['D_77'])).toBe(77);
        expect(linkedDealId('CO_5')).toBeNull();
        expect(linkedDealId(null)).toBeNull();
    });
});

describe('mapPresentationDeal / mapSaleDeal', () => {
    const fields = resolveDigestDealFields(
        portalModelMock(DEAL_PORTAL) as never,
    );

    it('сделка презентации: стадия по суффиксу, даты, ссылки, план на начало дня', () => {
        const item = mapPresentationDeal(
            {
                ID: '501',
                TITLE: 'Презентация Юрист',
                CATEGORY_ID: '12',
                STAGE_ID: 'C12:WON',
                ASSIGNED_BY_ID: '2077',
                COMPANY_ID: '38947',
                CONTACT_ID: '0',
                LEAD_ID: null,
                DATE_CREATE: '2026-10-12T06:57:51+03:00',
                MOVED_TIME: '2026-10-14T11:05:00+03:00',
                OPPORTUNITY: '0.00',
                UF_CRM_NEXT_PRES_PLAN_DATE: '2026-10-14T10:00:00+03:00',
                UF_CRM_LAST_PRES_PLAN_DATE: '2026-10-12T06:57:51+03:00',
                UF_CRM_LAST_PRES_DONE_DATE: '2026-10-14T11:05:00+03:00',
                UF_CRM_TO_BASE_SALES: '267683',
                UF_CRM_OP_MHISTORY: [
                    '14.10 — проведена',
                    '12.10 — запланирована',
                    'a',
                    'b',
                ],
                UF_CRM_XO_CREATED: '2077',
            },
            fields,
            DAY,
        );
        expect(item).toEqual(
            expect.objectContaining({
                dealId: 501,
                stageCode: 'spres_success',
                stageName: 'Презентация проведена',
                dayStatus: 'held',
                assignedId: 2077,
                planAuthorId: 2077,
                hour: 11,
                plannedAtStart: true,
                spontaneous: false,
                company: { id: 38947, title: '' },
                contact: null,
                lead: null,
                baseDeal: { id: 267683, title: '' },
                complectName: null,
                complectSource: null,
                sum: 0,
                history: ['14.10 — проведена', '12.10 — запланирована', 'a'],
            }),
        );
    });

    it('продажа: сумма, комплект, ссылки', () => {
        const sale = mapSaleDeal(
            {
                ID: '267683',
                TITLE: 'ООО Ромашка — Гарант',
                ASSIGNED_BY_ID: '2077',
                CLOSEDATE: '2026-10-14T00:00:00+03:00',
                OPPORTUNITY: '144000.00',
                COMPANY_ID: '38947',
                UF_CRM_1684145200: 'Юрист Максимум',
            },
            fields,
        );
        expect(sale).toEqual(
            expect.objectContaining({
                dealId: 267683,
                opportunity: 144000,
                complectName: 'Юрист Максимум',
                closeDate: '2026-10-14 00:00:00',
                company: { id: 38947, title: '' },
                presentations: [],
            }),
        );
    });
});

describe('detectUfSkewHours / shiftDateTime', () => {
    const fields = resolveDigestDealFields(
        portalModelMock(DEAL_PORTAL) as never,
    );
    const won = (done: string, moved: string) => ({
        STAGE_ID: 'C12:WON',
        UF_CRM_LAST_PRES_DONE_DATE: done,
        MOVED_TIME: moved,
    });

    it('сдвиг по большинству проведённых: UF на 5 ч впереди системных', () => {
        expect(
            detectUfSkewHours(
                [
                    won(
                        '2026-10-14T09:07:45+03:00',
                        '2026-10-14T04:07:51+03:00',
                    ),
                    won(
                        '2026-10-14T11:00:00+03:00',
                        '2026-10-14T06:00:30+03:00',
                    ),
                    won(
                        '2026-10-14T15:30:00+03:00',
                        '2026-10-14T10:29:50+03:00',
                    ),
                    {
                        STAGE_ID: 'C12:PLAN',
                        UF_CRM_LAST_PRES_DONE_DATE: '2026-10-14T01:00:00+03:00',
                        MOVED_TIME: '2026-10-14T12:00:00+03:00',
                    },
                ],
                fields,
            ),
        ).toBe(5);
    });

    it('мало пар или нет большинства — 0', () => {
        expect(
            detectUfSkewHours(
                [won('2026-10-14T09:00:00', '2026-10-14T04:00:00')],
                fields,
            ),
        ).toBe(0);
        expect(
            detectUfSkewHours(
                [
                    won('2026-10-14T09:00:00', '2026-10-14T04:00:00'),
                    won('2026-10-14T09:00:00', '2026-10-14T09:00:00'),
                    won('2026-10-14T09:00:00', '2026-10-14T07:00:00'),
                ],
                fields,
            ),
        ).toBe(0);
    });

    it('shiftDateTime переходит через полночь', () => {
        expect(shiftDateTime('2026-10-14 03:30:00', -5)).toBe(
            '2026-10-13 22:30:00',
        );
        expect(shiftDateTime('2026-10-14 03:30:00', 0)).toBe(
            '2026-10-14 03:30:00',
        );
        expect(shiftDateTime(null, 3)).toBeNull();
    });
});
