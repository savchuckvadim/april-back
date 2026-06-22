import { NotFoundException } from '@nestjs/common';
import { PbxCounterUseCase } from '../use-cases/pbx-counter.use-case';

describe('PbxCounterUseCase', () => {
    let repository: {
        findMany: jest.Mock;
        findById: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
    };
    let useCase: PbxCounterUseCase;

    const counter = (over: Record<string, unknown> = {}) => ({
        id: '1',
        name: 'counter',
        title: 'Счётчик',
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
        useCase = new PbxCounterUseCase(repository as never);
    });

    it('list возвращает пустой массив, если репозиторий вернул null', async () => {
        repository.findMany.mockResolvedValue(null);
        expect(await useCase.list()).toEqual([]);
    });

    it('getById бросает NotFound, если счётчик не найден', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.getById(5)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('update проверяет существование перед обновлением', async () => {
        repository.findById.mockResolvedValue(counter());
        repository.update.mockResolvedValue(counter({ title: 'Новый' }));

        const res = await useCase.update(1, { title: 'Новый' });

        expect(repository.findById).toHaveBeenCalledWith(1);
        expect(repository.update).toHaveBeenCalledWith(1, { title: 'Новый' });
        expect(res.title).toBe('Новый');
    });

    it('remove бросает NotFound и не удаляет, если счётчика нет', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.remove(9)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(repository.delete).not.toHaveBeenCalled();
    });
});
