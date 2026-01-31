import { Module } from "@nestjs/common";
import { OrkActController } from "./act/ork-act.controller";

import { PBXModule } from "@/modules/pbx";
import { OrkOnActCloseUseCase } from "./act/use-cases/ork-act-close.use-case";
import { OrkOnActCreateTaskService } from "./act/services/task.service";
import { OrkOnActCreateUseCase } from "./act/use-cases/ork-act-create.use-case";



@Module({
    imports: [
        PBXModule,
    ],
    providers: [
        OrkOnActCreateUseCase,
        OrkOnActCloseUseCase,

    ],
    controllers: [
        OrkActController,
    ],

})
export class OrkDocumentsModule { }
