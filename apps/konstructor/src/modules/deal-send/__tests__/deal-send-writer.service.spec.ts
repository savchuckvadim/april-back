import { BitrixService } from '@lib/bitrix';
import { DealSendWriterService } from '../services/deal-send-writer.service';
import { DealSendJobDto } from '../dto/deal-send-job.dto';

const makeBitrix = () => {
    const bitrix = {
        deal: { update: jest.fn().mockResolvedValue({ result: true }) },
        item: { update: jest.fn().mockResolvedValue({ result: true }) },
        productRow: { set: jest.fn().mockResolvedValue({ result: true }) },
    };
    return {
        bitrix,
        writer: new DealSendWriterService(bitrix as unknown as BitrixService),
    };
};

const job = (overrides: Partial<DealSendJobDto> = {}): DealSendJobDto => ({
    domain: 'gsr.bitrix24.ru',
    dealId: 217301,
    fields: { UF_CRM_1: 'Гарант-Офис', COMPANY_ID: '117699' },
    productRows: [{ productName: 'Гарант-Офис', price: 7000, quantity: 12 }],
    ...overrides,
});

describe('DealSendWriterService', () => {
    it('пишет поля и строки, возвращает их число', async () => {
        const { bitrix, writer } = makeBitrix();

        await expect(writer.write(job())).resolves.toEqual({
            fields: 2,
            rows: 1,
        });
        expect(bitrix.deal.update).toHaveBeenCalledWith(217301, {
            UF_CRM_1: 'Гарант-Офис',
            COMPANY_ID: '117699',
        });
        expect(bitrix.productRow.set).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: 217301, ownerType: 'D' }),
        );
    });

    // Легаси писал строки отдельно от полей; раньше сбой deal.update отменял
    // и строки — вероятная причина «товары то пишутся, то нет».
    it('сбой полей не отменяет запись строк, но задание падает для повтора', async () => {
        const { bitrix, writer } = makeBitrix();
        bitrix.deal.update.mockRejectedValueOnce(new Error('QUERY_LIMIT'));

        await expect(writer.write(job())).rejects.toThrow(
            /сделка 217301: поля — QUERY_LIMIT/,
        );
        expect(bitrix.productRow.set).toHaveBeenCalledTimes(1);
    });

    it('сбой строк тоже роняет задание с понятной причиной', async () => {
        const { bitrix, writer } = makeBitrix();
        bitrix.productRow.set.mockRejectedValueOnce({
            response: { data: { error: 'ACCESS_DENIED' } },
        });

        await expect(writer.write(job())).rejects.toThrow(
            /строки — .*ACCESS_DENIED/,
        );
        expect(bitrix.deal.update).toHaveBeenCalledTimes(1);
    });

    it('строки не переданы — их не трогаем', async () => {
        const { bitrix, writer } = makeBitrix();

        await expect(
            writer.write(job({ productRows: undefined })),
        ).resolves.toEqual({ fields: 2, rows: null });
        expect(bitrix.productRow.set).not.toHaveBeenCalled();
    });

    it('полей нет — deal.update не зовём', async () => {
        const { bitrix, writer } = makeBitrix();

        await writer.write(job({ fields: {} }));

        expect(bitrix.deal.update).not.toHaveBeenCalled();
        expect(bitrix.productRow.set).toHaveBeenCalledTimes(1);
    });

    it('смарт: поля через crm.item.update, строки с ownerType смарта', async () => {
        const { bitrix, writer } = makeBitrix();

        await writer.write(
            job({
                target: {
                    kind: 'smart',
                    entityTypeId: 1036,
                    smartId: 77,
                    ownerType: 'T40c',
                },
            }),
        );

        expect(bitrix.deal.update).not.toHaveBeenCalled();
        expect(bitrix.item.update).toHaveBeenCalledWith(
            77,
            1036,
            expect.any(Object),
        );
        expect(bitrix.productRow.set).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: 77, ownerType: 'T40c' }),
        );
    });
});
