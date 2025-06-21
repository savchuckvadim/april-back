import { Module } from "@nestjs/common";
import { PbxFieldPrismaRepository } from "./pbx-field.prisma.repository";
import { PbxFieldService } from "./pbx-field.service";
import { PbxFieldRepository } from "./pbx-field.repositry";

@Module({
    providers: [
        {
            provide: PbxFieldRepository,
            useClass: PbxFieldPrismaRepository
        },
        PbxFieldService
    ],
    exports: [PbxFieldService],
})
export class PbxFieldModule { }