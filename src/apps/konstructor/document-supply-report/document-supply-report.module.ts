import { StorageModule } from '@/core/storage/storage.module';
import { LibreOfficeModule } from '@/modules/libre-office';
import { PBXModule } from '@/modules/pbx';
import { ProviderModule } from '@/modules/portal-konstructor/provider';
import { DocumentSupplyReportController } from './controllers/document-supply-report.controller';
import { InitFormService } from './services/init-form.service';
import { GenerateUseCase } from './use-cases/generate.use-case';
import { Module } from '@nestjs/common';
import { SupplyReportDataService } from './services/data/supply-report-data.service';
import { SupplyReportPdfService } from './services/pdf/supply-report-pdf.service';
import { SupplyReportTemplateService } from './services/template/supply-report-template.service';
import { FileLinkModule } from '@/core/file-link/file-link.module';

@Module({
    imports: [
        PBXModule,
        StorageModule,
        LibreOfficeModule,
        ProviderModule,
        FileLinkModule,
    ],
    controllers: [DocumentSupplyReportController],
    providers: [
        InitFormService,
        GenerateUseCase,

        SupplyReportDataService,
        SupplyReportPdfService,
        SupplyReportTemplateService,
    ],
})
export class DocumentSupplyReportModule {}
