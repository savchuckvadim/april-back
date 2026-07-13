import { Module } from '@nestjs/common';
import { ZakupkiOfferCreateService } from './services/zakupki-offer.service';
import { ZakupkiOfferController } from './controller/zakupki-offer.controller';
import { PBXModule } from '@lib/pbx/pbx.module';
import { StorageModule } from '@lib/core/storage/storage.module';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { LibreOfficeModule } from '@app/konstructor/modules/libre-office/libre-office.module';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { GarantModule } from '@lib/garant/garant.module';
import { QueueModule } from '@lib/queue/queue.module';
import { ZakupkiOfferProcessor } from './queue/zakupki-offer.processor';
import { ZakupkiOfferQueueService } from './services/zukupki-offer.queue-service';
@Module({
    imports: [
        QueueModule,
        PBXModule,
        StorageModule,
        FileLinkModule,
        GarantModule,
        LibreOfficeModule,
        DocumentGenerateModule,
    ],
    controllers: [ZakupkiOfferController],
    providers: [
        ZakupkiOfferCreateService,
        ZakupkiOfferProcessor,
        ZakupkiOfferQueueService,
    ],
    exports: [ZakupkiOfferCreateService],
})
export class ZakupkiOfferModule {}
