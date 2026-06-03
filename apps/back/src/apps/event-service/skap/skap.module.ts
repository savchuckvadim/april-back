import { Module } from '@nestjs/common';
import { SkapController } from './skap.controller';
import { SkapExcelParseService } from './services/skap-excel-parse.service';
import { SkapExampleTemplateService } from './services/skap-example-template.service';
import { SkapZipExtractService } from './services/skap-zip-extract.service';

@Module({
    controllers: [SkapController],
    providers: [
        SkapExcelParseService,
        SkapExampleTemplateService,
        SkapZipExtractService,
    ],
})
export class SkapModule {}
