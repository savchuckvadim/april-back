import { Module } from "@nestjs/common";
import { SupplyController } from "./supply.controller";
import { SupplyService } from "./services/api/supply.service";
import { SupplyRepository } from "./supply.repository";
import { SupplyPrismaRepository } from "./supply.prisma.repository";
import { SupplyParseService } from "./services/update/parse.service";
import { SupplyUpdateService } from "./services/update/supply-update.service";
import { StorageModule } from "src/core/storage/storage.module";


@Module({
    imports: [
        StorageModule
    ],
    controllers: [SupplyController],
    providers: [
        SupplyService,
        SupplyParseService,
        SupplyUpdateService,
        {
            provide: SupplyRepository,
            useClass: SupplyPrismaRepository
        }
    ],
    exports: [SupplyService]
})
export class SupplyModule { } 