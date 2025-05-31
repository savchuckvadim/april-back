import { DocumentTotalRowService } from "./product-rows/total-row.service";
import { Module } from "@nestjs/common";
import { DocumentInfoblockService } from "./infoblocks/infoblock.service";
@Module({

    providers: [
        DocumentTotalRowService,
        DocumentInfoblockService
    ],
    exports: [
        DocumentTotalRowService,
        DocumentInfoblockService
    ],
})
export class DocumentGenerateModule { }


