import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa/portal-rpa.service';
import { PbxEntityType } from '@/shared/enums';
import {
    TypedEntityFieldCtx,
    TypedEntityFieldOwner,
} from '@app/pbx-install/shared';
import { bigintConvertToNumber } from '@/shared';

export interface RpaContextResolveArgs {
    domain: string;
    /** То же, что хранится в `btx_rpas.code` (имя RPA из URL, например `supply`). */
    rpaName: string;
}

export interface RpaContext {
    owner: TypedEntityFieldOwner;
    bxCtx: TypedEntityFieldCtx;
    /** Строка `btx_rpas.id`. */
    rpaDbId: bigint;
    /** Id типа RPA в Bitrix (`rpa.type`). */
    rpaTypeId: number;
}

/**
 * Резолвер «контекста» одного RPA: связка владельца в PortalDB (`btx_rpas.id`)
 * и Bitrix-адресации полей (`userfieldconfig` с `moduleId: 'rpa'`).
 *
 * Не делает upsert — если RPA нет в БД, бросает 404; строку создаёт `InstallRpaUseCase`
 * через `PortalRpaService.upsertFromBitrix` ДО вызова field-install.
 *
 * ⚠️ Формат `bitrixEntityId`/`bxFieldNamePrefix` для RPA (`RPA_<typeId>` / `UF_RPA_<typeId>_`)
 * следует сверить с актуальной документацией Bitrix `userfieldconfig` для модуля `rpa`.
 */
@Injectable()
export class RpaContextResolver {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalRpaService: PortalRpaService,
    ) {}

    async resolve(args: RpaContextResolveArgs): Promise<RpaContext> {
        const portal = await this.portalService.getPortalByDomain(args.domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal not found for domain ${args.domain}`,
            );
        }
        const rpa = await this.portalRpaService.findFirstByPortalAndCode(
            BigInt(portal.id),
            args.rpaName,
        );
        if (!rpa) {
            throw new NotFoundException(
                `RPA not found for portal=${args.domain} code=${args.rpaName}`,
            );
        }
        if (!rpa.typeId) {
            throw new NotFoundException(
                `RPA ${args.rpaName} has no typeId in PortalDB`,
            );
        }

        const rpaTypeId = Number(rpa.typeId);
        return {
            owner: {
                entityType: PbxEntityType.BTX_RPA,
                entityDbId: bigintConvertToNumber(rpa.id),
                parentType: 'rpa',
            },
            bxCtx: {
                moduleId: 'rpa',
                bitrixEntityId: `RPA_${rpaTypeId}`,
                bxFieldNamePrefix: `UF_RPA_${rpaTypeId}_`,
            },
            rpaDbId: rpa.id,
            rpaTypeId,
        };
    }
}
