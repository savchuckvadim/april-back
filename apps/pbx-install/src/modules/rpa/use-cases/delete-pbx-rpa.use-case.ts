import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalRpaService } from '@lib/portal-lib/pbx-domain/portal-rpa';
import { convertToBigint } from '@/shared';
import { RpaNameEnum } from '../dto/install-rpa.dto';
import { GetPbxRpaUseCase } from './get-pbx-rpa.use-case';

/**
 * Удаление RPA в PortalDB (поля + категория + строка `btx_rpas`) и опционально в Bitrix.
 */
@Injectable()
export class DeletePbxRpaUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly portalRpaService: PortalRpaService,
        private readonly getPbxRpaUseCase: GetPbxRpaUseCase,
    ) {}

    async execute(
        rpaName: RpaNameEnum,
        domain: string,
        withBitrix: boolean = false,
    ) {
        const { portalRpa, bxRpa } =
            await this.getPbxRpaUseCase.getPbxRpaByName({
                domain,
                rpaName,
                withBitrix,
            });

        await this.portalRpaService.deleteRpaCascade(
            convertToBigint(portalRpa.id),
        );

        if (withBitrix && bxRpa?.id) {
            const { bitrix } = await this.pbx.init(domain);
            await bitrix.rpaType.delete(Number(bxRpa.id));
        }

        const { portalRpas, bxRpas } =
            await this.getPbxRpaUseCase.getPbxAllRpas(domain, withBitrix);

        return { deleted: portalRpa.id, bxRpas, portalRpas };
    }
}
