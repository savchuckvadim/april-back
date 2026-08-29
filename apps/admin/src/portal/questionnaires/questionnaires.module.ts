import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalQuestionnairesModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.module';
import { QuestionnaireFieldSourceService } from './services/questionnaire-field-source.service';
import { QuestionnaireBitrixFieldsReader } from './services/questionnaire-bitrix-fields.reader';
import { QuestionnaireFieldWriter } from './services/questionnaire-field-writer';
import { QuestionnaireFieldsService } from './services/questionnaire-fields.service';
import { QuestionnaireCheckService } from './services/questionnaire-check.service';
import { QuestionnaireFieldsController } from './controllers/questionnaire-fields.controller';
import { QuestionnaireCheckController } from './controllers/questionnaire-check.controller';

/**
 * Битрикс-часть админского каталога анкет: источник полей
 * (`questionnaire-fields`) и сверка привязок
 * (`questionnaires/:id/check`).
 *
 * Почему здесь, а не в сторе портала: обеим нужен PBXService, а стор
 * анкет импортируют прикладные приложения — Битрикс им в DI не нужен.
 * CRUD и реестр остались в `PortalQuestionnairesAdminModule`
 * (см. ai/rules/app-api-surface.md).
 *
 * `PortalQuestionnairesModule` подключается ГЛУБОКИМ путём — это лёгкий
 * модуль без контроллеров, он даёт только `PortalQuestionnairesService`.
 * Всё остальное, что нужно контроллерам, импортируется здесь явно: через
 * `imports` чужого модуля видно лишь то, что тот экспортирует, и нехватка
 * вылезет UnknownDependenciesException уже в рантайме.
 */
@Module({
    imports: [PrismaModule, PBXModule, PortalQuestionnairesModule],
    providers: [
        QuestionnaireFieldSourceService,
        QuestionnaireBitrixFieldsReader,
        QuestionnaireFieldWriter,
        QuestionnaireFieldsService,
        QuestionnaireCheckService,
    ],
    controllers: [QuestionnaireFieldsController, QuestionnaireCheckController],
})
export class AdminQuestionnairesModule {}
