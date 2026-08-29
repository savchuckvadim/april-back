import { Module } from '@nestjs/common';
import { PortalQuestionnairesModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.module';
import { QuestionnairesController } from './questionnaires.controller';

/**
 * Публичное чтение портального каталога анкет для фронтов event-sales
 * (GET /questionnaires?domain=…&app=…). Пишется каталог только из админки,
 * поэтому здесь один контроллер и ни одного провайдера.
 *
 * Импортируется ЛЁГКИЙ lib-модуль глубоким путём — он даёт сервис и не
 * тянет за собой админ-контроллеры: их роуты не должны попасть в Swagger
 * приложения, по нему генерится клиент фронта (ai/rules/app-api-surface.md).
 */
@Module({
    imports: [PortalQuestionnairesModule],
    controllers: [QuestionnairesController],
})
export class EventSalesQuestionnairesModule {}
