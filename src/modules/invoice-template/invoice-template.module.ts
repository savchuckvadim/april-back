import { Module } from '@nestjs/common';
import { StorageModule } from '@/core/storage/storage.module';
import { InvoiceTemplateController } from './controllers/invoice-template.controller';
import { InvoiceTemplateService } from './services/invoice-template.service';
import { InvoiceTemplateDownloadService } from './services/invoice-template-download.service';
import { InvoiceTemplateRepository } from './repositories/invoice-template.repository';
import { InvoiceTemplatePrismaRepository } from './repositories/invoice-template.prisma.repository';

@Module({
    imports: [StorageModule],
    controllers: [InvoiceTemplateController],
    providers: [
        {
            provide: InvoiceTemplateRepository,
            useClass: InvoiceTemplatePrismaRepository,
        },
        InvoiceTemplateService,
        InvoiceTemplateDownloadService,
    ],
    exports: [InvoiceTemplateService, InvoiceTemplateDownloadService],
})
export class InvoiceTemplateModule {}
