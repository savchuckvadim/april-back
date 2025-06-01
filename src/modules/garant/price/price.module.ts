import { Module } from "@nestjs/common";
import { StorageModule } from "src/core/storage/storage.module";
import { PriceService } from "./price.service";
import { PriceRepository } from "./price.repository";
import { PricePrismaRepository } from "./price.prisma.repository";
import { PriceInstallService } from "./price.install.service";

@Module({
    imports: [
        StorageModule
    ],
    providers: [
        PriceService,
        PriceInstallService,
        {
            provide: PriceRepository,
            useClass: PricePrismaRepository
        }
    ],
    exports: [
        PriceService,
        PriceInstallService
    ]
})
export class PriceModule { }