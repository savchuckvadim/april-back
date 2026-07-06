import { Injectable } from '@nestjs/common';
import { PortalListService } from '@lib/portal-lib/pbx-domain';
import {
    PortalListDto,
    PortalListsResponseDto,
} from '../dto/list-response.dto';
import { toPortalListDto } from '../lib/list-response.mapper';

/**
 * Чтение списков портала из PortalDB (`bitrixlists` + поля из `bitrixfields`).
 * Живое состояние Bitrix отдаёт monitoring (`pbx-list-install/monitoring/*`).
 */
@Injectable()
export class GetPbxListUseCase {
    constructor(private readonly portalListService: PortalListService) {}

    async getListsByDomain(domain: string): Promise<PortalListsResponseDto> {
        const portal =
            await this.portalListService.getListsByPortalDomain(domain);
        return {
            id: portal.id,
            domain: portal.domain ?? null,
            lists: portal.lists.map(toPortalListDto),
        };
    }

    async getListByDomainAndKeys(
        domain: string,
        type: string,
        group: string,
    ): Promise<PortalListDto> {
        const entity = await this.portalListService.getListByDomainAndKeys(
            domain,
            type,
            group,
        );
        return toPortalListDto(entity);
    }
}
