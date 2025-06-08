import { Module } from "@nestjs/common";
import { ProviderService } from "./provider.service";
import { ProviderRepository } from "./provider.repository";
import { ProviderPrismaRepository } from "./provider.prisma.repository";
import { ProviderController } from "./provider.controller";
@Module({

    controllers: [ProviderController],
    providers: [
        ProviderService,
        {
            provide: ProviderRepository,
            useClass: ProviderPrismaRepository,
        }],
    exports: [ProviderService],
})
export class ProviderModule { }
