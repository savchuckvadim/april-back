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
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category';
import { AiAdminModule, TranscriptionAdminModule } from '@lib/call-lib';
import { AiRagAdminModule } from '@lib/ai-rag';
import { AdminGarantPackageModule } from '@lib/garant/package';
import { AdminGarantProfPriceModule } from '@lib/garant/price';
import { ProviderAdminModule } from '@lib/portal-lib/konstructor/provider';
import { PortalKeysAdminModule } from '@lib/portal-lib/store/keys/portal-keys.admin.module';
import { MarketplaceModerationModule } from './marketplace-moderation/marketplace-moderation.module';
import { BitrixAppSecretsModule } from './bitrix-app-secrets/bitrix-app-secrets.module';

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
        BxRqModule,
        TimezoneModule,
        PortalCategoryModule,
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
        // Гарант/портал: админ-контроллеры, вынесенные из сервисных модулей
        // (чтобы не протекали в Swagger konstructor).
        AdminGarantPackageModule,
        AdminGarantProfPriceModule,
        ProviderAdminModule,
        PortalKeysAdminModule,
        // Маркетплейс «Менеджер Гарант»: модерация заявок на подключение
        // (approve/block, прогресс установки) — этап 3 онбординга.
        MarketplaceModerationModule,
        // OAuth-креды приложений (bitrix_app_secrets) — источник истины
        // для рефреша маркетплейс-токенов; секреты в ответах маскируются.
        BitrixAppSecretsModule,
    ],
})
export class AdminAddModule {}
