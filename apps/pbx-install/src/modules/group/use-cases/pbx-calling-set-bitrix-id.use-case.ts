import { Injectable, NotFoundException } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    ECallingGroup,
    PortalCallingResponseDto,
    PortalCallingService,
} from '@lib/portal-lib/pbx-domain/portal-calling';
import { SetCallingBitrixIdDto } from '../dto/set-calling-bitrix-id.dto';

/**
 * Имя/заголовок группы звонков по умолчанию — используются только при СОЗДАНИИ строки
 * `callings`, если её ещё нет. Для уже существующей строки имя/заголовок не меняются.
 */
const CALLING_GROUP_DEFAULTS: Readonly<
    Record<ECallingGroup, { name: string; title: string }>
> = {
    [ECallingGroup.sales]: { name: 'ОП Звонки', title: 'ОП Звонки' },
    [ECallingGroup.service]: { name: 'ОС Звонки', title: 'ОС Звонки' },
    [ECallingGroup.tmc]: { name: 'ТМЦ Звонки', title: 'ТМЦ Звонки' },
};

/**
 * Ручная привязка bitrixId к строке `callings` по коду группы звонков (upsert).
 *
 * В Bitrix ничего не создаётся и не меняется. По ключу type + group + portalId:
 * строка есть — обновляется только `bitrixId`; строки нет — создаётся.
 * Ключ уникален, поэтому двух строк одной группы на портале быть не может.
 */
@Injectable()
export class PbxCallingSetBitrixIdUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalCallingService: PortalCallingService,
    ) {}

    async setBitrixId(
        dto: SetCallingBitrixIdDto,
    ): Promise<PortalCallingResponseDto> {
        const portal = await this.portalService.getPortalByDomain(dto.domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);
        return this.portalCallingService.setBitrixIdByKey(
            portalId,
            dto.group,
            dto.bitrixId,
            CALLING_GROUP_DEFAULTS[dto.group],
        );
    }
}
