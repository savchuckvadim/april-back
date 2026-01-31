import { Module } from "@nestjs/common";
import { BxTaskModule } from "./task.module";


@Module({
    imports: [BxTaskModule],
    exports: [BxTaskModule],
})
export class BxTaskDomainModule { }
