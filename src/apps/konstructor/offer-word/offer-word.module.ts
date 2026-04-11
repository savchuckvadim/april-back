import { WordTemplateModule } from '@/modules/offer-template/word';
import { OfferWordGenerateController } from './controllers/offer-word-generate.controller';
import { OfferWordPdfPreviewController } from './controllers/offer-word-pdf-preview.controller';
import { OfferWordCoreGenerateService } from './services/offer-word-core/offer-word-core-generate.service';
import { OfferWordByTemplateGenerateUseCase } from './use-cases/offer-word-by-template-generate.use-case';
import { OfferWordEphemeralPdfDocumentService } from './services/preview-generate/offer-word-ephemeral-pdf-document.service';
import { OfferWordPdfExportService } from './services/pdf-export/offer-word-pdf-export.service';
import { Module } from '@nestjs/common';
import { QueueModule } from '@/modules/queue/queue.module';
import { RedisModule } from '@/core/redis/redis.module';
import { GarantModule } from '@/modules/garant';
import { PortalKonstructorModule } from '@/modules/portal-konstructor/portal-konstructor.module';
import { ProviderModule } from '@/modules/portal-konstructor/provider';
import { StorageModule } from '@/core/storage/storage.module';
import { FileLinkModule } from '@/core/file-link/file-link.module';
import { OfferRenderInfoblocksService } from './services/render-data-services/offer-render-infoblocks.service';
import { InfoblocksRenderDataService } from '../document-generate/infoblocks/infoblock-render-data.service';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { OfferRenderPriceService } from './services/render-data-services/offer-render-price.service';
import { LibreOfficeModule } from '@/modules/libre-office';
import { OfferRenderDataService } from './services/render-data-services/offer-render-data.service';
import { InnerDealModule } from '@/modules/inner-deal/inner-deal.module';
import { OfferRenderProviderRqService } from './services/render-data-services/offer-render-provider-rq.service';
import { OfferRenderRecipientService } from './services/render-data-services/offer-render-recipient.service';
import { OfferRenderManagerService } from './services/render-data-services/offer-render-manager.service';
import { OfferWordEphemeralPdfProcessor } from './queue/offer-word-ephemeral-pdf.processor';
import { OfferWordEphemeralPdfQueueService } from './services/queue/offer-word-ephemeral-pdf-queue.service';
import { OfferGenerateQueueService } from './services/queue/offer-generate-queue.service';
import { InvoiceWordCoreGenerateService } from './services/invoice-word-core/invoice-word-core-generate.service';
import { InvoiceRenderDataService } from './services/render-data-services/invoice-render-data.service';
import { InvoiceTemplateModule } from '@/modules/invoice-template';
import { OfferGenerateProcessor } from './queue/offer-generate.processor';
import { OfferBxTimelineService } from './services/bitrix/offer-bx-timeline.service';
import { PBXModule } from '@/modules/pbx';
import { BitrixDocumentSaveFlowService } from './services/bitrix/bitrix-document-save-flow.service';
import { DocumentBuildService } from './services/document-build.service';

@Module({
    imports: [
        QueueModule,
        RedisModule,
        WordTemplateModule,
        GarantModule,
        PortalKonstructorModule,
        ProviderModule,
        StorageModule,
        FileLinkModule,
        DocumentGenerateModule,
        LibreOfficeModule,
        InnerDealModule,
        InvoiceTemplateModule,
        PBXModule,
    ],
    controllers: [OfferWordGenerateController, OfferWordPdfPreviewController],
    providers: [
        OfferWordCoreGenerateService,
        OfferWordByTemplateGenerateUseCase,
        OfferWordEphemeralPdfDocumentService,
        OfferWordPdfExportService,
        OfferRenderInfoblocksService,
        InfoblocksRenderDataService,
        OfferRenderPriceService,
        OfferRenderDataService,
        OfferRenderProviderRqService,
        OfferRenderRecipientService,
        OfferRenderManagerService,
        OfferWordEphemeralPdfProcessor,
        OfferGenerateProcessor,
        OfferWordEphemeralPdfQueueService,
        OfferGenerateQueueService,
        InvoiceWordCoreGenerateService,
        InvoiceRenderDataService,
        OfferBxTimelineService,
        BitrixDocumentSaveFlowService,
        DocumentBuildService,
    ],
})
export class OfferWordModule {}
