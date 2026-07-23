import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from 'generated/prisma';
import { envEnabledByDefault, envFloat } from '@lib/shared';
import {
    AiService,
    CALL_CLASSIFY_TYPE,
    CALL_REPORT_ENTITY_TYPE_DEAL,
} from '@lib/call-lib';
import {
    CallClassificationResultDto,
    VibeCodeClient,
    VibeKeyResolverService,
} from '@lib/vibecode';
import { CallClassifyInstructionService } from './call-classify-instruction.service';
import { CallReportJobPayload } from '../use-cases/call-report-pipeline.use-case';

/** app-метка ais-записей конвейера. */
const APP_NAME = 'call-report';

/**
 * Шаг дешёвой классификации звонка (tier-1) — вынесен из pipeline
 * use-case (одна ответственность: классификация + эскалация + персист):
 *
 * 1) инструкция — подменяемая (база знаний kind='call-classify',
 *    иначе дефолт из контракта @lib/vibecode);
 * 2) ключ VibeCode — пер-портальный (vibeKey из БД);
 * 3) confidence ниже порога → needsEscalation: тип обязан перепроверить
 *    tier-3 (ночной агент видит флаг в пакете звонка);
 * 4) результат — ais-запись type=call-classify (тип в result,
 *    полный JSON в user_result).
 *
 * Ошибка шага НЕ роняет конвейер (возврат null) — классификация
 * опциональна, транскрипт и LLM-анализ важнее.
 *
 * Env: CALL_REPORT_CLASSIFY_ENABLED (0 — выключить),
 * CALL_REPORT_CLASSIFY_ESCALATION_CONFIDENCE (default 0.6).
 */
@Injectable()
export class CallClassifyStepService {
    private readonly logger = new Logger(CallClassifyStepService.name);
    private readonly enabled: boolean;
    private readonly escalationConfidence: number;

    constructor(
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly instructionService: CallClassifyInstructionService,
        private readonly aiService: AiService,
        configService: ConfigService,
    ) {
        this.enabled = envEnabledByDefault(
            configService.get<string>('CALL_REPORT_CLASSIFY_ENABLED'),
        );
        this.escalationConfidence = envFloat(
            configService.get<string>(
                'CALL_REPORT_CLASSIFY_ESCALATION_CONFIDENCE',
            ),
            0.6,
            { min: 0, max: 1 },
        );
    }

    async run(
        text: string,
        payload: CallReportJobPayload,
        transcriptionId: string,
    ): Promise<CallClassificationResultDto | null> {
        if (!this.enabled) return null;
        try {
            const instruction = await this.instructionService.resolve(
                payload.domain,
            );
            const apiKey = await this.vibeKeyResolver.resolve(payload.domain);
            const classification = await this.vibeCodeClient.classifyCall(
                text,
                instruction,
                apiKey,
            );

            const needsEscalation =
                classification.confidence < this.escalationConfidence;
            if (needsEscalation) {
                this.logger.warn(
                    `Классификация неуверенная (activity ${payload.activityId}): ` +
                        `${classification.callType} с confidence ${classification.confidence} < ` +
                        `${this.escalationConfidence} — эскалация на агента`,
                );
            }

            await this.aiService.create({
                provider: 'bitrix-vibecode',
                model: 'bitrix-vibecode',
                type: CALL_CLASSIFY_TYPE,
                status: 'done',
                result: classification.callType,
                user_result: JSON.parse(
                    JSON.stringify({ ...classification, needsEscalation }),
                ) as Prisma.JsonValue,
                activity_id: String(payload.activityId),
                entity_type: CALL_REPORT_ENTITY_TYPE_DEAL,
                entity_id: payload.dealId,
                domain: payload.domain,
                app: APP_NAME,
                transcription_id: transcriptionId,
            });
            this.logger.log(
                `Классификация: activity ${payload.activityId} → ${classification.callType} ` +
                    `(${classification.interlocutorRole}, confidence ${classification.confidence})`,
            );
            return classification;
        } catch (error) {
            this.logger.warn(
                `Классификация звонка не выполнена (activity ${payload.activityId}): ${(error as Error).message}`,
            );
            return null;
        }
    }
}
