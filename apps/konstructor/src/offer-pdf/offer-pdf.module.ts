import { Module } from '@nestjs/common';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { StorageModule } from '@lib/core/storage/storage.module';
import { PBXModule } from '@lib/pbx';
import {
    OfferLetterModule,
    ProviderImageModule,
} from '@lib/portal-lib/konstructor';
import { ProviderModule } from '@lib/portal-lib/konstructor/provider';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { ComplectVariantOfferStageService } from '../modules/complect-variant-lifecycle/services/complect-variant-offer-stage.service';
import { SalesDocumentFlowModule } from '../modules/sales-document-flow/sales-document-flow.module';
import { OfferWordModule } from '../offer-word/offer-word.module';
import { OfferPdfController } from './controllers/offer-pdf.controller';
import { InvoicePdfBuildService } from './invoice/services/invoice-pdf-build.service';
import { InvoicePdfModelService } from './invoice/services/invoice-pdf-model.service';
import { InvoicePdfRenderService } from './invoice/services/invoice-pdf-render.service';
import { OfferPdfAssetStore } from './lib/offer-pdf-asset-store';
import { OfferPdfAssetsCheckService } from './services/offer-pdf-assets-check.service';
import { OfferPdfDocumentModelService } from './services/offer-pdf-document-model.service';
import { OfferPdfGenerateService } from './services/offer-pdf-generate.service';
import { OfferPdfRenderService } from './services/offer-pdf-render.service';
import { OfferPdfStylePreviewService } from './services/offer-pdf-style-preview.service';

/**
 * КП в PDF из JSX-шаблонов. Данные документа берёт у OfferWordModule
 * (OfferRenderDataService) — один расчёт цен и наполнения на оба формата;
 * оттуда же склейка PDF вариантов (PdfMergeService) и данные счёта
 * (InvoiceRenderDataService): счёт PDF-КП рисуется сразу в PDF, без Word.
 */
@Module({
    imports: [
        OfferWordModule,
        DocumentGenerateModule,
        ProviderModule,
        OfferLetterModule,
        // печать, подпись и логотип поставщика для блока подписи и шапок
        ProviderImageModule,
        StorageModule,
        FileLinkModule,
        // стадия «КП» вариантам комплекта после генерации
        PBXModule,
        // событие «КП сформировано» в поток продаж event-sales
        SalesDocumentFlowModule,
    ],
    controllers: [OfferPdfController],
    providers: [
        // картинки и логотипы стилей из storage/app — один кэш на процесс
        {
            provide: OfferPdfAssetStore,
            useFactory: () => new OfferPdfAssetStore(),
        },
        // при старте — одной строкой, каких файлов стилей нет на сервере
        OfferPdfAssetsCheckService,
        OfferPdfDocumentModelService,
        OfferPdfRenderService,
        OfferPdfGenerateService,
        OfferPdfStylePreviewService,
        // счёт в PDF без Word-шаблона и LibreOffice
        InvoicePdfModelService,
        InvoicePdfRenderService,
        InvoicePdfBuildService,
        ComplectVariantOfferStageService,
    ],
})
export class OfferPdfModule {}
