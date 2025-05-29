import { Module } from "@nestjs/common";
import { InfoblockPrismaRepository } from "./infoblock.prisma.repository";
import { InfoblockService } from "./infoblock.service";
import { InfoblockRepository } from "./infoblock.repository";
import { InfoblockController } from "./infoblock.controller";
@Module({
 
    controllers: [InfoblockController],
    providers: [InfoblockService, {
        provide: InfoblockRepository,
        useClass: InfoblockPrismaRepository,
    }],
    exports: [InfoblockService],
})
export class InfoblockModule { }
