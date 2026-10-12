import { Module } from '@nestjs/common';
import { StorageModule } from '@lib/core/storage/storage.module';
import { SupplyReportTemplateController } from './controllers/supply-report-template.controller';
import { SupplyReportTemplateCrudService } from './services/supply-report-template-crud.service';
import { SupplyReportTemplateQueryService } from './services/supply-report-template-query.service';
import { SupplyReportTemplateFilesService } from './services/supply-report-template-files.service';
import { SupplyReportTemplateScopeService } from './services/supply-report-template-scope.service';
import { SupplyReportTemplateDownloadService } from './services/supply-report-template-download.service';
import { SupplyReportTemplateRepository } from './repositories/supply-report-template.repository';
import { SupplyReportTemplatePrismaRepository } from './repositories/supply-report-template.prisma.repository';

/**
 * CRUD-модуль шаблонов отчёта о поставке (админка).
 *
 * `SupplyReportTemplateCrudService`, а не `SupplyReportTemplateService`:
 * последнее имя занято рендером docx в
 * `document-supply-report/services/template`. Подбор шаблона при генерации
 * живёт не здесь, а в общем резолвере
 * `@lib/portal-lib/konstructor/document-template` — этот модуль только
 * ведёт справочник.
 *
 * Ответственности разнесены по сервисам (один сервис — одна
 * ответственность): Query — чтение и сборка DTO, Files — хранилище,
 * Scope — инварианты области и флага «по умолчанию», Crud — запись и смена
 * состояния, Download — транспорт файла.
 *
 * PrismaService приходит из @Global PrismaModule, поэтому в imports его нет.
 */
@Module({
    imports: [StorageModule],
    controllers: [SupplyReportTemplateController],
    providers: [
        {
            provide: SupplyReportTemplateRepository,
            useClass: SupplyReportTemplatePrismaRepository,
        },
        SupplyReportTemplateQueryService,
        SupplyReportTemplateFilesService,
        SupplyReportTemplateScopeService,
        SupplyReportTemplateCrudService,
        SupplyReportTemplateDownloadService,
    ],
    exports: [
        SupplyReportTemplateQueryService,
        SupplyReportTemplateCrudService,
        SupplyReportTemplateDownloadService,
    ],
})
export class SupplyReportTemplateModule {}
