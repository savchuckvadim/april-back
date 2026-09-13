import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx/pbx.module';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { PortalSmartModule } from '@lib/portal-lib/pbx-domain/portal-smart';
import { PbxFieldModule } from '@lib/portal-lib/pbx-domain/field/';
import { PbxComplectVariantSmartService } from './pbx-complect-variant-smart.service';

/**
 * pbx-модуль сущности «смарт Варианты комплекта»: типизация полей и стадий,
 * install-ready конфиг без Excel (type/*) и зеркало полей в PortalDB.
 * Потребители: pbx-install (установщик), konstructor (запись вариантов),
 * admin (галерея смартов).
 */
@Module({
    imports: [PBXModule, PortalStoreModule, PortalSmartModule, PbxFieldModule],
    providers: [PbxComplectVariantSmartService],
    exports: [PbxComplectVariantSmartService],
})
export class PbxComplectVariantSmartModule {}
