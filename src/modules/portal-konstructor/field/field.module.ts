import { Module } from "@nestjs/common";
import { FieldPrismaRepository } from "./field.prisma.repository";
import { FieldRepository } from "./field.repository";


@Module({
    providers: [
        {
            provide: FieldRepository,
            useClass: FieldPrismaRepository,
        },
    ],
  
})
export class FieldModule { } 