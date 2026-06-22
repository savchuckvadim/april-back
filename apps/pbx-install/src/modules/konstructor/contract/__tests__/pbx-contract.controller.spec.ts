import { PbxContractController } from '../controllers/pbx-contract.controller';

describe('PbxContractController', () => {
    let contractService: { findMany: jest.Mock; findById: jest.Mock };
    let controller: PbxContractController;

    const contract = (over: Record<string, unknown> = {}) => ({
        id: BigInt(1),
        name: 'Поставка',
        number: 1,
        title: 'Договор поставки',
        code: 'SUPPLY',
        type: 'base',
        withPrepayment: true,
        template: null,
        order: 1,
        coefficient: 1,
        prepayment: 1,
        discount: 1.5,
        productName: null,
        product: null,
        service: null,
        description: null,
        comment: null,
        comment1: null,
        comment2: null,
        created_at: null,
        updated_at: null,
        ...over,
    });

    beforeEach(() => {
        contractService = { findMany: jest.fn(), findById: jest.fn() };
        controller = new PbxContractController(contractService as never);
    });

    it('list мапит сущности в DTO (BigInt id → number, discount → number)', async () => {
        contractService.findMany.mockResolvedValue([contract()]);

        const res = await controller.list();

        expect(contractService.findMany).toHaveBeenCalledTimes(1);
        expect(res).toHaveLength(1);
        expect(res[0].id).toBe(1);
        expect(res[0].discount).toBe(1.5);
        expect(typeof res[0].discount).toBe('number');
    });

    it('getById мапит одну сущность в DTO', async () => {
        contractService.findById.mockResolvedValue(contract({ id: BigInt(9) }));

        const res = await controller.getById(9);

        expect(contractService.findById).toHaveBeenCalledWith(9);
        expect(res.id).toBe(9);
    });
});
