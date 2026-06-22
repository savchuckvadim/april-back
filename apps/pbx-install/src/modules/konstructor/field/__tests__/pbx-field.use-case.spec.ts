import { NotFoundException } from '@nestjs/common';
import { PbxFieldUseCase } from '../use-cases/pbx-field.use-case';

describe('PbxFieldUseCase', () => {
    let repository: {
        findMany: jest.Mock;
        findById: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
    };
    let useCase: PbxFieldUseCase;

    const field = (over: Record<string, unknown> = {}) => ({
        id: '1',
        number: 1,
        name: 'Поле',
        code: 'field',
        ...over,
    });

    beforeEach(() => {
        repository = {
            findMany: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        };
        useCase = new PbxFieldUseCase(repository as never);
    });

    it('list возвращает пустой массив, если репозиторий вернул null', async () => {
        repository.findMany.mockResolvedValue(null);
        expect(await useCase.list()).toEqual([]);
    });

    it('getById бросает NotFound, если поле не найдено', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.getById(5)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('update проверяет существование перед обновлением', async () => {
        repository.findById.mockResolvedValue(field());
        repository.update.mockResolvedValue(field({ name: 'Новое' }));

        const res = await useCase.update(1, { name: 'Новое' });

        expect(repository.findById).toHaveBeenCalledWith(1);
        expect(repository.update).toHaveBeenCalledWith(1, { name: 'Новое' });
        expect(res.name).toBe('Новое');
    });

    it('remove бросает NotFound и не удаляет, если поля нет', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.remove(9)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(repository.delete).not.toHaveBeenCalled();
    });
});
