import { Module } from '@nestjs/common';
import { ContractGenerateController } from './contract-generate.controller';
import { ContractGenerateService } from './services/contract-generate.service';
import { PBXModule } from '@lib/pbx/pbx.module';
import { StorageModule } from '@lib/core/storage/storage.module';
import { FileLinkModule } from '@lib/core/file-link/file-link.module';
import { LibreOfficeModule } from '@app/konstructor/modules/libre-office/libre-office.module';
import { ProviderModule } from '@lib/portal-lib/konstructor/provider';
import { DocumentGenerateModule } from '../../document-generate/document-generate.module';
import { DocumentProductRowService } from '../../document-generate/product-rows/product-row.service';
import { ContractRqService } from './services/contract-rq.service';
import { ContractRqHeaderService } from './services/contract-rq-header.service';
import { ContractSpecificationService } from './services/contract-specification.service';
import { ContractGenerateUseCase } from './use-case/contract-generate.use-case';
import { ContractBitrixPushService } from './services/contract-bitrix-push.service';
import { DocumentTemplateModule } from '@lib/portal-lib/konstructor/document-template';
import { ContractTemplateSourceService } from './services/contract-template-source.service';

/**
 * `DocumentTemplateModule` добавлен ради подбора шаблона договора из БД
 * (флаг `USE_DB_CONTRACT_TEMPLATES`). Он же приносит `PortalStoreModule`,
 * через который domain превращается в portal_id: до этого в модуле не было
 * ни одного портального модуля, и такой переход был недоступен.
 * `ConfigModule` отдельно не импортируется — в app.module он
 * `forRoot({ isGlobal: true })`.
 */
@Module({
    imports: [
        PBXModule,
        StorageModule,
        FileLinkModule,
        LibreOfficeModule,
        ProviderModule,
        DocumentGenerateModule,
        DocumentTemplateModule,
    ],
    controllers: [ContractGenerateController],
    providers: [
        ContractGenerateUseCase,
        ContractGenerateService,
        ContractTemplateSourceService,
        ContractBitrixPushService,
        DocumentProductRowService,
        ContractRqService,
        ContractRqHeaderService,
        ContractSpecificationService,
    ],
    exports: [ContractGenerateService],
})
export class ContractGenerateModule {}
