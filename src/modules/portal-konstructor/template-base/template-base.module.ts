import { Module } from "@nestjs/common";
import { TemplateBasePrismaRepository } from "./template-base.prisma.repository";
import { TemplateBaseRepository } from "./template-base.repository";
import { TemplateBaseController } from "./template-base.controller";
import { TemplateBaseService } from "./template-base.service";

@Module({
    controllers: [
        TemplateBaseController
    ],
    providers: [
        {
            provide: TemplateBaseRepository,
            useClass: TemplateBasePrismaRepository,
        },
        TemplateBaseService
    ],
    exports: [TemplateBaseRepository],
})
export class TemplateBaseModule { } 