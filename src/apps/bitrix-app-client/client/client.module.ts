import { Module } from "@nestjs/common";
import { ClientPrismaRepository } from "./repositories/client.prisma.repository";
import { ClientRepository } from "./repositories/client.repository";
import { BitrixClientService } from "./services/bitrix-client.service";
import { UserModule } from "../user/user.module";
import { BitrixClientPortalService } from "./services/bitrix-client-portal.service";
import { PortalStoreModule } from "@/modules/portal-konstructor/portal/portal-store.module";
import { BitrixClientController } from "./controllers/bitrix-client.controller";

@Module({
    imports: [UserModule, PortalStoreModule],
    controllers: [BitrixClientController],
    providers: [
        BitrixClientService,
        BitrixClientPortalService,
        {
            provide: ClientRepository,
            useClass: ClientPrismaRepository,
        },
    ],
    exports: [
        BitrixClientService,
    ],
})
export class ClientModule { }
