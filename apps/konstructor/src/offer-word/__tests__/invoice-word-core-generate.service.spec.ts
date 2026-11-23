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
                { provide: InvoiceTemplateService, useValue: {} },
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
});
