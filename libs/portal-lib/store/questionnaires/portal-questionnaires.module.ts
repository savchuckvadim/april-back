import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PortalRepository } from '../portal.repository';
import { PortalPrismaRepository } from '../portal.prisma.repository';
import { PortalQuestionnairesRepository } from './portal-questionnaires.repository';
import { PortalQuestionnairesPrismaRepository } from './portal-questionnaires.prisma.repository';
import { PortalQuestionnairesService } from './portal-questionnaires.service';

/**
 * ЛЁГКИЙ сервисный модуль портального каталога анкет — БЕЗ контроллеров и
 * без остального стора (ключи/outer/крипта сюда не тянутся): прикладные
 * приложения (event-sales и др.) импортируют его ради
 * `PortalQuestionnairesService.resolve(domain, appCode)` и заводят свой
 * тонкий контроллер чтения. Админ-роуты — в
 * {@link PortalQuestionnairesAdminModule}.
 */
@Module({
    imports: [RedisModule],
    providers: [
        { provide: PortalRepository, useClass: PortalPrismaRepository },
        {
            provide: PortalQuestionnairesRepository,
            useClass: PortalQuestionnairesPrismaRepository,
        },
        PortalQuestionnairesService,
    ],
    exports: [PortalQuestionnairesService],
})
export class PortalQuestionnairesModule {}
