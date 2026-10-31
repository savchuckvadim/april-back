import { Module } from '@nestjs/common';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { StorageModule } from '@lib/core/storage/storage.module';
import { ProviderModule } from '@lib/portal-lib/konstructor/provider';
import { OfferWordModule } from '../offer-word/offer-word.module';
import { OfferPdfController } from './controllers/offer-pdf.controller';
import { OfferPdfDocumentModelService } from './services/offer-pdf-document-model.service';
import { OfferPdfGenerateService } from './services/offer-pdf-generate.service';
import { OfferPdfRenderService } from './services/offer-pdf-render.service';

/**
 * КП в PDF из JSX-шаблонов. Данные документа берёт у OfferWordModule
 * (OfferRenderDataService) — один расчёт цен и наполнения на оба формата.
 */
@Module({
    imports: [OfferWordModule, ProviderModule, StorageModule, FileLinkModule],
    controllers: [OfferPdfController],
    providers: [
        OfferPdfDocumentModelService,
        OfferPdfRenderService,
        OfferPdfGenerateService,
    ],
})
export class OfferPdfModule {}
