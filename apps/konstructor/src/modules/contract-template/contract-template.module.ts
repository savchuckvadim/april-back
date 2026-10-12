import { Module } from '@nestjs/common';
import { StorageModule } from '@lib/core/storage/storage.module';
import { ContractTemplateController } from './controllers/contract-template.controller';
import { ContractTemplateRepository } from './repositories/contract-template.repository';
import { ContractTemplatePrismaRepository } from './repositories/contract-template.prisma.repository';
import { ContractTemplateAgentService } from './services/contract-template-agent.service';
import { ContractTemplateDownloadService } from './services/contract-template-download.service';
import { ContractTemplateFilesService } from './services/contract-template-files.service';
import { ContractTemplateQueryService } from './services/contract-template-query.service';
import { ContractTemplateService } from './services/contract-template.service';

/**
 * CRUD шаблонов договора.
 *
 * `PrismaModule` и `ConfigModule` в imports не нужны: первый объявлен
 * `@Global()` (libs/core/prisma), второй подключён через
 * `ConfigModule.forRoot({ isGlobal: true })` в корневом модуле приложения —
 * ровно как у `InvoiceTemplateModule`. `StorageModule` импортируется явно.
 *
 * Сервис подбора шаблона при генерации живёт отдельно
 * (`@lib/portal-lib/konstructor/document-template`) и в этот модуль не
 * тянется: CRUD и резолвер — разные ответственности, и подбор нужен
 * генераторам документов, а не админке.
 */
@Module({
    imports: [StorageModule],
    controllers: [ContractTemplateController],
    providers: [
        {
            provide: ContractTemplateRepository,
            useClass: ContractTemplatePrismaRepository,
        },
        ContractTemplateQueryService,
        ContractTemplateFilesService,
        ContractTemplateAgentService,
        ContractTemplateService,
        ContractTemplateDownloadService,
    ],
    exports: [
        ContractTemplateService,
        ContractTemplateQueryService,
        ContractTemplateDownloadService,
        ContractTemplateRepository,
    ],
})
export class ContractTemplateModule {}
