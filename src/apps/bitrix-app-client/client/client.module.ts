import { Module } from "@nestjs/common";
import { ClientPrismaRepository } from "./repositories/client.prisma.repository";
import { ClientRepository } from "./repositories/client.repository";
import { BitrixClientService } from "./services/bitrix-client.service";
import { UserModule } from "../user/user.module";

@Module({
    imports: [UserModule],
    providers: [
        BitrixClientService,
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
