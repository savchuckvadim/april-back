// supply-report.module.ts

import { Module } from '@nestjs/common';
import { GenerateSupplyReportUseCase } from './use-cases/generate-supply-report/generate-supply-report.use-case';
import { SupplyReportController } from './domain/interfaces/controllers/supply-report.controller';
// import { DocxTemplateService } from './infrastructure/services/docx-template.service';
// import { LibreOfficeService } from './infrastructure/services/libreoffice.service';
// import { BitrixGateway } from './infrastructure/services/supply-report.gateway';

@Module({
    controllers: [SupplyReportController],
    providers: [
        GenerateSupplyReportUseCase,
        // DocxTemplateService,
        // LibreOfficeService,
        // BitrixGateway,
    ],
    exports: [GenerateSupplyReportUseCase],
})
export class SupplyReportModule { }
