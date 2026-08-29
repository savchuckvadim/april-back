import { Module } from '@nestjs/common';
import { PortalQuestionnairesModule } from './portal-questionnaires.module';
import { PortalQuestionnairesController } from './portal-questionnaires.controller';

/**
 * Админ-слой доставки портального каталога анкет
 * (`admin/portal/:portalId/questionnaires`). Импортирует лёгкий
 * {@link PortalQuestionnairesModule} ради сервиса и регистрирует ТОЛЬКО
 * админ-контроллеры. Подключать в приложении админки, а НЕ в
 * event-sales/konstructor: прикладным приложениям нужен сервис
 * (`resolve(domain, appCode)`), а не редактор анкет в их Swagger
 * (см. ai/rules/app-api-surface.md).
 *
 * Важно: `imports` лёгкого модуля даёт этому модулю только то, что тот
 * ЭКСПОРТИРУЕТ (сервис). Понадобится контроллеру что-то ещё — это отдельный
 * импорт здесь, иначе Nest упадёт UnknownDependenciesException уже в
 * рантайме.
 *
 * Здесь только CRUD и реестр. Сверка привязок с живым Битриксом
 * (`POST /:id/check`) и источник полей (`questionnaire-fields`) живут в
 * `apps/admin/src/portal/questionnaires`: им нужен PBXService, а тащить
 * Битрикс в стор портала нельзя — его импортируют прикладные приложения.
 */
@Module({
    imports: [PortalQuestionnairesModule],
    controllers: [PortalQuestionnairesController],
})
export class PortalQuestionnairesAdminModule {}
