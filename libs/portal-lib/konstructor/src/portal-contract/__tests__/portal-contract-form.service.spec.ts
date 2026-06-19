import { PortalContractFormService } from '../portal-contract-form.service';

describe('PortalContractFormService', () => {
    let prisma: {
        portal: { findMany: jest.Mock };
        contracts: { findMany: jest.Mock };
        portal_measure: { findMany: jest.Mock };
        btx_deals: { findMany: jest.Mock };
        bitrixfields: { findMany: jest.Mock };
    };
    let service: PortalContractFormService;

    const portalId = 7;

    beforeEach(() => {
        prisma = {
            portal: {
                findMany: jest
                    .fn()
                    .mockResolvedValue([
                        { id: BigInt(7), domain: 'a.bx24.ru' },
                    ]),
            },
            contracts: {
                findMany: jest
                    .fn()
                    .mockResolvedValue([
                        { id: BigInt(1), name: 'Поставка', title: 'Поставка' },
                    ]),
            },
            portal_measure: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        id: BigInt(3),
                        name: null,
                        measures: { name: 'Штука' },
                    },
                ]),
            },
            btx_deals: {
                findMany: jest.fn().mockResolvedValue([{ id: BigInt(20) }]),
            },
            bitrixfields: {
                findMany: jest.fn().mockResolvedValue([
                    {
                        bitrixfield_items: [
                            {
                                id: BigInt(100),
                                title: 'Договор',
                                code: 'dogovor',
                                bitrixId: 101,
                            },
                        ],
                    },
                ]),
            },
        };
        service = new PortalContractFormService(prisma as never);
    });

    it('собирает select-опции по всем relation-полям', async () => {
        const form = await service.getForm(portalId);

        expect(form.portals).toEqual([
            { id: 7, name: 'a.bx24.ru', title: 'a.bx24.ru' },
        ]);
        expect(form.contracts).toEqual([
            { id: 1, name: 'Поставка', title: 'Поставка' },
        ]);
        // name=null → подпись берётся из связанной measures.name
        expect(form.portalMeasures).toEqual([
            { id: 3, name: 'Штука', title: 'Штука' },
        ]);
        expect(form.contractTypeItems).toEqual([
            {
                id: 100,
                name: 'Договор',
                title: 'Договор',
                code: 'dogovor',
                bitrixId: 101,
            },
        ]);
    });

    it('запрашивает items только поля contract_type сделки портала', async () => {
        await service.getForm(portalId);

        expect(prisma.bitrixfields.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    code: 'contract_type',
                }) as object,
            }),
        );
    });

    it('возвращает пустой список типов договора, если у портала нет сделок', async () => {
        prisma.btx_deals.findMany.mockResolvedValue([]);

        const form = await service.getForm(portalId);

        expect(form.contractTypeItems).toEqual([]);
        expect(prisma.bitrixfields.findMany).not.toHaveBeenCalled();
    });
});
