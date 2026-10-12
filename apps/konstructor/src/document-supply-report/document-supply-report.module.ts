import { StorageModule } from '@lib/core/storage/storage.module';
import { LibreOfficeModule } from '@app/konstructor/modules/libre-office';
import { PBXModule } from '@lib/pbx';
import { ProviderModule } from '@lib/portal-lib/konstructor/provider';
import { DocumentSupplyReportController } from './controllers/document-supply-report.controller';
import { InitFormService } from './services/init-form.service';
import { GenerateUseCase } from './use-cases/generate.use-case';
import { Module } from '@nestjs/common';
import { SupplyReportDataService } from './services/data/supply-report-data.service';
import { SupplyReportPdfService } from './services/pdf/supply-report-pdf.service';
import { SupplyReportTemplateService } from './services/template/supply-report-template.service';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { DocumentTemplateModule } from '@lib/portal-lib/konstructor/document-template';
import { SupplyReportTemplateSourceService } from './services/template/supply-report-template-source.service';

/**
 * `DocumentTemplateModule` — подбор шаблона отчёта из БД под флагом
 * `USE_DB_SUPPLY_REPORT_TEMPLATES` (по умолчанию ВЫКЛЮЧЕН). Он же приносит
 * `PortalStoreModule` для перехода domain → portal_id. `ConfigModule`
 * отдельно не нужен: в app.module он `forRoot({ isGlobal: true })`.
 */
@Module({
    imports: [
        PBXModule,
        StorageModule,
        LibreOfficeModule,
        ProviderModule,
        FileLinkModule,
        DocumentTemplateModule,
    ],
    controllers: [DocumentSupplyReportController],
    providers: [
        InitFormService,
        GenerateUseCase,

        SupplyReportDataService,
        SupplyReportPdfService,
        SupplyReportTemplateService,
        SupplyReportTemplateSourceService,
    ],
})
export class DocumentSupplyReportModule {}
