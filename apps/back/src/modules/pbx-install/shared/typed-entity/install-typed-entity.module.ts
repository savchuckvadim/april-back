import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { PbxDomainModule } from '@/modules/pbx-domain';
import { ParseFieldExcelModule } from '../parse-field-excel';
import { PortalFieldTypedEntityInstallService } from './field/portal-field-typed-entity-install.service';

/**
 * Общая инфраструктура установки полей для «типизированных» сущностей
 * (smart-process, RPA): зеркало в портальной БД.
 *
 * Bitrix-side (`BxTypedEntityFieldsInstallService`, `BxTypedEntityFieldManageService`)
 * умышленно не Injectable и конструируются в use-case-ах вместе с конкретным `ctx`.
 */
@Module({
    imports: [PBXModule, PbxDomainModule, ParseFieldExcelModule],
    providers: [PortalFieldTypedEntityInstallService],
    exports: [PortalFieldTypedEntityInstallService],
})
export class InstallTypedEntityModule {}
