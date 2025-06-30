import { Module } from '@nestjs/common';
import { GsrServiceController } from './gsr.controller';
import { GsrParseService } from './gsr-parse.service';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { GsrMigrateUseCase } from './gsr-migrate.use-case';
import { GsrBitrixService } from './gsr-bitrix.service';
import { GsrMigrateBitrixDealService } from './services/bitrix/gsr-migrate-bxdeal.service';
import { GsrMigrateBitrixCompanyService } from './services/bitrix/gsr-migrate-bxcompany.service';
import { GsrMigrateBitrixProductRowService } from './services/bitrix/gsr-migrate-bxproduct-row.service';
import { GsrMigrateBitrixContactService } from './services/bitrix/gsr-migrate-bxcontact.service';
import { ContactsCreateUseCase } from './contacts-create.use-case';
import { TaskUseCase } from './task.use-case';
import { GsrSheetsMigrateUseCase } from './gsr-sheets-migrate.use-case';
import { AlfaServiceController } from './alfa/alfa-migrate.controller';
import { AlfaMigrateUseCase } from './alfa/alfa-migrate.use-case';
import { AlfaBitrixService } from './alfa/services/alfa-bitrix.service';
import { AlfaMigrateBitrixCompanyService } from './alfa/services/bitrix/alfa-migrate-bxcompany.service';
import { AlfaParseService } from './alfa/services/alfa-parse.service';


@Module({
  imports: [
    PBXModule
  ],
  controllers: [GsrServiceController, AlfaServiceController],
  providers: [
    GsrParseService,
    GsrMigrateUseCase,
    GsrBitrixService,
    GsrMigrateBitrixCompanyService,
    GsrMigrateBitrixDealService,
    GsrMigrateBitrixProductRowService,
    GsrMigrateBitrixContactService,
    ContactsCreateUseCase,
    TaskUseCase,
    GsrSheetsMigrateUseCase,


    
    AlfaMigrateUseCase,
    AlfaBitrixService,
    AlfaMigrateBitrixCompanyService,
    AlfaParseService
  ],
})
export class GsrModule { }
