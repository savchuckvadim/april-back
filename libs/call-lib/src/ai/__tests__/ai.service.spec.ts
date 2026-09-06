import { AiService } from '../services/ai.service';
import { AiEntity } from '../entity/ai.entity';

function makeEntity(id: string, overrides: Partial<AiEntity> = {}): AiEntity {
    const entity = new AiEntity();
    entity.id = id;
    entity.in_comment = false;
    entity.in_report = false;
    Object.assign(entity, overrides);
    return entity;
}

describe('AiService.findByDomainTypeKeys', () => {
    it('проксирует домен, тип, ключи и опции в репозиторий и маппит в DTO', async () => {
        const repository = {
            findByDomainTypeKeys: jest.fn().mockResolvedValue([
                makeEntity('42', {
                    domain: 'test.bitrix24.ru',
                    type: 'ai-analytics-manager-week',
                    activity_id: '2026-W36',
                    user_id: 7,
                }),
            ]),
        };
        const service = new AiService(repository as never);

        const result = await service.findByDomainTypeKeys(
            'test.bitrix24.ru',
            'ai-analytics-manager-week',
            { activityIds: ['2026-W36'] },
            { latestOnly: true },
        );

        expect(repository.findByDomainTypeKeys).toHaveBeenCalledWith(
            'test.bitrix24.ru',
            'ai-analytics-manager-week',
            { activityIds: ['2026-W36'] },
            { latestOnly: true },
        );
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('42');
        expect(result[0].activity_id).toBe('2026-W36');
        expect(result[0].user_id).toBe(7);
    });

    it('пустой ответ репозитория — пустой массив DTO', async () => {
        const repository = {
            findByDomainTypeKeys: jest.fn().mockResolvedValue([]),
        };
        const service = new AiService(repository as never);

        await expect(
            service.findByDomainTypeKeys('d', 't', { entityIds: [1] }),
        ).resolves.toEqual([]);
    });
});
