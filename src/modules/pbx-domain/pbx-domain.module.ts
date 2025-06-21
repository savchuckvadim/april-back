import { Module } from "@nestjs/common";
import { PbxFieldModule } from "./field/pbx-field.module";


@Module({
    imports: [PbxFieldModule],
    exports: [PbxFieldModule],
})
export class PbxDomainModule { }