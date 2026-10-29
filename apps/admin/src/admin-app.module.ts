import { Module } from '@nestjs/common';
import { AdminClientModule } from './client/client.module';
import { AdminAppModule } from './app/app.module';
import { AdminPortalModule } from './portal/portal.module';
import { BtxDealModule } from './portal/btx-deals/btx-deal.module';
import { BtxLeadModule } from './portal/btx-leads/btx-lead.module';
import { BtxCompanyModule } from './portal/btx-companies/btx-company.module';
import { BtxContactModule } from './portal/btx-contacts/btx-contact.module';
import { BtxRpaModule } from './portal/btx-rpas/btx-rpa.module';
import { BitrixFieldModule } from './portal/bitrixfields/bitrixfield.module';
import { SmartModule } from './portal/smarts/smart.module';
import { SkapImportAdminModule } from './skap/skap-import-admin.module';
import { BxRqModule } from './portal/bx-rqs/bx-rq.module';
import { TimezoneModule } from './portal/timezones/timezone.module';
import { ContractModule } from './garant/contracts/contract.module';
import { MeasureModule } from './garant/measures/measure.module';
import { PortalMeasureModule } from './portal/portal-measures/portal-measure.module';
import { PortalContractModule } from './portal/portal-contracts/portal-contract.module';
import { AdminGarantRegionModule } from './garant/regions/admin-garant-region.module';
import { AdminGarantComplectModule } from './garant/complect/admin-garant-complect.module';
import { AdminGarantSupplyModule } from './garant/supply/admin-garant-supply.module';
import { AdminGarantInfogroupModule } from './garant/info-group/admin-garant-infogroup.module';
import { AdminGarantInfoblockModule } from './garant/infoblock/admin-garant-infoblock.module';
import {
    PortalCategoryModule,
    PortalCategoryAdminModule,
} from '@lib/portal-lib/pbx-domain/category';
// Админ-слои PBX-сущностей PortalDB: контроллеры живут ТОЛЬКО здесь,
// чтобы не торчать в Swagger event-sales и других приложений
// (ai/rules/app-api-surface.md).
import { PortalLeadAdminModule } from '@lib/portal-lib/pbx-domain/portal-lead';
import { PortalContactAdminModule } from '@lib/portal-lib/pbx-domain/portal-contact';
import { PortalCompanyAdminModule } from '@lib/portal-lib/pbx-domain/portal-company';
import { PortalDealAdminModule } from '@lib/portal-lib/pbx-domain/portal-deal';
import { PortalSmartAdminModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PortalStoreAdminModule } from '@lib/portal-lib/store/portal-store.admin.module';
import { VendorSettingsModule } from '@lib/portal-lib/store/vendor-settings/vendor-settings.module';
import { VendorSettingsAdminModule } from './vendor-settings/vendor-settings-admin.module';
import { AiAdminModule, TranscriptionAdminModule } from '@lib/call-lib';
import { AiRagAdminModule } from '@lib/ai-rag';
import { SalesAiAnalyticsAdminModule } from '@lib/sales-ai-analytics';
import { AdminGarantPackageModule } from '@lib/garant/package';
import { AdminGarantProfPriceModule } from '@lib/garant/price';
import { CatalogTableAdminModule } from '@lib/garant/catalog-table';
import { CatalogSeedAdminModule } from '@lib/garant/catalog-install';
import { ProviderAdminModule } from '@lib/portal-lib/konstructor/provider';
import { PortalKeysAdminModule } from '@lib/portal-lib/store/keys/portal-keys.admin.module';
import { PortalAiSettingsAdminModule } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.admin.module';
import { PortalAiProvidersAdminModule } from './portal/ai-providers/ai-providers.module';
import { PortalAppSettingsAdminModule } from '@lib/portal-lib/store/app-settings/portal-app-settings.admin.module';
import { PortalQuestionnairesAdminModule } from '@lib/portal-lib/store/questionnaires/portal-questionnaires.admin.module';
import { PortalBadgesAdminModule } from '@lib/portal-lib/store/badges/portal-badges.admin.module';
import { VendorSuperUserAdminModule } from '@lib/bx-department/vendor-super-user.admin.module';
import { AdminQuestionnairesModule } from './portal/questionnaires/questionnaires.module';
import { MarketplaceModerationModule } from './marketplace-moderation/marketplace-moderation.module';
import { BitrixAppSecretsModule } from './bitrix-app-secrets/bitrix-app-secrets.module';
import { MaintenanceModule } from './maintenance';
import { HooksAdminModule } from '@lib/portal-lib/hooks';
import { SupportMonitorAdminModule } from '@lib/support';
import { LogsAdminModule } from '@lib/logger/query';

