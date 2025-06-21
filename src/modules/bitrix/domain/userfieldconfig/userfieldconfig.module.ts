import { Module } from "@nestjs/common";
import { BitrixDomainModule } from "../bitrix-domain.module";

@Module({
    imports: [BitrixDomainModule],
    exports: [BitrixDomainModule],
})
export class UserFieldConfigModule { }