import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/';
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category';
import { PbxPresentationSmartService } from './pbx-presentation-smart.service';

/**
 * Канонический pbx-модуль сущности «смарт Презентации» (pres): типизация
 * полей, стадий и install-ready конфиг без Excel (type/*) + рантайм-резолв
 * через PortalModel с fallback на локальное зеркало PortalDB (включая стадии
 * из btx_categories/btx_stages — как у ЗПР).
 * Потребители: event-sales (presentation-flow), pbx-install (инсталлятор),
 * admin (галерея смартов).
 */
@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalSmartModule,
        PbxFieldModule,
        // BtxCategoryRepository — стадии для stageIdByCode из зеркала БД.
        PortalCategoryModule,
    ],
    providers: [PbxPresentationSmartService],
    exports: [PbxPresentationSmartService],
})
export class PbxPresentationSmartModule {}
