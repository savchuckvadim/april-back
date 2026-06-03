import { Module } from '@nestjs/common';
import { PbxListParseTemplateController } from './controllers/pbx-list-parse-template.controller';
import { ParseListService } from './services/parse/parse-list.service';
import { ParseFieldExcelModule } from '@/modules/pbx-install/shared/parse-field-excel/parse-field-excel.module';
import { StorageModule } from '@/core/storage';

@Module({
    imports: [ParseFieldExcelModule, StorageModule],
    providers: [ParseListService],
    controllers: [PbxListParseTemplateController],
})
export class PbxListInstallModule {}
