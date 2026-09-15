import type { BitrixService } from '../../../bitrix.service';
import {
    buildStatisticFilter,
    BxVoximplantStatisticService,
    isVoxConversation,
    isVoxIncoming,
    voxCallDurationSec,
    voxEntityKey,
} from '../service/bx-voximplant-statistic.service';
import type { BxVoximplantStatisticRow } from '../type/bx-voximplant-statistic.type';

/** Битрикс-заглушка: отдаёт заранее заданные страницы ответа. */
function bitrixOf(pages: (Record<string, unknown> | null)[]): {
    bitrix: BitrixService;
    calls: Record<string, unknown>[];
} {
    const calls: Record<string, unknown>[] = [];
    let index = 0;
    const bitrix = {
        api: {
            call: (_method: string, data: Record<string, unknown>) => {
                calls.push(data);
                const page =
                    index < pages.length ? pages[index] : { result: [] };
                index += 1;
                return Promise.resolve(page);
            },
        },
    } as unknown as BitrixService;
    return { bitrix, calls };
}

const row = (
    fields: Partial<BxVoximplantStatisticRow>,
): BxVoximplantStatisticRow => ({
    CALL_ID: 'c1',
    PORTAL_USER_ID: '7',
    CALL_DURATION: '0',
    CALL_START_DATE: '2026-08-03T10:00:00+03:00',
    CALL_TYPE: '1',
    CALL_FAILED_CODE: '603-S',
    ...fields,
});

describe('BxVoximplantStatisticService', () => {
    it('собирает все страницы по next и отдаёт total', async () => {
        const { bitrix, calls } = bitrixOf([
            { result: [row({ CALL_ID: 'a' })], next: 1, total: 2 },
            { result: [row({ CALL_ID: 'b' })], total: 2 },
        ]);

        const result = await new BxVoximplantStatisticService(
            bitrix,
        ).getStatistic({
            fromIso: '2026-08-01T00:00:00+03:00',
            toIso: '2026-08-31T23:59:59+03:00',
            userIds: [7, 9],
        });

        expect(result.rows.map(item => item.CALL_ID)).toEqual(['a', 'b']);
        expect(result.total).toBe(2);
        expect(result.truncated).toBe(false);
        expect(calls).toHaveLength(2);
        expect(calls[1].start).toBe(1);
    });

    it('страница без result — truncated, а не «данных больше нет»', async () => {
        const { bitrix } = bitrixOf([
            { result: [row({ CALL_ID: 'a' })], next: 1 },
            null,
        ]);

        const result = await new BxVoximplantStatisticService(
            bitrix,
        ).getStatistic({
            fromIso: '2026-08-01T00:00:00+03:00',
            toIso: '2026-08-31T23:59:59+03:00',
        });

        expect(result.rows).toHaveLength(1);
        expect(result.truncated).toBe(true);
    });

    it('упор в maxRows отмечается truncated и режет хвост', async () => {
        const { bitrix } = bitrixOf([
            {
                result: [
                    row({ CALL_ID: 'a' }),
                    row({ CALL_ID: 'b' }),
                    row({ CALL_ID: 'c' }),
                ],
                next: 3,
            },
        ]);

        const result = await new BxVoximplantStatisticService(
            bitrix,
        ).getStatistic({
            fromIso: '2026-08-01T00:00:00+03:00',
            toIso: '2026-08-31T23:59:59+03:00',
            maxRows: 2,
        });

        expect(result.rows).toHaveLength(2);
        expect(result.truncated).toBe(true);
    });
});

describe('buildStatisticFilter', () => {
    it('границы периода включительно, сотрудники строками', () => {
        expect(
            buildStatisticFilter({
                fromIso: '2026-08-01T00:00:00+03:00',
                toIso: '2026-08-31T23:59:59+03:00',
                userIds: [7, '9'],
                minDurationSec: 60,
            }),
        ).toEqual({
            '>=CALL_START_DATE': '2026-08-01T00:00:00+03:00',
            '<=CALL_START_DATE': '2026-08-31T23:59:59+03:00',
            '>=CALL_DURATION': 60,
            PORTAL_USER_ID: ['7', '9'],
        });
    });

    it('нулевой порог длительности в фильтр не уходит (нужны все наборы)', () => {
        expect(
            buildStatisticFilter({
                fromIso: '2026-08-01T00:00:00+03:00',
                toIso: '2026-08-31T23:59:59+03:00',
                minDurationSec: 0,
            }),
        ).not.toHaveProperty('>=CALL_DURATION');
    });
});

describe('признаки строки статистики', () => {
    it('разговор — только код 200 и длительность не ниже порога', () => {
        const talk = row({ CALL_FAILED_CODE: '200', CALL_DURATION: '31' });
        const short = row({ CALL_FAILED_CODE: '200', CALL_DURATION: '12' });
        const failed = row({ CALL_FAILED_CODE: '486', CALL_DURATION: '90' });

        expect(isVoxConversation(talk)).toBe(true);
        expect(isVoxConversation(short)).toBe(false);
        expect(isVoxConversation(short, 10)).toBe(true);
        expect(isVoxConversation(failed)).toBe(false);
    });

    it('входящие — типы 2 и 3; длительность строкой приводится к числу', () => {
        expect(isVoxIncoming(row({ CALL_TYPE: '2' }))).toBe(true);
        expect(isVoxIncoming(row({ CALL_TYPE: '3' }))).toBe(true);
        expect(isVoxIncoming(row({ CALL_TYPE: '1' }))).toBe(false);
        expect(voxCallDurationSec(row({ CALL_DURATION: '95' }))).toBe(95);
        expect(voxCallDurationSec(row({ CALL_DURATION: 'x' }))).toBe(0);
    });

    it('ключ CRM-сущности собирается из типа и id, иначе null', () => {
        expect(
            voxEntityKey(row({ CRM_ENTITY_TYPE: 'lead', CRM_ENTITY_ID: '42' })),
        ).toBe('LEAD:42');
        expect(voxEntityKey(row({ CRM_ENTITY_ID: '42' }))).toBeNull();
        expect(
            voxEntityKey(row({ CRM_ENTITY_TYPE: 'LEAD', CRM_ENTITY_ID: '0' })),
        ).toBeNull();
    });
});
