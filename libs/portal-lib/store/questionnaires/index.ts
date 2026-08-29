// Публичная поверхность слайса. DTO наружу не экспортируются (как у
// app-settings): контроллерам они нужны по глубокому пути
// '@lib/portal-lib/store/questionnaires/portal-questionnaires.dto',
// а прикладному коду — только сервис, реестр и типы записей.
export * from './portal-questionnaires.schema';
export * from './questionnaire-field-mirror';
export * from './portal-questionnaires.repository';
export {
    PortalQuestionnairesService,
    PortalQuestionnaireDraft,
    PortalQuestionnaireItemDraft,
    PortalQuestionnaireOptionDraft,
    PortalQuestionnaireConditionDraft,
} from './portal-questionnaires.service';
export { PortalQuestionnairesModule } from './portal-questionnaires.module';
export { PortalQuestionnairesAdminModule } from './portal-questionnaires.admin.module';
