import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { ClientService } from './services/client.service';
import { ClientRepository } from './repositories/client.repository';
import { ClientPrismaRepository } from './repositories/client.prisma.repository';

@Module({
    imports: [PrismaModule],
    providers: [
        ClientService,
        {
            provide: ClientRepository,
            useClass: ClientPrismaRepository,
        },
    ],
    exports: [ClientService, ClientRepository],
})
export class ClientModule { }

