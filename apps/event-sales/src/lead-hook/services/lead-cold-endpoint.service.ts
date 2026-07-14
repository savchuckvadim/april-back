import { PBXService } from '@/modules/pbx/pbx.service';
import { Injectable, Logger } from '@nestjs/common';
import { ColdHooksHandlerService } from '../../cold-hook/services/silence/cold-hooks-handler.service';
import {
    EnumColdCallEntityType,
    EnumColdCallIsTmc,
} from '../../cold-hook/dto/cold.dto';
import { IColdCallData } from '../../cold-hook';
import { LeadColdCallQueryDto } from '../dto/lead-cold.dto';
import { LeadColdCallResponseDto } from '../dto/lead-cold-response.dto';
import { LeadCompanyFlowService } from './lead-company.flow.service';

/**
 * Постановщик звонка по умолчанию — как в легаси ($createdId = 1).
 */
const LEAD_COLD_CREATED_ID = '1';

/**
 * Полный event-флоу лида (аналог легаси FullEventFlowLeadController):
 * лид → компания (поиск/создание + привязка) → обычный cold-флоу
 * по компании через ColdHooksHandlerService. Без silence-буфера —
 * обработка выполняется сразу, одним хуком.
 */
@Injectable()
export class LeadColdEndpointService {
    private readonly logger = new Logger(LeadColdEndpointService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly hooksHandler: ColdHooksHandlerService,
    ) {}

    async createLeadColdCall(
        domain: string,
        dto: LeadColdCallQueryDto,
    ): Promise<LeadColdCallResponseDto> {
        const leadId = Number(dto.leadId);
        this.logger.log(
            `[LEAD-COLD] flow start domain=${domain} leadId=${leadId} ` +
                `assigned=${dto.assigned} rawDeadline="${dto.deadline}"`,
        );

        const { bitrix } = await this.pbx.init(domain);
        const leadFlow = new LeadCompanyFlowService(bitrix);
        const { companyId, companyCreated } =
            await leadFlow.ensureCompanyForLead(leadId);

        const coldCall: IColdCallData = {
            entityType: EnumColdCallEntityType.COMPANY,
            entityId: String(companyId),
            responsible: String(dto.assigned),
            created: LEAD_COLD_CREATED_ID,
            deadline: dto.deadline,
            name: dto.name,
            isTmc: EnumColdCallIsTmc.N,
        };
        const hookKey = `lead_cold_${domain.replace(/\./g, '_')}_${leadId}`;

        await this.hooksHandler.handleHooks(domain, { [hookKey]: coldCall });
        this.logger.log(
            `[LEAD-COLD] flow finished domain=${domain} leadId=${leadId} ` +
                `companyId=${companyId} companyCreated=${companyCreated}`,
        );

        return {
            processed: true,
            domain,
            leadId,
            companyId,
            companyCreated,
            rawDeadline: dto.deadline,
            message: 'Лид привязан к компании, холодный звонок поставлен.',
        };
    }
}
