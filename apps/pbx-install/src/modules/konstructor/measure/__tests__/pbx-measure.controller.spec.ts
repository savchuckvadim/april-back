import { PbxMeasureController } from '../controllers/pbx-measure.controller';

describe('PbxMeasureController', () => {
    let measureService: { findMany: jest.Mock; findById: jest.Mock };
    let controller: PbxMeasureController;

    const measure = (over: Record<string, unknown> = {}) => ({
        id: BigInt(1),
        name: 'Штука',
        shortName: 'шт',
        fullName: 'Штука',
        code: '796',
        type: 'base',
        created_at: null,
        updated_at: null,
        ...over,
    });

    beforeEach(() => {
        measureService = { findMany: jest.fn(), findById: jest.fn() };
        controller = new PbxMeasureController(measureService as never);
    });

    it('list мапит сущности в DTO (BigInt id → number)', async () => {
        measureService.findMany.mockResolvedValue([measure()]);

        const res = await controller.list();

        expect(measureService.findMany).toHaveBeenCalledTimes(1);
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(1);
        expect(typeof res[0].id).toBe('number');
        expect(res[0].name).toBe('Штука');
    });

    it('getById мапит одну сущность в DTO', async () => {
        measureService.findById.mockResolvedValue(measure({ id: BigInt(7) }));

        const res = await controller.getById(7);

        expect(measureService.findById).toHaveBeenCalledWith(7);
        expect(res.id).toBe(7);
    });
});
