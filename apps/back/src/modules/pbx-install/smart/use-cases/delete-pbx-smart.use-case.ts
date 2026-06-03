import { Injectable } from '@nestjs/common';
import { SmartGroupEnum, SmartNameEnum } from '../dto/install-smart.dto';
import { PortalStoreService } from '@/modules/portal-konstructor/portal/portal-store.service';
import { PBXService } from '@/modules/pbx';
import { PortalSmartService } from '@/modules/pbx-domain/portal-smart';
import { GetPbxSmartUseCase } from './get-pbx-smart.use-case';
import { convertToBigint } from '@/shared';
/**
 * PBX Delete Smart Use Case
 * удаление в db portal
 * и в bitrix

 * return:
 * - deleted: id of deleted smart in db
 * - bxSmart: id of deleted smart in bitrix
 * - portalSmarts: all smarts in portal
 *
 * @param smartName - name of smart
 * @param domain - domain of portal
 * @param smartGroup - group of smart
 * @param withBitrix - if true, delete in bitrix
 * @returns {Promise<{deleted: string, bxSmart: string, portalSmarts: any}>}
 * @example
 * const result = await this.deletePbxSmartUseCase.execute(
 *     SmartNameEnum.SALES,
 *     'example.com',
 *     SmartGroupEnum.SALES,
 *     true,
 * );
 */

@Injectable()
export class DeletePbxSmartUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly pbx: PBXService,
        private readonly portalSmartService: PortalSmartService,
        private readonly getPbxSmartUseCase: GetPbxSmartUseCase,
    ) {}

    async execute(
        smartName: SmartNameEnum,
        domain: string,
        smartGroup?: SmartGroupEnum,
        withBitrix: boolean = false, // удалить в битриксе тоже
    ) {
        //todo delete in bitrix:
        // 1. get smart from db
        // 2. search and delete in bitrix by bitrixId from db
        // 3. delete from db: is done in deleteSmartByPortalAndName
        // return await this.portalSmartService.deleteSmartByPortalAndName(
        //     domain,
        //     smartName,
        //     smartGroup,
        // );
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new Error('Portal not found');
        }
        const getPbxSmartDto = {
            domain,
            smartName,
            smartGroup,
            withBitrix,
        };
        //get smart from portalDb and Bitrix by pbx get use case
        const { bxSmart, portalSmart } =
            await this.getPbxSmartUseCase.getPbxSmartByName(getPbxSmartDto);

        //delete smart from portalDb
        if (portalSmart) {
            await this.portalSmartService.deleteSmartCascade(
                convertToBigint(portalSmart.id),
            );
        }
        //delete smart from Bitrix если есть withBitrix и в битриксе есть smart - удалить в битриксе
        if (withBitrix && bxSmart) {
            const { bitrix } = await this.pbx.init(domain);
            const bxSmartResponse = await bitrix.smartType.delete({
                id: Number(bxSmart.id),
            });
            console.log('bxSmartResponse', bxSmartResponse);
        }
        //опять get только уже берем все чтобы посмотреть что осталось
        const { portalSmarts, bxSmarts } =
            await this.getPbxSmartUseCase.getPbxAllSmarts(domain, withBitrix);

        return {
            deleted: portalSmart.id,
            bxSmarts,
            portalSmarts,
        };
    }
}
