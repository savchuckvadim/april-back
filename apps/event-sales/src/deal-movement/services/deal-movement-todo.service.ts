import { Injectable } from '@nestjs/common';
import {
    activeAnalysisByTranscription,
    AGENT_ANALYSIS_TYPE,
    AiService,
} from '@lib/call-lib';
import { StructuredLlmGateway } from '@lib/llm-gateway';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    buildDealMovementTodoContent,
    checkDealMovementTodo,
    DEAL_MOVEMENT_TODO_PROMPT,
    DEAL_MOVEMENT_TODO_SCHEMA,
    DEAL_MOVEMENT_TODO_SCHEMA_NAME,
    parseDealMovementTodo,
    type DealMovementVerdict,
} from '@lib/sales-ai-analytics';
import type { ETimeZone } from '@lib/shared/lib/date';
import { getErrorString } from '@/shared/lib/utils/get-error-string.util';
import { toDealMovementTodoInput } from '../lib/deal-movement-todo-input';
import type { DealMovementCallPointers } from '../types/deal-movement.types';

/** Что вернула модель по одной сделке. */
export interface DealMovementTodoOutcome {
    /** Строки «что сделать» после проверки; null — блока не будет. */
    readonly actions: string[] | null;
    /** Модель не ответила или ответ не прошёл проверку (меньше двух строк). */
    readonly failed: boolean;
    /** Ошибка вызова словами; null — вызов прошёл. */
    readonly error: string | null;
}

export interface DealMovementTodoRequest {
    readonly domain: string;
    /** Модель портала (`deepAnalysisModel`); null — по умолчанию шлюза. */
    readonly model: string | null;
    readonly timezone: ETimeZone;
    readonly verdict: Pick<DealMovementVerdict, 'status' | 'reasons' | 'facts'>;
    readonly pointers: DealMovementCallPointers | null;
}

/**
 * «Что сделать» по сделке (решение 17.11.2026): перечитывает разборы
 * последнего звонка и звонка с договорённостью, один вызов модели по
 * строгой схеме, проверка строк. Статус модель не ставит — он уже
 * посчитан кодом. Сбой модели — не сбой записи: запись уйдёт без блока.
 *
 * `@Injectable` без bitrix-состояния: БД разборов и шлюз моделей.
 */
@Injectable()
export class DealMovementTodoService {
    constructor(
        private readonly llm: StructuredLlmGateway,
        private readonly aiService: AiService,
        private readonly aiSettings: PortalAiSettingsService,
    ) {}

    /** Модель портала для подсказок; настроек нет — модель шлюза. */
    async modelOf(domain: string): Promise<string | null> {
        const settings = await this.aiSettings
            .getByDomain(domain)
            .catch(() => null);
        return settings?.deepAnalysisModel ?? null;
    }

    async actionsFor(
        request: DealMovementTodoRequest,
    ): Promise<DealMovementTodoOutcome> {
        try {
            const analyses = await this.analysesOf(
                request.domain,
                request.pointers,
            );
            const content = buildDealMovementTodoContent(
                toDealMovementTodoInput({
                    verdict: request.verdict,
                    pointers: request.pointers,
                    lastCallAnalysis: analyses.lastCall,
                    agreementAnalysis: analyses.agreement,
                    timezone: request.timezone,
                }),
            );
            const response = await this.llm.structuredCompletionWithUsage(
                DEAL_MOVEMENT_TODO_PROMPT,
                content,
                DEAL_MOVEMENT_TODO_SCHEMA_NAME,
                DEAL_MOVEMENT_TODO_SCHEMA,
                request.domain,
                request.model === null ? undefined : { model: request.model },
            );
            const lines = parseDealMovementTodo(response.result);
            const actions =
                lines === null
                    ? null
                    : checkDealMovementTodo(lines, content).actions;
            return { actions, failed: actions === null, error: null };
        } catch (error) {
            return {
                actions: null,
                failed: true,
                error: getErrorString(error),
            };
        }
    }

    /** Действующие разборы двух звонков одним запросом к БД. */
    private async analysesOf(
        domain: string,
        pointers: DealMovementCallPointers | null,
    ): Promise<{ lastCall: unknown; agreement: unknown }> {
        const lastCallId = pointers?.lastCall?.id ?? null;
        const agreementId = pointers?.lastAgreement?.id ?? null;
        const ids = [
            ...new Set(
                [lastCallId, agreementId].filter(
                    (id): id is string => id !== null,
                ),
            ),
        ];
        if (ids.length === 0) return { lastCall: null, agreement: null };
        const active = activeAnalysisByTranscription(
            await this.aiService.findByDomainTypeKeys(
                domain,
                AGENT_ANALYSIS_TYPE,
                { transcriptionIds: ids },
            ),
        );
        return {
            lastCall:
                lastCallId === null
                    ? null
                    : (active.get(lastCallId)?.user_result ?? null),
            agreement:
                agreementId === null
                    ? null
                    : (active.get(agreementId)?.user_result ?? null),
        };
    }
}
