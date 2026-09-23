import { AiEntity } from '../entity/ai.entity';
import {
    buildAiRecordKeySelectors,
    chunkArray,
    pickLatestAiEntityPerKey,
    sortAiEntitiesById,
} from '../lib/ai-record-keys.util';

function makeEntity(id: string, overrides: Partial<AiEntity> = {}): AiEntity {
    const entity = new AiEntity();
    entity.id = id;
    entity.in_comment = false;
    entity.in_report = false;
    Object.assign(entity, overrides);
    return entity;
}

describe('ai-record-keys.util', () => {
    describe('buildAiRecordKeySelectors', () => {
        it('пустые и отсутствующие наборы не дают селекторов', () => {
            expect(buildAiRecordKeySelectors({})).toEqual([]);
            expect(
                buildAiRecordKeySelectors({
                    activityIds: [],
                    transcriptionIds: [''],
                    entityIds: [],
                }),
            ).toEqual([]);
        });

        it('дедуплицирует значения и отбрасывает невалидные (нечисловые transcription_id, дробные entity_id)', () => {
            expect(
                buildAiRecordKeySelectors({
                    activityIds: ['2026-09', '2026-09', ''],
                    transcriptionIds: ['42', 'abc', '42', '7'],
                    entityIds: [10, 10, 1.5, 11],
                }),
            ).toEqual([
                { column: 'activity_id', values: ['2026-09'] },
                { column: 'transcription_id', values: ['42', '7'] },
                { column: 'entity_id', values: [10, 11] },
            ]);
        });
    });

    describe('buildAiRecordKeySelectors: report_item_id', () => {
        it('id элементов смарта — отдельный селектор, пустые и повторы отброшены', () => {
            expect(
                buildAiRecordKeySelectors({
                    reportItemIds: ['128', '', '128', '129'],
                }),
            ).toEqual([{ column: 'report_item_id', values: ['128', '129'] }]);
        });
    });

    describe('chunkArray', () => {
        it('режет по size, последняя порция короче', () => {
            expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([
                [1, 2],
                [3, 4],
                [5],
            ]);
            expect(chunkArray([], 500)).toEqual([]);
        });
    });

    describe('pickLatestAiEntityPerKey', () => {
        it('на каждый ключ остаётся запись с максимальным id (сравнение как BigInt, не строк)', () => {
            const entities = [
                makeEntity('9', { activity_id: 'A' }),
                makeEntity('10', { activity_id: 'A' }),
                makeEntity('3', { activity_id: 'B' }),
                makeEntity('4', { activity_id: null }),
            ];

            const latest = pickLatestAiEntityPerKey(entities, 'activity_id');

            expect(latest.map(e => e.id)).toEqual(['3', '10']);
        });

        it('ключ по entity_id (число) группируется по значению', () => {
            const entities = [
                makeEntity('1', { entity_id: 500 }),
                makeEntity('2', { entity_id: 500 }),
                makeEntity('5', { entity_id: 501 }),
            ];

            expect(
                pickLatestAiEntityPerKey(entities, 'entity_id').map(e => e.id),
            ).toEqual(['2', '5']);
        });
    });

    it('sortAiEntitiesById сортирует численно и не мутирует вход', () => {
        const input = [makeEntity('10'), makeEntity('9'), makeEntity('100')];
        expect(sortAiEntitiesById(input).map(e => e.id)).toEqual([
            '9',
            '10',
            '100',
        ]);
        expect(input.map(e => e.id)).toEqual(['10', '9', '100']);
    });
});
