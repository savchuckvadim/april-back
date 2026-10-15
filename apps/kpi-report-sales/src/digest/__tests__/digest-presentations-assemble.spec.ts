import type { KpiDigestPresentationDto } from '../dto/digest-presentations.dto';
import type { KpiDigestRecordDto } from '../dto/digest-response.dto';
import {
    assemblePresentations,
    indexPresentationRecords,
    withRecords,
} from '../lib/digest-presentations-assemble.util';
import { emptyCounters } from '../lib/digest-reduce.util';

const record = (overrides: Partial<KpiDigestRecordDto>): KpiDigestRecordDto => ({
    id: '1',
    userId: 2077,
    typeCode: 'presentation',
    typeName: 'Презентация',
    actionCode: 'done',
    actionName: 'Состоялся',
    eventDate: '2026-10-14 11:00:00',
    planDate: null,
    resultCode: null,
    noresultReason: null,
    comment: '',
    name: '',
    crmRefs: ['CO_1', 'D_501'],
    companyId: 1,
    ...overrides,
});

const item = (overrides: Partial<KpiDigestPresentationDto>): KpiDigestPresentationDto => ({
    dealId: 501,
    title: 'Презентация',
    stageCode: 'spres_plan',
    stageName: 'Запланирована',
    dayStatus: 'pending',
    assignedId: 2077,
    planAuthorId: null,
    planDate: '2026-10-14 10:00:00',
    planCreatedAt: '2026-10-12 09:00:00',
    doneDate: null,
    createdAt: '2026-10-12 09:00:00',
    movedAt: null,
    hour: 10,
    plannedAtStart: true,
    spontaneous: false,
    company: null,
    contact: null,
    lead: null,
    baseDeal: null,
    complectName: null,
    complectSource: null,
    sum: 0,
    productNames: [],
    planComment: null,
    reportComment: null,
    noresultReason: null,
    history: [],
    ...overrides,
});

describe('indexPresentationRecords', () => {
    it('только презентации, по каждой D_-ссылке', () => {
        const index = indexPresentationRecords([
            record({ id: '1', crmRefs: ['D_501', 'D_9'] }),
            record({ id: '2', typeCode: 'xo', crmRefs: ['D_501'] }),
        ]);
        expect(index.get(501)?.map(r => r.id)).toEqual(['1']);
        expect(index.get(9)?.map(r => r.id)).toEqual(['1']);
    });
});

describe('withRecords', () => {
    it('комментарии плана и отчёта; отчёт уточняет статус pending и час', () => {
        const result = withRecords(
            item({}),
            [record({ actionCode: 'act_noresult_fail', comment: 'Не дозвонились', noresultReason: 'nopickup', eventDate: '2026-10-14 15:30:00' })],
            [record({ actionCode: 'plan', comment: 'Юрист, обсудить Искру', eventDate: '2026-10-12 09:00:00' })],
        );
        expect(result.dayStatus).toBe('notHeld');
        expect(result.hour).toBe(15);
        expect(result.planComment).toBe('Юрист, обсудить Искру');
        expect(result.reportComment).toBe('Не дозвонились');
        expect(result.noresultReason).toBe('nopickup');
    });

    it('статус по стадии сделки не перезаписывается; спонтанная берёт план из записей дня', () => {
        const result = withRecords(
            item({ dayStatus: 'held', hour: 11 }),
            [
                record({ actionCode: 'plan', comment: 'Незапланированная', eventDate: '2026-10-14 11:00:01' }),
                record({ actionCode: 'done', comment: 'Прошла хорошо', eventDate: '2026-10-14 11:00:02' }),
            ],
            [],
        );
        expect(result.dayStatus).toBe('held');
        expect(result.hour).toBe(11);
        expect(result.planComment).toBe('Незапланированная');
        expect(result.reportComment).toBe('Прошла хорошо');
    });
});

describe('assemblePresentations', () => {
    it('отбор по сотрудникам и сортировка по часу', () => {
        const partition = {
            date: '2026-10-14' as const,
            items: [
                item({ dealId: 1, assignedId: 7, hour: 15 }),
                item({ dealId: 2, assignedId: 2077, hour: 9 }),
                item({ dealId: 3, assignedId: 2077, hour: 12 }),
            ],
            sales: [
                { dealId: 10, assignedId: 7 },
                { dealId: 11, assignedId: 2077 },
            ] as never,
            truncated: false,
            warnings: [],
            builtAt: 'x',
        };
        const day = { date: '2026-10-14' as const, byUser: { '2077': { counters: emptyCounters(), records: [] } }, usersCount: 1, elements: 0, truncated: false, builtAt: 'x' };
        const planned = { date: '2026-10-14' as const, byUser: {}, elements: 0, truncated: false, builtAt: 'x' };

        const result = assemblePresentations({ partition, day, planned, userIds: new Set([2077]) });
        expect(result.items.map(i => i.dealId)).toEqual([2, 3]);
        expect(result.sales.map(s => s.dealId)).toEqual([11]);

        const all = assemblePresentations({ partition, day, planned, userIds: new Set() });
        expect(all.items).toHaveLength(3);
    });
});
