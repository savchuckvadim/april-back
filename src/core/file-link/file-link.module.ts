import { Module } from "@nestjs/common";
import { FilesController } from "./file-link.controller";
import { FileLinkService } from "./file-link.service";
import { StorageModule } from "src/core/storage/storage.module";
import { EncryptService } from "./encrypt.service";

@Module({
    imports: [
        StorageModule
    ],
    controllers: [FilesController],
    providers: [FileLinkService, EncryptService],
    exports: [FileLinkService]
})
export class FileLinkModule { }
