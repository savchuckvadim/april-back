import { Module } from "@nestjs/common"
import { ZakupkiOfferCreateService } from "./zakupki-offer.service";
import { ZakupkiOfferController } from "./zakupki-offer.controller";
import { PBXModule } from "src/modules/pbx/pbx.module";
import { StorageModule } from "src/core/storage/storage.module";
import { FileLinkModule } from "src/core/file-link/file-link.module";
import { InfoblockModule } from "../domain/infoblock/infoblock.module";
import { LibreOfficeModule } from "src/modules/libre-office/libre-office.module";
import { DocumentGenerateModule } from "../document-generate/document-generate.module";
@Module({
    imports: [
        PBXModule,
        StorageModule,
        FileLinkModule,
        InfoblockModule,
        LibreOfficeModule,
        DocumentGenerateModule
    ],
    controllers: [ZakupkiOfferController],
    providers: [ZakupkiOfferCreateService],
    exports: [ZakupkiOfferCreateService]
})
export class ZakupkiOfferModule { }

