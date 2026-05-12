import { Module } from '@nestjs/common';
import { ParseFieldsService } from './services/parse-fields.service';

@Module({
    providers: [ParseFieldsService],
    exports: [ParseFieldsService],
})
export class ParseFieldExcelModule {}
