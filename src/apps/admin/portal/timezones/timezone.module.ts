import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TimezoneService } from './services/timezone.service';
import { TimezoneRepository } from './repositories/timezone.repository';
import { TimezonePrismaRepository } from './repositories/timezone.prisma.repository';
import { TimezoneController } from './controllers/timezone.controller';

@Module({
    imports: [PrismaModule],
    providers: [
        TimezoneService,
        {
            provide: TimezoneRepository,
            useClass: TimezonePrismaRepository,
        },
    ],
    controllers: [TimezoneController],
    exports: [TimezoneService, TimezoneRepository],
})
export class TimezoneModule {}

