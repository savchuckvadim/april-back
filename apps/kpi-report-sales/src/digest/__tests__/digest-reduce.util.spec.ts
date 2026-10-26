import type { KpiDigestRecordDto } from '../dto/digest-response.dto';
import {
    addCounters,
    emptyCounters,
    isPlannedBeyondDay,
    reduceDayRecords,
    reducePlannedRecords,
} from '../lib/digest-reduce.util';

const record = (
    overrides: Partial<KpiDigestRecordDto> & { userId: number },
): KpiDigestRecordDto => ({
    id: '1',
    typeCode: 'xo',
    typeName: 'Холодный звонок',
    actionCode: 'done',
    actionName: 'Состоялся',
    eventDate: '2026-10-14 10:00:00',
    planDate: null,
    resultCode: null,
    noresultReason: null,
    comment: '',
    name: '',
    crmRefs: [],
    companyId: null,
    ...overrides,
});

const META = {
    elements: 0,
    truncated: false,
    builtAt: '2026-10-14T12:00:00.000Z',
};

describe('reduceDayRecords', () => {
    it('классифицирует действия по типам, продажи/отказы, документы, причины и план на будущее', () => {
        const partition = reduceDayRecords(
            '2026-10-14',
            [
                record({
                    id: '1',
                    userId: 42,
                    typeCode: 'xo',
                    actionCode: 'done',
                }),
                record({
                    id: '2',
                    userId: 42,
                    typeCode: 'call',
                    actionCode: 'done',
                }),
                record({
                    id: '3',
                    userId: 42,
                    typeCode: 'xo',
                    actionCode: 'act_noresult_fail',
                    noresultReason: 'nopickup',
                }),
                record({
                    id: '4',
                    userId: 42,
                    typeCode: 'presentation',
                    actionCode: 'pound',
                    planDate: '2026-10-16 12:00:00',
                    noresultReason: 'secretar',
                }),
                record({
                    id: '5',
                    userId: 42,
                    typeCode: 'xo',
                    actionCode: 'plan',
                    planDate: '2026-10-14 18:00:00',
                }),
                record({
                    id: '6',
                    userId: 42,
                    typeCode: 'presentation',
                    actionCode: 'plan',
                    planDate: '2026-10-20 10:00:00',
                }),
                record({
                    id: '7',
                    userId: 42,
                    typeCode: 'call',
                    actionCode: 'expired',
                }),
                record({
                    id: '8',
                    userId: 42,
                    typeCode: 'ev_offer',
                    actionCode: 'act_send',
                }),
                record({
                    id: '9',
                    userId: 42,
                    typeCode: 'ev_success',
                    actionCode: 'done',
                }),
                record({
                    id: '10',
                    userId: 42,
                    typeCode: 'ev_fail',
                    actionCode: 'done',
                }),
                // клон уникальной презентации — не считается
                record({
                    id: '11',
                    userId: 42,
                    typeCode: 'presentation_uniq',
                    actionCode: 'done',
                }),
                // без ответственного — не считается
                record({
                    id: '12',
                    userId: 0,
                    typeCode: 'xo',
                    actionCode: 'done',
                }),
                record({
                    id: '13',
                    userId: 7,
                    typeCode: 'xo',
                    actionCode: 'done',
                }),
            ],
            { ...META, elements: 13 },
        );

        const user = partition.byUser['42'];
        expect(partition.usersCount).toBe(2);
        expect(user.counters.done).toEqual({
            total: 2,
            byType: { xo: 1, call: 1 },
        });
        expect(user.counters.notHeld).toEqual({ total: 1, byType: { xo: 1 } });
        expect(user.counters.postponed).toEqual({
            total: 1,
            byType: { presentation: 1 },
        });
        expect(user.counters.planned).toEqual({
            total: 2,
            byType: { xo: 1, presentation: 1 },
        });
        expect(user.counters.plannedBeyond).toEqual({
            total: 2,
            byType: { presentation: 2 },
        });
        expect(user.counters.expired).toEqual({
            total: 1,
            byType: { call: 1 },
        });
        expect(user.counters.documents).toEqual({
            total: 1,
            byType: { ev_offer: 1 },
        });
        expect(user.counters.sales).toBe(1);
        expect(user.counters.refusals).toBe(1);
        expect(user.counters.noresultReasons).toEqual({
            nopickup: 1,
            secretar: 1,
        });
        expect(user.counters.plannedAtStart).toEqual({ total: 0, byType: {} });
        expect(user.records.map(r => r.id)).toEqual([
            '1',
            '2',
            '3',
            '4',
            '5',
            '6',
            '7',
            '8',
            '9',
            '10',
        ]);
        expect(partition.byUser['7'].counters.done.total).toBe(1);
        expect(partition.elements).toBe(13);
    });

    it('записи сортируются по дате события', () => {
        const partition = reduceDayRecords(
            '2026-10-14',
            [
                record({
                    id: '2',
                    userId: 1,
                    eventDate: '2026-10-14 15:00:00',
                }),
                record({
                    id: '1',
                    userId: 1,
                    eventDate: '2026-10-14 09:00:00',
                }),
            ],
            META,
        );
        expect(partition.byUser['1'].records.map(r => r.id)).toEqual([
            '1',
            '2',
        ]);
    });

    it('isPlannedBeyondDay: сравнение по дате, время не влияет', () => {
        expect(isPlannedBeyondDay('2026-10-14 23:59:00', '2026-10-14')).toBe(
            false,
        );
        expect(isPlannedBeyondDay('2026-10-15 00:00:00', '2026-10-14')).toBe(
            true,
        );
        expect(isPlannedBeyondDay(null, '2026-10-14')).toBe(false);
    });
});

describe('reducePlannedRecords', () => {
    it('считает план/перенос с дедлайном в день по типам, отсеивает чужие', () => {
        const partition = reducePlannedRecords(
            '2026-10-14',
            [
                record({
                    id: '1',
                    userId: 42,
                    actionCode: 'plan',
                    typeCode: 'xo',
                    planDate: '2026-10-14 10:00:00',
                }),
                record({
                    id: '2',
                    userId: 42,
                    actionCode: 'pound',
                    typeCode: 'presentation',
                    planDate: '2026-10-14 12:00:00',
                }),
                record({
                    id: '3',
                    userId: 42,
                    actionCode: 'done',
                    typeCode: 'xo',
                    planDate: '2026-10-14 12:00:00',
                }),
                record({
                    id: '4',
                    userId: 42,
                    actionCode: 'plan',
                    typeCode: 'xo',
                    planDate: '2026-10-15 12:00:00',
                }),
            ],
            META,
        );
        expect(partition.byUser['42'].count).toEqual({
            total: 2,
            byType: { xo: 1, presentation: 1 },
        });
        expect(partition.byUser['42'].records.map(r => r.id)).toEqual([
            '1',
            '2',
        ]);
    });
});

describe('addCounters', () => {
    it('суммирует все счётчики, включая разбивки и причины', () => {
        const target = emptyCounters();
        const source = emptyCounters();
        source.done = { total: 2, byType: { xo: 2 } };
        source.sales = 1;
        source.noresultReasons = { busy: 1 };
        addCounters(target, source);
        addCounters(target, source);
        expect(target.done).toEqual({ total: 4, byType: { xo: 4 } });
        expect(target.sales).toBe(2);
        expect(target.noresultReasons).toEqual({ busy: 2 });
    });
});
