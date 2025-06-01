import { Module } from "@nestjs/common";
import { ComplectController } from "./complect.controller";
import { ComplectService } from "./services/complect.service";
import { ComplectRepository } from "./repository/complect.repository";
import { ComplectPrismaRepository } from "./repository/complect.prisma.repository";
import { InfoblockModule } from "../infoblock/";

@Module({
    imports: [
        InfoblockModule
    ],
    controllers: [ComplectController],
    providers: [
        ComplectService,
        {
            provide: ComplectRepository,
            useClass: ComplectPrismaRepository
        }
    ],
    exports: [ComplectService]
})
export class ComplectModule { } 