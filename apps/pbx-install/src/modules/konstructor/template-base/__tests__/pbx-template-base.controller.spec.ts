import { PbxTemplateBaseController } from '../controllers/pbx-template-base.controller';

describe('PbxTemplateBaseController', () => {
    let useCase: {
        list: jest.Mock;
        getById: jest.Mock;
        create: jest.Mock;
        update: jest.Mock;
        remove: jest.Mock;
        attachField: jest.Mock;
        detachField: jest.Mock;
    };
    let controller: PbxTemplateBaseController;

    const template = (over: Record<string, unknown> = {}) => ({
        id: '7',
        name: 'Шаблон',
        code: 'tpl',
        type: 'offer',
        link: null,
        portalId: '3',
        created_at: null,
        updated_at: null,
        ...over,
    });

    beforeEach(() => {
        useCase = {
            list: jest.fn(),
            getById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            attachField: jest.fn(),
            detachField: jest.fn(),
        };
        controller = new PbxTemplateBaseController(useCase as never);
    });

    it('list мапит сущности в DTO (id и portalId → number)', async () => {
        useCase.list.mockResolvedValue([template()]);

        const res = await controller.list();

        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(7);
        expect(typeof res[0].id).toBe('number');
        expect(res[0].portalId).toBe(3);
    });

    it('create передаёт DTO в use-case и возвращает DTO', async () => {
        useCase.create.mockResolvedValue(template({ id: '10' }));

        const res = await controller.create({
            name: 'Шаблон',
            code: 'tpl',
            type: 'offer',
            portalId: 3,
        });

        expect(useCase.create).toHaveBeenCalledTimes(1);
        expect(res.id).toBe(10);
    });

    it('attachField возвращает обновлённый шаблон', async () => {
        useCase.attachField.mockResolvedValue(template());

        const res = await controller.attachField(7, 2);

        expect(useCase.attachField).toHaveBeenCalledWith(7, 2);
        expect(res.id).toBe(7);
    });
});
