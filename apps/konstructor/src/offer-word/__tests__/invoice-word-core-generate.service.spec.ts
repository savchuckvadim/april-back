import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { InvoiceTemplate } from 'generated/prisma';
import { StorageService } from '@lib/core/storage';
import { FileLinkService } from '@lib/core/file-link/file-link.service';
import { InvoiceTemplateService } from '@app/konstructor/modules/invoice-template';
import { OfferWordByTemplateGenerateDto } from '../dto/offer-word-generate-request.dto';
import { InvoiceRenderDataService } from '../services/render-data-services/invoice-render-data.service';
import { InvoiceTemplateSourceService } from '../services/invoice-word-core/invoice-template-source.service';
import { InvoiceWordCoreGenerateService } from '../services/invoice-word-core/invoice-word-core-generate.service';

const dto = (): OfferWordByTemplateGenerateDto =>
    Object.assign(new OfferWordByTemplateGenerateDto(), {
        domain: 'gsr.bitrix24.ru',
        userId: 6,
        providerId: 12,
        invoiceTemplateId: '',
    });

const templateRow: InvoiceTemplate = {
    id: 'tpl-1',
    created_at: null,
    updated_at: null,
    visibility: 'portal',
    file_path: 'konstructor/invoice-templates/tpl-1.docx',
    demo_path: null,
    type: 'word',
    name: 'Счёт',
    code: 'invoice-tpl-1',
    counter: 0,
    description: null,
    is_default: true,
    is_active: true,
    is_archived: false,
    archived_at: null,
    portal_id: null,
    agent_id: null,
    creator_bitrix_user_id: null,
    client_types: null,
    supply_types: null,
};

describe('InvoiceWordCoreGenerateService', () => {
    let resolve: jest.Mock<Promise<InvoiceTemplate | null>, [unknown]>;
    let getInvoiceRenderData: jest.Mock;
    let saveFile: jest.Mock;
    let service: InvoiceWordCoreGenerateService;

    beforeEach(async () => {
        resolve = jest.fn<Promise<InvoiceTemplate | null>, [unknown]>();
        getInvoiceRenderData = jest.fn();
        saveFile = jest.fn();

        const moduleRef = await Test.createTestingModule({
            providers: [
                InvoiceWordCoreGenerateService,
                {
                    provide: InvoiceTemplateService,
                    useValue: { toDto: jest.fn().mockReturnValue({}) },
                },
                {
                    provide: InvoiceTemplateSourceService,
                    useValue: { resolve },
                },
                { provide: StorageService, useValue: { saveFile } },
                { provide: FileLinkService, useValue: {} },
                { provide: ConfigService, useValue: {} },
                {
                    provide: InvoiceRenderDataService,
                    useValue: { getInvoiceRenderData },
                },
            ],
        }).compile();
        service = moduleRef.get(InvoiceWordCoreGenerateService);
    });

    it('шаблон не найден — счёт не строится, исключения нет, причина в ответе', async () => {
        resolve.mockResolvedValue(null);

        const result = await service.execute(dto());

        expect(result).toEqual({
            renderData: null,
            template: null,
            savedResults: [],
            notBuiltReason: 'для портала не найден шаблон счёта',
        });
        expect(getInvoiceRenderData).not.toHaveBeenCalled();
        expect(saveFile).not.toHaveBeenCalled();
    });

    it('каждый счёт несёт вид набора и его индекс', async () => {
        resolve.mockResolvedValue(templateRow);
        const price = (
            setKind: 'general' | 'alternative',
            setIndex: number,
        ) => ({
            rows: { ProductRows: [] },
            total: {},
            setKind,
            setIndex,
        });
        getInvoiceRenderData.mockResolvedValue({
            InvoiceNumber: '15',
            prices: [
                price('general', 0),
                price('general', 1),
                price('alternative', 0),
                price('alternative', 1),
            ],
        });
        const renderSingleInvoice = jest
            .spyOn(service, 'renderSingleInvoice')
            .mockImplementation(renderData =>
                Promise.resolve({
                    renderData,
                    docxPath: '/tmp/invoice.docx',
                    resultFileName: 'invoice.docx',
                    docxLink: 'https://docx/invoice',
                }),
            );

        const result = await service.execute(dto());

        expect(renderSingleInvoice).toHaveBeenCalledTimes(4);
        expect(
            result.savedResults.map(({ setKind, setIndex }) => ({
                setKind,
                setIndex,
            })),
        ).toEqual([
            { setKind: 'general', setIndex: 0 },
            { setKind: 'general', setIndex: 1 },
            { setKind: 'alternative', setIndex: 0 },
            { setKind: 'alternative', setIndex: 1 },
        ]);
        expect(result.notBuiltReason).toBeUndefined();
    });

    it('шаблон найден — в рендер каждого счёта идут общие поля и данные его набора', async () => {
        resolve.mockResolvedValue(templateRow);
        getInvoiceRenderData.mockResolvedValue({
            InvoiceNumber: '15',
            prices: [
                {
                    rows: { ProductRows: ['a'] },
                    total: { TotalSum: '100' },
                    setKind: 'general',
                    setIndex: 0,
                },
            ],
        });
        const renderSingleInvoice = jest
            .spyOn(service, 'renderSingleInvoice')
            .mockImplementation(renderData =>
                Promise.resolve({
                    renderData,
                    docxPath: '/tmp/invoice.docx',
                    resultFileName: 'invoice.docx',
                    docxLink: 'https://docx/invoice',
                }),
            );

        await service.execute(dto());

        expect(renderSingleInvoice).toHaveBeenCalledTimes(1);
        expect(renderSingleInvoice.mock.calls[0][0]).toMatchObject({
            InvoiceNumber: '15',
            ProductRows: ['a'],
            TotalSum: '100',
        });
        // вид и индекс набора не попадают в данные шаблона DOCX
        expect(renderSingleInvoice.mock.calls[0][0]).not.toHaveProperty(
            'setKind',
        );
    });
});
