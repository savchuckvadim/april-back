import { Module } from "@nestjs/common";
import { BxFileService } from "./bx-file.service";

@Module({
    providers: [BxFileService],
    exports: [BxFileService]
})
export class BxFileDomainModule { }