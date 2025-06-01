import { Module } from "@nestjs/common";
import { RegionPrismaRepository } from "./region.prisma.repository";
import { RegionService } from "./region.service";
import { RegionRepository } from "./region.repository";
import { RegionController } from "./region.controller";
import { RegionExcelService } from "./services/region-excel.service";
import { StorageModule } from "src/core/storage/storage.module";

@Module({
    imports: [StorageModule],
    controllers: [RegionController],
    providers: [
        RegionService,
        RegionExcelService,
        {
            provide: RegionRepository,
            useClass: RegionPrismaRepository,
        }
    ],
    exports: [RegionService],
})
export class RegionModule { } 