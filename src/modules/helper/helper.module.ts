import { Module } from "@nestjs/common";
import { HelperController } from "./helper.controller";
import { HelperBitrixService } from "./helper-bitrix.service";
import { PBXModule } from "../pbx";

@Module({
    imports: [PBXModule],
    controllers: [HelperController],
    providers: [HelperBitrixService],
    exports: [HelperBitrixService]
})
export class HelperModule { }