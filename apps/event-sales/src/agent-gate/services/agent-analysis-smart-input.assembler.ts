import { Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import { AiService, TranscriptionPipelineView } from '@lib/call-lib';
import { CallReportDealFamilyService } from '@lib/call-lib/call-report/services/call-report-deal-family.service';
import { CallReportDealVerifyService } from '@lib/call-lib/call-report/services/call-report-deal-verify.service';
import { CallReportSmartItemInput } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { AgentCallAnalysisDto } from '../dto/agent-analysis-request.dto';
import {
    AgentAnalysisCrmContextLoader,
    callOwnerIds,
} from './agent-analysis-crm-context.loader';
import { AgentCallActivity } from './agent-analysis-intake.types';
import { AgentAnalysisLinkResolver } from './agent-analysis-link.resolver';
import {
    buildAgentSmartItemInput,
    pickGigachatResults,
    resolveCallDirection,
} from './agent-analysis-smart-input.mapper';

/** Собранный вход писателя и контекст звонка для таймлайнов. */
export interface AgentSmartItemAssembly {
    input: CallReportSmartItemInput;
    managerId: number | undefined;
    activity: AgentCallActivity;
}

/** Инжектируемые сервисы оркестратора, нужные сборке. */
export interface AgentSmartInputAssemblerDeps {
    aiService: AiService;
    dealFamily: CallReportDealFamilyService;
    dealVerify: CallReportDealVerifyService;
}

/**
 * Сборка входа писателя смарта по строке транскрипции и разбору: первичный
 * RAG, CRM-контекст сущности звонка, активность, связи по воронкам и
 * ответственный. Один шаг на приём разбора (intake) и на дописывание полей
 * карточек (rewrite): переписанная позже карточка обязана совпадать со
 * свежей, иначе два пути разъедутся.
 *
 * НЕ Injectable: инстанс Битрикса домена приходит аргументом (правило
 * CLAUDE.md про this.bitrix и race condition).
 */
export class AgentAnalysisSmartInputAssembler {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly logger: Logger,
        private readonly deps: AgentSmartInputAssemblerDeps,
    ) {}

    async assemble(
        domain: string,
        row: TranscriptionPipelineView,
        agentName: string,
        dto: AgentCallAnalysisDto,
    ): Promise<AgentSmartItemAssembly> {
        const loader = new AgentAnalysisCrmContextLoader(
            this.bitrix,
            this.logger,
        );
        const links = new AgentAnalysisLinkResolver(
            this.deps.dealFamily,
            this.deps.dealVerify,
        );
        const gigachat = pickGigachatResults(
            await this.deps.aiService.findByTranscriptionIds([row.id]),
        );
        const context = await loader.loadEntityContext(row);
        const activity = await loader.loadActivity(row);
        const { family, managerId } = await links.resolve(
            domain,
            row,
            context,
            dto,
        );
        return {
            input: buildAgentSmartItemInput({
                row,
                rowLeadId: callOwnerIds(row).leadId,
                family,
                dealContext: { ...context, managerId },
                callDirection: resolveCallDirection(activity),
                gigachat,
                agentName,
                dto,
            }),
            managerId,
            activity,
        };
    }
}
