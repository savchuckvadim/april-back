import { Module } from '@nestjs/common';
import { ZakupkiOfferCreateService } from './services/zakupki-offer.service';
import { ZakupkiOfferController } from './controller/zakupki-offer.controller';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { StorageModule } from 'src/core/storage/storage.module';
import { FileLinkModule } from 'src/core/file-link/file-link.module';
import { LibreOfficeModule } from 'src/modules/libre-office/libre-office.module';
import { DocumentGenerateModule } from '../document-generate/document-generate.module';
import { GarantModule } from 'src/modules/garant/garant.module';
import { QueueModule } from '@/modules/queue/queue.module';
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
