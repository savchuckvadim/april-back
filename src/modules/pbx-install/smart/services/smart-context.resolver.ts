import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { PbxEntityType } from '@/shared/enums';
import {
    TypedEntityFieldCtx,
    TypedEntityFieldOwner,
} from '@/modules/pbx-install/shared';
import { bigintConvertToNumber } from '@/shared';

export interface SmartContextResolveArgs {
    domain: string;
    /** То же, что хранится в `smarts.type` (например, `presentation`). */
    type: string;
    /** То же, что хранится в `smarts.group` (например, `sales`). */
    group: string;
}

export interface SmartContext {
    owner: TypedEntityFieldOwner;
    bxCtx: TypedEntityFieldCtx;
    /** Сырая строка из БД смарта — на случай, если оркестратору нужны другие её поля. */
    smartDbId: bigint;
    smartBitrixTypeId: number;
}

/**
 * Резолвер «контекста» одного смарта: связка владельца в портальной БД
 * (`smarts.id` + `parent_type`) и Bitrix-адресации (`CRM_<smartTypeId>` + prefix UF-имени).
 *
 * Используется во всех smart field use-case-ах. Не делает upsert — если смарта нет
 * в БД, бросает 404; первичный сценарий установки делает `InstallSmartUseCase`
 * (он сам поднимает строку через `PortalSmartService.upsertFromBitrix` ДО вызова field-install).
 */
@Injectable()
export class SmartContextResolver {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalSmartService: PortalSmartService,
    ) {}

    async resolve(args: SmartContextResolveArgs): Promise<SmartContext> {
        const portal = await this.portalService.getPortalByDomain(args.domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal not found for domain ${args.domain}`,
            );
        }
        const smart = await this.portalSmartService.findFirstByPortalTypeGroup(
            BigInt(portal.id),
            args.type,
            args.group,
        );
        if (!smart) {
            throw new NotFoundException(
                `Smart not found for portal=${args.domain} type=${args.type} group=${args.group}`,
            );
        }
        if (!smart.bitrixId) {
            throw new NotFoundException(
                `Smart ${args.type}/${args.group} has no bitrixId in PortalDB`,
            );
        }

        const smartBitrixId = bigintConvertToNumber(smart.bitrixId);
        const smartBitrixTypeId = bigintConvertToNumber(smart.entityTypeId);
        return {
            owner: {
                entityType: PbxEntityType.SMART,
                entityDbId: bigintConvertToNumber(smart.id),
                parentType: `${args.group}_${args.type}`,
            },
            bxCtx: {
                moduleId: 'crm',
                bitrixEntityId: `CRM_${smartBitrixId}`,
                bxFieldNamePrefix: `UF_CRM_${smartBitrixId}_`,
            },
            smartDbId: smart.id,
            smartBitrixTypeId: Number(smartBitrixTypeId),
        };
    }
}
