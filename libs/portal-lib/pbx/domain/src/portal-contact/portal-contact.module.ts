import { Module } from '@nestjs/common';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/pbx-field.module';
import { PortalContactService } from './services/portal-contact.service';
import { PortalContactController } from './controllers/portal-contact.controller';
import { PortalContactFieldController } from './controllers/portal-contact-field.controller';
import { PortalContactRepository } from './repositories/portal-contact.repository';
import { PortalContactPrismaRepository } from './repositories/portal-contact.prisma.repository';

@Module({
    imports: [PbxFieldModule],
    controllers: [PortalContactController, PortalContactFieldController],
    providers: [
        PortalContactService,
        {
            provide: PortalContactRepository,
            useClass: PortalContactPrismaRepository,
        },
    ],
    exports: [PortalContactService],
})
export class PortalContactModule {}
