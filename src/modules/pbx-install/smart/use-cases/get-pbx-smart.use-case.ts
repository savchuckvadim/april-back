import { PBXService } from '@/modules/pbx';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import {
    PortalSmartEntity,
    PortalSmartService,
} from '@/modules/pbx-domain/portal-smart';
import { IBXSmartFullType } from '@/modules/bitrix/domain/crm/smart-type';
import { Injectable } from '@nestjs/common';

export class GetPbxSmartByNameDto {
    domain: string;
    smartName: SmartNameEnum;
    smartGroup?: SmartGroupEnum;
    withBitrix?: boolean = false;
}
export class GetPbxSmartByNameResponseDto {
    portalSmart: PortalSmartEntity;
    bxSmart: IBXSmartFullType | null;
}
@Injectable()
export class GetPbxSmartUseCase {
    constructor(
        private readonly portalSmartService: PortalSmartService,
        private readonly pbx: PBXService,
    ) { }

    async getPbxSmartByName(
        data: GetPbxSmartByNameDto,
    ): Promise<GetPbxSmartByNameResponseDto> {
        const { domain, smartName, smartGroup, withBitrix } = data;
        let bxSmart: IBXSmartFullType | null = null;
        const portalSmart =
            await this.portalSmartService.getSmartByPortalAndName(
                domain,
                smartName,
                smartGroup,
            );
        if (withBitrix) {
            const { bitrix } = await this.pbx.init(domain);
            try {
                bxSmart = await bitrix.smartType.getSmartFull({
                    entityTypeId: portalSmart.entityTypeId,
                });
            } catch (error) {
                console.log(error);
            }
        }
        return {
            portalSmart,
            bxSmart: bxSmart ?? null,
        };
    }

    async getPbxAllSmarts(domain: string, withBitrix: boolean = false) {
        let bxSmarts: IBXSmartFullType[] | null = null;
        const portalSmarts =
            await this.portalSmartService.getSmartsByPortalDomain(domain);
        if (withBitrix) {
            const { bitrix } = await this.pbx.init(domain);

            const bxSmartResponse = await bitrix.smartType.getListFull({
                start: -1,
                order: {
                    id: 'asc',
                },
            });
            bxSmarts = bxSmartResponse || null;
        }
        return {
            portalSmarts,
            bxSmarts,
        };
    }
}
