import { Module } from "@nestjs/common";
import { ContractGenerateController } from "./contract-generate.controller";
import { ContractGenerateService } from "./contract-generate.service";
import { PBXModule } from "src/modules/pbx/pbx.module";
import { StorageModule } from "src/core/storage/storage.module";
import { FileLinkModule } from "src/core/file-link/file-link.module";
import { LibreOfficeModule } from "src/modules/libre-office/libre-office.module";
import { ProviderModule } from "../../domain/provider";
import { DocumentGenerateModule } from "../../document-generate/document-generate.module";
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
    providers: [ContractGenerateService],
    exports: [ContractGenerateService]
})
export class ContractGenerateModule { }