@Module({
    imports: [
        AdminClientModule,
        AdminAppModule,
        AdminPortalModule,
        BtxDealModule,
        BtxLeadModule,
        BtxCompanyModule,
        BtxContactModule,
        BtxRpaModule,
        BitrixFieldModule,
        SmartModule,
        SkapImportAdminModule,
        BxRqModule,
        TimezoneModule,
        PortalCategoryModule,
        PortalCategoryAdminModule,
        PortalLeadAdminModule,
        PortalContactAdminModule,
        PortalCompanyAdminModule,
        PortalDealAdminModule,
        PortalSmartAdminModule,
        PortalStoreAdminModule,
        ContractModule,
        MeasureModule,
        PortalMeasureModule,
        PortalContractModule,
        AdminGarantRegionModule,
        AdminGarantComplectModule,
        AdminGarantSupplyModule,
        AdminGarantInfogroupModule,
        AdminGarantInfoblockModule,
        // Звонки/AI: админ-CRUD транскрибаций и AI-записей (без инфраструктуры
        // транскрибации — только store-сервисы поверх Prisma).
        TranscriptionAdminModule,
        AiAdminModule,
        // База знаний RAG: документы общие и по порталам (скрипты типов
        // звонков) — управление из админки, чтение агентами через event-sales.
        AiRagAdminModule,
        // AI-аналитика ОП: аудит данных по живой БД (Фаза 0) и ручки
        // эксплуатации Фазы 3 (пересчёт и догон конвейера через общую
        // очередь sales-kpi-report, состояние прогонов, ретенция, расход
        // модели, обратная связь, золотой набор); только SUPER_USER.
        // Расчёт остаётся в воркере kpi-report-sales — админка ставит
        // джобы (решение владельца В2 от 22.09.2026).
        SalesAiAnalyticsAdminModule,
        // Гарант/портал: админ-контроллеры, вынесенные из сервисных модулей
        // (чтобы не протекали в Swagger konstructor).
        AdminGarantPackageModule,
        AdminGarantProfPriceModule,
        // Каталог «Гарант»: эталонные таблицы (скачать текущее состояние,
        // поправить, загрузить обратно) и сид справочников константной сеткой.
        CatalogTableAdminModule,
        CatalogSeedAdminModule,
        ProviderAdminModule,
        PortalKeysAdminModule,
        // Настройки AI-конвейера на портал (пороги, модели, расписание).
        // Незаданные значения падают в глобальные env приложения.
        PortalAiSettingsAdminModule,
        // Чек-лист готовности провайдеров AI портала (LLM, транскрибаторы,
        // прокси за рубеж) для формы «Поставщики AI» (29.10.2026).
        PortalAiProvidersAdminModule,
        PortalAppSettingsAdminModule,
        // Настройки уровня вендора (прокси за рубеж, ключи AI-сервисов
        // приложения): глобальный читатель для библиотек + админ-роуты
        // страницы «Настройки приложения» (29.10.2026).
        VendorSettingsModule,
        VendorSettingsAdminModule,
        // Суперпользователи April на порталах клиентов: видимость all,
        // «Смотреть как…», служебные ссылки. Раньше задавались env
        // BX_SUPER_USER_IDS без возможности править из интерфейса.
        VendorSuperUserAdminModule,
        // Портальный каталог анкет: состав вопросов плана и отчёта
        // задаётся из полей, которые владелец завёл в Битриксе руками.
        // CRUD и реестр — в сторе портала, источник полей и сверка
        // привязок — в AdminQuestionnairesModule (ему нужен PBXService).
        PortalQuestionnairesAdminModule,
        AdminQuestionnairesModule,
        // Бейджики комментария и названия события: режим «общие/свои» и
        // редактор своего набора портала (27.10.2026). Хранение — JSON-ключ
        // в portal_app_settings, миграций нет.
        PortalBadgesAdminModule,
        // Маркетплейс «Менеджер Гарант»: модерация заявок на подключение
        // (approve/block, прогресс установки) — этап 3 онбординга.
        MarketplaceModerationModule,
        // OAuth-креды приложений (bitrix_app_secrets) — источник истины
        // для рефреша маркетплейс-токенов; секреты в ответах маскируются.
        BitrixAppSecretsModule,
        // Служебные операции над общей с Laravel БД: починка пустых
        // created_at/updated_at, из-за которых python-сервис не мог разобрать
        // модель портала.
        MaintenanceModule,
        // Каталог хуков и автоматики ОП: теория, параметры, готовность
        // портала (поля, стадии, настройки) и мониторинг операций.
        HooksAdminModule,
        // Предпросмотр монитора линии поддержки (крон — в apps/bot)
        SupportMonitorAdminModule,
        // Журналы всех приложений из ClickHouse: сводка с выводами и строки
        LogsAdminModule,
    ],
})
export class AdminAddModule {}
