import { Module } from "@nestjs/common";
import { InfogroupController } from "./infogroup.controller";
import { InfogroupService } from "./infogroup.service";
import { InfogroupRepository } from "./infogroup.repository";
import { InfogroupPrismaRepository } from "./infogroup.prisma.repository";

@Module({
    controllers: [InfogroupController],
    providers: [
        InfogroupService,
        {
            provide: InfogroupRepository,
            useClass: InfogroupPrismaRepository
        }
    ],
    exports: [InfogroupService]
})
export class InfogroupModule { } 