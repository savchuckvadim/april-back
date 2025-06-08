import { DocumentTotalRowService } from "./product-rows/total-row.service";
import { Module } from "@nestjs/common";
import { DocumentInfoblockService } from "./infoblocks/infoblock.service";
import { DocumentClientBxRqService } from "./bx-client-rq/bx-client-rq.service";
@Module({

    providers: [
        DocumentTotalRowService,
        DocumentInfoblockService,
        DocumentClientBxRqService
    ],
    exports: [
        DocumentTotalRowService,
        DocumentInfoblockService,
        DocumentClientBxRqService
    ],
})
export class DocumentGenerateModule { }


