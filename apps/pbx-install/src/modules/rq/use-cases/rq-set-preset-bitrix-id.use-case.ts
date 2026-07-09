import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    PortalRqResponseDto,
    PortalRqService,
} from '@lib/portal-lib/pbx-domain/portal-rq';
import { RQ_PRESET_TEMPLATE } from '@/apps/rq/install';
import { SetRqPresetBitrixIdDto } from '../dto/set-rq-preset-bitrix-id.dto';

/**
 * Ручная привязка bitrixId к строке `bx_rqs` по бизнес-коду пресета (upsert).
 *
 * В Bitrix ничего не создаётся и не меняется — только проверяется, что пресет
 * с таким id существует (`crm.requisite.preset.get`). Строка есть — обновляется
 * только `bitrixId`; строки нет — создаётся с дефолтами из эталона.
 */
@Injectable()
export class RqSetPresetBitrixIdUseCase {
    constructor(
        private readonly pbxService: PBXService,
        private readonly portalService: PortalStoreService,
        private readonly portalRqService: PortalRqService,
    ) {}

    async setBitrixId(
        dto: SetRqPresetBitrixIdDto,
    ): Promise<PortalRqResponseDto> {
        const portal = await this.portalService.getPortalByDomain(dto.domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        const portalId = Number(portal.id);

        const { bitrix } = await this.pbxService.init(dto.domain);
        let found = false;
        try {
            const res = await bitrix.requisitePreset.get(dto.bitrixId);
            found = !!res?.result;
        } catch {
            found = false;
        }
        if (!found) {
            throw new NotFoundException(
                `Requisite preset ${dto.bitrixId} not found in Bitrix`,
            );
        }

        const existing = await this.portalRqService.findByCodePortalOrNull(
            portalId,
            dto.code,
        );
        if (existing) {
            return this.portalRqService.update(existing.id, {
                bitrixId: dto.bitrixId,
            });
        }

        const tpl = RQ_PRESET_TEMPLATE.find(t => t.code === dto.code);
        if (!tpl) {
            throw new NotFoundException(
                `Unknown RQ preset code: ${dto.code}`,
            );
        }
        return this.portalRqService.create({
            portalId,
            code: tpl.code,
            name: tpl.name,
            type: tpl.type,
            bitrixId: dto.bitrixId,
            xmlId: tpl.xmlId,
            entityTypeId: tpl.entityTypeId,
            countryId: String(tpl.countryId),
            isActive: true,
            sort: tpl.sort,
        });
    }
}
