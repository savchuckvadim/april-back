import { Module } from '@nestjs/common';
import { ParseFieldsService } from './services/parse-fields.service';
import { ParseSmartFieldsService } from './services/parse-smart-fields.service';

@Module({
    providers: [ParseFieldsService, ParseSmartFieldsService],
    exports: [ParseFieldsService, ParseSmartFieldsService],
})
export class ParseFieldExcelModule {}
