import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalListService } from '@lib/portal-lib/pbx-domain';
import { ListContextResolver } from '../services/list-context.resolver';
import { BxListInstallService } from '../services/install/bx-list-install.service';
import { DeletePbxListResultDto } from '../dto/list-response.dto';

/**
 * Удаление списка как «откат инсталла»: опционально инфоблок в Bitrix
 * (lists.delete по IBLOCK_ID), затем каскад в PortalDB
 * (поля BITRIX_LIST + строка `bitrixlists`).
 */
@Injectable()
export class DeletePbxListUseCase {
    private readonly logger = new Logger(DeletePbxListUseCase.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly resolver: ListContextResolver,
        private readonly portalListService: PortalListService,
    ) {}

    async execute(
        domain: string,
        type: string,
        group: string,
        withBitrix: boolean,
    ): Promise<DeletePbxListResultDto> {
        const ctx = await this.resolver.resolve({ domain, type, group });

        let bitrixDeleted: boolean | null = null;
        if (withBitrix) {
            const bxListInstall = new BxListInstallService(
                domain,
                this.pbxService,
            );
            try {
                bitrixDeleted = await bxListInstall.deleteList(
                    ctx.listBitrixId,
                );
            } catch (e) {
                this.logger.warn(
                    `lists.delete failed for ${domain} IBLOCK_ID=${ctx.listBitrixId}: ${String(e)}`,
                );
                bitrixDeleted = false;
            }
        }

        const { deleted } = await this.portalListService.deleteListCascade(
            ctx.listDbId,
        );
        return {
            domain,
            type,
            group,
            bitrixDeleted,
            dbDeletedListId: deleted,
        };
    }
}
