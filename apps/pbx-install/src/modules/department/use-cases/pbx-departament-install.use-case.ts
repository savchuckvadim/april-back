import { Injectable, NotFoundException } from '@nestjs/common';

import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    EDepartamentGroup,
    PortalDepartamentResponseDto,
    PortalDepartamentService,
    UpdatePortalDepartamentDto,
} from '@lib/portal-lib/pbx-domain/portal-departament';
import {
    PBX_DEPARTAMENTS,
    PbxDepartamentGroupEnum,
} from '@lib/portal-lib/pbx/app-type';

/**
 * Установка отдела (`departaments`) на портал.
 *
 * В отличие от групп звонков в Bitrix ничего не создаётся: `bitrixId`
 * (id уже существующего отдела ОП/ОС) приходит из тела запроса.
 * Сценарий:
 * 1. Резолвим портал по domain.
 * 2. Берём фиксированные name/title из app-type карты.
 * 3. Upsert строки в `departaments` по ключу type + group + portalId.
 */
@Injectable()
export class PbxDepartamentInstallUseCase {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalDepartamentService: PortalDepartamentService,
    ) {}

    async installDepartament(
        domain: string,
        group: PbxDepartamentGroupEnum,
        bitrixId: number,
    ): Promise<{ portalResult: PortalDepartamentResponseDto }> {
        const portalId = await this.resolvePortalId(domain);
        const definition = PBX_DEPARTAMENTS[group];

        const portalResult = await this.portalDepartamentService.upsertByKey(
            portalId,
            group as unknown as EDepartamentGroup,
            {
                name: definition.name,
                title: definition.title,
                bitrixId,
            },
        );

        return { portalResult };
    }

    async update(
        id: number,
        dto: UpdatePortalDepartamentDto,
    ): Promise<PortalDepartamentResponseDto> {
        return this.portalDepartamentService.update(id, dto);
    }

    async delete(id: number): Promise<void> {
        await this.portalDepartamentService.delete(id);
    }

    private async resolvePortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException('Portal not found');
        }
        return Number(portal.id);
    }
}
