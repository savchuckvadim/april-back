import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/';
import { PbxSkapSmartService } from './service/pbx-skap-smart.service';

/**
 * Канонический pbx-модуль сущности «смарт СКАП» (skap): типизация полей и
 * событий (type/*), install-ready конфиг без Excel и рантайм-резолв через
 * PortalModel с fallback на локальное зеркало PortalDB.
 * Потребители: skap-lib (installer/writer), event-service, admin.
 */
@Module({
    imports: [PBXModule, PortalStoreModule, PortalSmartModule, PbxFieldModule],
    providers: [PbxSkapSmartService],
    exports: [PbxSkapSmartService],
})
export class PbxSkapSmartModule {}
