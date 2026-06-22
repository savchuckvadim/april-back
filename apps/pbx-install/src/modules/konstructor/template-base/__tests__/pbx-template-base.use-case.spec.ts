import { NotFoundException } from '@nestjs/common';
import { PbxTemplateBaseUseCase } from '../use-cases/pbx-template-base.use-case';

describe('PbxTemplateBaseUseCase', () => {
    let repository: {
        findManyWithRelations: jest.Mock;
        findById: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        delete: jest.Mock;
        attachField: jest.Mock;
        detachField: jest.Mock;
    };
    let useCase: PbxTemplateBaseUseCase;

    const template = (over: Record<string, unknown> = {}) => ({
        id: '1',
        name: 'Шаблон',
        code: 'tpl',
        ...over,
    });

    beforeEach(() => {
        repository = {
            findManyWithRelations: jest.fn(),
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            attachField: jest.fn(),
            detachField: jest.fn(),
        };
        useCase = new PbxTemplateBaseUseCase(repository as never);
    });

    it('list возвращает пустой массив, если репозиторий вернул null', async () => {
        repository.findManyWithRelations.mockResolvedValue(null);
        expect(await useCase.list()).toEqual([]);
    });

    it('getById бросает NotFound, если шаблон не найден', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.getById(5)).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it('update проверяет существование перед обновлением', async () => {
        repository.findById.mockResolvedValue(template());
        repository.update.mockResolvedValue(template({ name: 'Новый' }));

        const res = await useCase.update(1, { name: 'Новый' });

        expect(repository.findById).toHaveBeenCalledWith(1);
        expect(repository.update).toHaveBeenCalledWith(1, { name: 'Новый' });
        expect(res.name).toBe('Новый');
    });

    it('remove бросает NotFound и не удаляет, если шаблона нет', async () => {
        repository.findById.mockResolvedValue(null);
        await expect(useCase.remove(9)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('attachField привязывает поле и возвращает актуальный шаблон', async () => {
        repository.findById.mockResolvedValue(template());

        const res = await useCase.attachField(1, 2);

        expect(repository.attachField).toHaveBeenCalledWith(1, 2);
        expect(res.id).toBe('1');
    });

    it('detachField отвязывает поле', async () => {
        repository.findById.mockResolvedValue(template());

        await useCase.detachField(1, 2);

        expect(repository.detachField).toHaveBeenCalledWith(1, 2);
    });
});
