import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { EnumLeadRequestFieldCode } from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import {
    AlignDealOwnerRequestDto,
    DealOwnerAlignResultDto,
} from '../dto/deal-owner.dto';
import {
    DealOwnerAlignService,
    IDealOwnerAlignFields,
} from '../services/deal-owner-align.service';
import { OpenCardOnceGuard } from '../../shared/open-card-once';
import { dealLeadLinkKeys } from '../../cold-hook-v2/lib/deal-link-fields';
import { managerOpName } from '../../shared/lead-request/manager-op.util';

/**
 * Компания, контакты и лиды заявки за ответственным сделки — при открытии
 * своей сделки в «Звонках». Доменная работа — в `DealOwnerAlignService`;
 * здесь инстанс Битрикса по домену и UF-имена полей из слепка портала.
 * `this.bitrix` в поле НЕ хранится (CLAUDE.md).
 */
@Injectable()
export class DealOwnerUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly once: OpenCardOnceGuard,
    ) {}

    /**
     * Недавно выравнивали для этого сотрудника — не повторяем; отметка
     * после успеха (в том числе когда выравнивать было нечего).
     */
    async align(
        dealId: number,
        dto: AlignDealOwnerRequestDto,
    ): Promise<DealOwnerAlignResultDto> {
        const scope = {
            action: 'deal-owner-align' as const,
            domain: dto.domain,
            dealId,
            userId: dto.userId,
        };
        if (await this.once.isRecent(scope)) {
            return {
                responsibleId: null,
                skipped: 'recent',
                companyMoved: false,
                contactsMoved: 0,
                leadsMoved: 0,
                warnings: [],
            };
        }
        const { bitrix, PortalModel: portal } = await this.pbx.init(dto.domain);
        const result = await new DealOwnerAlignService(
            bitrix,
            dto.domain,
            this.fieldsOf(portal),
        ).align(dealId, dto.userId);
        if (!result) {
            throw new NotFoundException(`Сделка ${dealId} не найдена`);
        }
        await this.once.remember(scope);
        return result;
    }

    /** UF-имена полей лидов и связей из слепка портала; нет поля — null. */
    private fieldsOf(portal: PortalModel): IDealOwnerAlignFields {
        const assignedAt = portal.getEntityFieldByCode(
            'lead',
            EnumLeadRequestFieldCode.op_lead_assigned_at,
        );
        return {
            dealLeadLinks: dealLeadLinkKeys(portal),
            leadManagerOp: managerOpName(portal, 'lead'),
            leadAssignedAt: assignedAt
                ? portal.getFieldBitrixId(assignedAt)
                : null,
            timezone: portal.getTimezone(),
        };
    }
}
