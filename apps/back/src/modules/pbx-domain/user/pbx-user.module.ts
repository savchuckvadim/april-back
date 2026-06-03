import { Module } from '@nestjs/common';
import { PbxUserRepository } from './repositories/pbx-user.repository';
import { PbxUserPrismaRepository } from './repositories/pbx-user.prisma.repository';
import { PbxFieldModule } from '../field';
import { PbxUserService } from './services/pbx-user.service';
import { PbxUserController } from './controllers/pbx-user.controller';
import { PortalStoreModule } from '@/modules/portal-konstructor/portal/portal-store.module';

@Module({
    imports: [PbxFieldModule, PortalStoreModule],
    controllers: [PbxUserController],
    providers: [
        {
            provide: PbxUserRepository,
            useClass: PbxUserPrismaRepository,
        },
        PbxUserService,
    ],
})
export class PbxUserModule {}
