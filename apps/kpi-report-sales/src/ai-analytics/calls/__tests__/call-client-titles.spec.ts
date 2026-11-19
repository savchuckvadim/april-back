import type { TranscriptionStoreService } from '@lib/call-lib';
import type { BitrixService } from '@/modules/bitrix';
import type { PBXService } from '@/modules/pbx';
import { CallClientTitlesReader } from '../call-client-titles.reader';
import { CallClientTitlesService } from '../call-client-titles.service';

function bitrixOf() {
    return {
        deal: {
            getList: jest.fn(() =>
                Promise.resolve({
                    result: [{ ID: '7', TITLE: 'Сделка Ромашка' }],
                }),
            ),
        },
        lead: { getList: jest.fn(() => Promise.reject(new Error('сбой'))) },
        company: {
            getList: jest.fn(() =>
                Promise.resolve([{ ID: 3, TITLE: ' ООО «Лютик» ' }]),
            ),
        },
        contact: {
            getList: jest.fn(() =>
                Promise.resolve({
                    result: [{ ID: '5', NAME: 'Анна', LAST_NAME: 'Петрова' }],
                }),
            ),
        },
    };
}

describe('CallClientTitlesReader', () => {
    it('названия по типам; сбой одного типа не роняет остальные', async () => {
        const bitrix = bitrixOf();
        const reader = new CallClientTitlesReader(
            bitrix as unknown as BitrixService,
        );

        const titles = await reader.read([
            { entityType: 'deal', entityId: '7' },
            { entityType: 'lead', entityId: '8' },
            { entityType: 'company', entityId: '3' },
            { entityType: 'contact', entityId: '5' },
            { entityType: 'deal', entityId: '7' },
        ]);

        expect(Object.fromEntries(titles)).toEqual({
            'deal:7': 'Сделка Ромашка',
            'company:3': 'ООО «Лютик»',
            'contact:5': 'Петрова Анна',
        });
        expect(bitrix.deal.getList).toHaveBeenCalledTimes(1);
        expect(bitrix.deal.getList).toHaveBeenCalledWith({ ID: ['7'] }, [
            'ID',
            'TITLE',
        ]);
    });
});

describe('CallClientTitlesService', () => {
    function harness() {
        const bitrix = bitrixOf();
        const pbx = { init: jest.fn(() => Promise.resolve({ bitrix })) };
        const transcriptions = {
            findLiteByIds: jest.fn(() =>
                Promise.resolve([
                    { id: '1', entityType: 'DEAL', entityId: '7' },
                    { id: '2', entityType: 'contact', entityId: '5' },
                    { id: '3', entityType: null, entityId: null },
                ]),
            ),
        };
        const service = new CallClientTitlesService(
            pbx as unknown as PBXService,
            transcriptions as unknown as TranscriptionStoreService,
        );
        return { service, pbx, bitrix };
    }

    it('клиент — по сущности строки расшифровки; повтор за час портал не трогает', async () => {
        const { service, pbx } = harness();
        const now = Date.parse('2026-11-19T08:00:00Z');

        const first = await service.titlesFor('d', ['1', '2', '3'], now);
        const again = await service.titlesFor('d', ['1', '2'], now + 60_000);

        expect(Object.fromEntries(first)).toEqual({
            '1': 'Сделка Ромашка',
            '2': 'Петрова Анна',
        });
        expect(Object.fromEntries(again)).toEqual(Object.fromEntries(first));
        expect(pbx.init).toHaveBeenCalledTimes(1);
    });

    it('портал недоступен — строки без клиента', async () => {
        const { service, pbx } = harness();
        pbx.init.mockRejectedValueOnce(new Error('нет портала'));
        expect((await service.titlesFor('d', ['1'])).size).toBe(0);
    });
});
