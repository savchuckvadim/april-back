import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/';
import { PbxAicallSmartService } from './service/pbx-aicall-smart.service';

/**
 * Канонический pbx-модуль сущности «смарт AI-анализ звонков» (aicall):
 * типизация полей/справочников (type/*), install-ready конфиг без Excel
 * и рантайм-резолв через PortalModel с fallback на локальное зеркало
 * PortalDB. Потребители: call-lib (installer/writer), event-sales, admin.
 */
@Module({
    imports: [PBXModule, PortalStoreModule, PortalSmartModule, PbxFieldModule],
    providers: [PbxAicallSmartService],
    exports: [PbxAicallSmartService],
})
export class PbxAicallSmartModule {}
