import { Injectable, NotFoundException } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    ECallingGroup,
    PortalCallingResponseDto,
    PortalCallingService,
} from '@lib/portal-lib/pbx-domain/portal-calling';
import {
    PBX_CALLING_GROUPS,
    PbxCallingGroupEnum,
} from '@lib/portal-lib/pbx/app-type';
import { PBXService } from '@/modules/pbx';

/**
 * Установка группы звонков (рабочей группы Bitrix `sonet_group`) на портал.
 *
 * Двунаправленная синхронизация:
 * 1. Резолвим портал по domain.
 * 2. Берём фиксированные name/title группы из app-type карты.
 * 3. Ищем группу в Bitrix по NAME: есть — update, нет — create; получаем bitrixId.
 * 4. Upsert строки в таблице `callings` по ключу type + group + portalId.
 */
@Injectable()
export class PbxGroupInstallUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalCallingService: PortalCallingService,
    ) {}

    async installGroup(
        domain: string,
        group: PbxCallingGroupEnum,
    ): Promise<{
        bxResult: { bitrixId: number; created: boolean };
        portalResult: PortalCallingResponseDto;
    }> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        const definition = PBX_CALLING_GROUPS[group];

        // локальный инстанс битрикса по domain — НЕ держим в this (race condition)
        const { bitrix } = await this.pbxService.init(domain);

        // ищем существующую рабочую группу в Bitrix по имени
        const found = await bitrix.sonetGroup.get({ NAME: definition.name });
        const existing = found.result?.[0];

        let bitrixId: number;
        let created: boolean;
        if (existing) {
            bitrixId = Number(existing.ID);
            await bitrix.sonetGroup.update(bitrixId, {
                NAME: definition.name,
            });
            created = false;
        } else {
            const addResult = await bitrix.sonetGroup.add({
                NAME: definition.name,
                DESCRIPTION: definition.title,
            });
            bitrixId = Number(addResult.result);
            created = true;
        }

        // upsert зеркала в PortalDB (таблица callings)
        const portalResult = await this.portalCallingService.upsertByKey(
            portalId,
            group as unknown as ECallingGroup,
            {
                name: definition.name,
                title: definition.title,
                bitrixId,
            },
        );

        return {
            bxResult: { bitrixId, created },
            portalResult,
        };
    }
}
