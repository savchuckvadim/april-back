import { Module } from '@nestjs/common';
import { PbxUserRepository } from './repositories/pbx-user.repository';
import { PbxUserPrismaRepository } from './repositories/pbx-user.prisma.repository';
import { PbxFieldModule } from '../field';
import { PbxUserService } from './services/pbx-user.service';
import { PbxUserController } from './controllers/pbx-user.controller';
import { PbxUserFieldController } from './controllers/pbx-user-field.controller';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';

@Module({
    imports: [PbxFieldModule, PortalStoreModule],
    controllers: [PbxUserController, PbxUserFieldController],
    providers: [
        {
            provide: PbxUserRepository,
            useClass: PbxUserPrismaRepository,
        },
        PbxUserService,
    ],
    exports: [PbxUserService],
})
export class PbxUserModule {}
