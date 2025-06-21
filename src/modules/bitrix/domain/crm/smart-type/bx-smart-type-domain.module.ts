import { Module } from "@nestjs/common";
import { BxSmartTypeService } from "./services/bx-smart-type.service";

@Module({
    imports: [],
    providers: [
        BxSmartTypeService
    ],
    exports: [
        BxSmartTypeService
    ]
})
export class BitrixSmartTypeDomainModule { }