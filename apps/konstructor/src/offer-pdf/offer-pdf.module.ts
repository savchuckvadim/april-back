import { Module } from '@nestjs/common';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { StorageModule } from '@lib/core/storage/storage.module';
import { OfferLetterModule } from '@lib/portal-lib/konstructor';
import { ProviderModule } from '@lib/portal-lib/konstructor/provider';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { OfferWordModule } from '../offer-word/offer-word.module';
import { OfferPdfController } from './controllers/offer-pdf.controller';
import { OfferPdfAssetStore } from './lib/offer-pdf-asset-store';
import { OfferPdfAssetsCheckService } from './services/offer-pdf-assets-check.service';
import { OfferPdfDocumentModelService } from './services/offer-pdf-document-model.service';
import { OfferPdfGenerateService } from './services/offer-pdf-generate.service';
import { OfferPdfRenderService } from './services/offer-pdf-render.service';
import { OfferPdfStylePreviewService } from './services/offer-pdf-style-preview.service';

/**
 * КП в PDF из JSX-шаблонов. Данные документа берёт у OfferWordModule
 * (OfferRenderDataService) — один расчёт цен и наполнения на оба формата.
 */
@Module({
    imports: [
        OfferWordModule,
        DocumentGenerateModule,
        ProviderModule,
        OfferLetterModule,
        StorageModule,
        FileLinkModule,
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
    ],
})
export class OfferPdfModule {}
