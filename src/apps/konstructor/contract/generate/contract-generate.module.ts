import { Module } from "@nestjs/common";
import { ContractGenerateController } from "./contract-generate.controller";
import { ContractGenerateService } from "./services/contract-generate.service";
import { PBXModule } from "src/modules/pbx/pbx.module";
import { StorageModule } from "src/core/storage/storage.module";
import { FileLinkModule } from "src/core/file-link/file-link.module";
import { LibreOfficeModule } from "src/modules/libre-office/libre-office.module";
import { ProviderModule } from "../../../../modules/portal-konstructor/provider";
import { DocumentGenerateModule } from "../../document-generate/document-generate.module";
import { DocumentProductRowService } from "../../document-generate/product-rows/product-row.service";
import { ContractRqService } from "./services/contract-rq.service";
import { ContractRqHeaderService } from "./services/contract-rq-header.service";
import { ContractSpecificationService } from "./services/contract-specification.service";
import { ContractGenerateUseCase } from "./use-case/contract-generate.use-case";
import { ContractBitrixPushService } from "./services/contract-bitrix-push.service";
@Module({
    imports: [
        PBXModule,
        StorageModule,
        FileLinkModule,
        LibreOfficeModule,
        ProviderModule,
        DocumentGenerateModule
    ],
    controllers: [ContractGenerateController],
    providers: [
        ContractGenerateUseCase,
        ContractGenerateService,
        ContractBitrixPushService,
        DocumentProductRowService,
        ContractRqService,
        ContractRqHeaderService,
        ContractSpecificationService
    ],
    exports: [ContractGenerateService]
})
export class ContractGenerateModule { }
