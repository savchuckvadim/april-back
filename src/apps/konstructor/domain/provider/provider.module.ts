import { Module } from "@nestjs/common";
import { ProviderService } from "./provider.service";
import { ProviderRepository } from "./provider.repository";
import { ProviderPrismaRepository } from "./provider.prisma.repository";
@Module({

    // controllers: [InfoblockController],
    providers: [ProviderService, {
        provide: ProviderRepository,
        useClass: ProviderPrismaRepository,
    }],
    exports: [ProviderService],
})
export class ProviderModule { }
