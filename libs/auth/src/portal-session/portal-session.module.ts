import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { BitrixProfileClient } from './bitrix-profile.client';
import { PortalSessionController } from './portal-session.controller';
import { PortalSessionGuard } from './portal-session.guard';
import { PortalSessionService } from './portal-session.service';

/**
 * Сервисная половина portal-context сессии: выпуск токена по AUTH_ID
 * фрейма и guard мутирующих ручек. Без контроллеров — импортируется
 * модулями, чьи контроллеры помечены `@PortalSessionProtected()`
 * (ai/rules/app-api-surface.md: поверхность API не растёт).
 *
 * Токены подписываются общим секретом (`AuthModule.forIssuer()`,
 * AUTH_JWT_SECRET → SSO), поэтому сессия, открытая одним приложением,
 * валидна в другом.
 */
@Module({
    imports: [AuthModule.forIssuer()],
    providers: [BitrixProfileClient, PortalSessionService, PortalSessionGuard],
    exports: [PortalSessionService, PortalSessionGuard],
})
export class PortalSessionModule {}

/**
 * Ручка обмена `POST auth/portal-session` — подключается один раз в
 * корневом модуле приложения, которое открывает сессии фрейму
 * (kpi-report-sales). Отделена от сервисной половины, чтобы feature-модули
 * не тянули контроллер за собой.
 */
@Module({
    imports: [PortalSessionModule],
    controllers: [PortalSessionController],
})
export class PortalSessionApiModule {}
