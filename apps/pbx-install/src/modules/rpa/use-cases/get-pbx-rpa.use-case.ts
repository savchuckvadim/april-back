import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { IBxRpaType } from '@/modules/bitrix';
import {
    PortalRpaEntity,
    PortalRpaService,
} from '@lib/portal-lib/pbx-domain/portal-rpa';
import { RpaNameEnum } from '../dto/install-rpa.dto';

export class GetPbxRpaByNameDto {
    domain: string;
    rpaName: RpaNameEnum;
    withBitrix?: boolean = false;
}

export class GetPbxRpaByNameResponseDto {
    portalRpa: PortalRpaEntity;
    bxRpa: IBxRpaType | null;
}

@Injectable()
export class GetPbxRpaUseCase {
    constructor(
        private readonly portalRpaService: PortalRpaService,
        private readonly pbx: PBXService,
    ) {}

    async getPbxRpaByName(
        data: GetPbxRpaByNameDto,
    ): Promise<GetPbxRpaByNameResponseDto> {
        const { domain, rpaName, withBitrix } = data;
        const portalRpa = await this.portalRpaService.getRpaByPortalAndCode(
            domain,
            rpaName,
        );
        let bxRpa: IBxRpaType | null = null;
        if (withBitrix && portalRpa.bitrixId != null) {
            const { bitrix } = await this.pbx.init(domain);
            try {
                const res = await bitrix.rpaType.get(portalRpa.bitrixId);
                bxRpa = res.result?.type ?? null;
            } catch (error) {
                console.log(error);
            }
        }
        return { portalRpa, bxRpa };
    }

    async getPbxAllRpas(domain: string, withBitrix: boolean = false) {
        const portalRpas =
            await this.portalRpaService.getRpasByPortalDomain(domain);
        let bxRpas: IBxRpaType[] | null = null;
        if (withBitrix) {
            const { bitrix } = await this.pbx.init(domain);
            const res = await bitrix.rpaType.getList();
            bxRpas = res.result?.types ?? null;
        }
        return { portalRpas, bxRpas };
    }
}
