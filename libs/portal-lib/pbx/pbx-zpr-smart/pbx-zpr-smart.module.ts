import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/';
import { PortalCategoryModule } from '@lib/portal-lib/pbx-domain/category';
import { PbxZprSmartService } from './pbx-zpr-smart.service';

/**
 * Канонический pbx-модуль сущности «смарт ЗПР» (zpr): типизация полей,
 * стадий и install-ready конфиг без Excel (type/*) + рантайм-резолв через
 * PortalModel с fallback на локальное зеркало PortalDB (включая стадии из
 * btx_categories/btx_stages — отличие от СКАП).
 * Потребители: event-sales (zpr-flow), pbx-install (инсталлятор), admin.
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
    providers: [PbxZprSmartService],
    exports: [PbxZprSmartService],
})
export class PbxZprSmartModule {}
