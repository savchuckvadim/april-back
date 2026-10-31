import { InfoblockEntity } from '../infoblock.entity';
import { InfoblockPrismaRepository } from '../infoblock.prisma.repository';

/**
 * Форма админки присылала не все поля, а обновление писало на их место null:
 * так стирались описания LT-сервисов. Не присланное поле менять нельзя.
 */
describe('InfoblockPrismaRepository.update', () => {
    const makeRepository = () => {
        const update = jest.fn().mockResolvedValue({});
        const repository = new InfoblockPrismaRepository({
            infoblock: { update },
        } as never);
        jest.spyOn(repository, 'findById').mockResolvedValue(
            {} as InfoblockEntity,
        );
        return { repository, update };
    };

    const sentData = (update: jest.Mock): Record<string, unknown> =>
        update.mock.calls[0][0].data;

    it('не присланные тексты и флаги не трогает', async () => {
        const { repository, update } = makeRepository();
        await repository.update({ id: '53', name: 'Интернет-семинары' });

        const data = sentData(update);
        for (const field of [
            'title',
            'description',
            'descriptionForSale',
            'shortDescription',
            'isProduct',
            'isPackage',
            'tag',
        ]) {
            expect(data[field]).toBeUndefined();
        }
    });

    it('присланный текст записывает, null очищает', async () => {
        const { repository, update } = makeRepository();
        await repository.update({
            id: '53',
            description: 'Новое описание',
            shortDescription: null,
        });

        const data = sentData(update);
        expect(data.description).toBe('Новое описание');
        expect(data.shortDescription).toBeNull();
    });
});
