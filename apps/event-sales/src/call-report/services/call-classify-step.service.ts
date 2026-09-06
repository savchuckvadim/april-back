import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import {
    AiService,
    CALL_CLASSIFY_TYPE,
    CALL_REPORT_ENTITY_TYPE_DEAL,
    CallTypeRegistry,
    CallTypeRegistryService,
} from '@lib/call-lib';
import {
    CallClassificationResultDto,
    VibeCodeClient,
    VibeKeyResolverService,
} from '@lib/vibecode';
import { CallClassifyInstructionService } from './call-classify-instruction.service';
import { CallTypePrior } from './call-type-prior.util';
import { CallReportJobPayload } from '../use-cases/call-report-pipeline.use-case';

/** app-метка ais-записей конвейера. */
const APP_NAME = 'call-report';

/**
 * Порог уверенности классификатора: ниже — ответ считается неуверенным,
 * его вправе перекрыть приор из CRM и синтез глубокого разбора.
 */
export const CLASSIFY_ESCALATION_CONFIDENCE = 0.6;
/** Тип-«свалка»: для состоявшегося разговора о продаже почти всегда ошибка. */
const OTHER_CALL_TYPE = 'other';
/** Уверенность после применения приора — не ниже порога, но без фанатизма. */
const PRIOR_CONFIDENCE = { strong: 0.7, weak: 0.6 } as const;

/** Ответ классификатора с отметкой о приоре (для калибровки по ais). */
export interface ClassificationWithPrior extends CallClassificationResultDto {
    /** Что подсказывала CRM (даже если не применили). */
    priorCallType?: string;
    /** Приор перекрыл ответ модели. */
    priorApplied?: boolean;
    /** Исходный ответ модели до приора. */
    originalCallType?: string;
    originalConfidence?: number;
}

/**
 * Шаг дешёвой классификации звонка (tier-1) — вынесен из pipeline
 * use-case (одна ответственность: классификация + эскалация + персист):
 *
 * 1) инструкция — подменяемая (база знаний kind='call-classify',
 *    иначе дефолт из контракта @lib/vibecode);
 * 2) ключ VibeCode — пер-портальный (vibeKey из БД);
 * 3) приор из CRM (стадия сделки / вид лида) подстраховывает «другое» и
 *    неуверенный ответ; confidence ниже порога → needsEscalation: тип
 *    перепроверит синтез глубокого разбора по всему тексту;
 * 4) результат — ais-запись type=call-classify (тип в result,
 *    полный JSON в user_result).
 *
 * Ошибка шага НЕ роняет конвейер (возврат null) — классификация
 * опциональна, транскрипт и LLM-анализ важнее.
 *
 * Включённость приходит из настроек портала (админка); env-настроек нет.
 */
@Injectable()
export class CallClassifyStepService {
    private readonly logger = new Logger(CallClassifyStepService.name);
    /** Порог эскалации: ниже — тип перепроверяет синтез глубокого разбора. */
    private readonly escalationConfidence = CLASSIFY_ESCALATION_CONFIDENCE;

    constructor(
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly instructionService: CallClassifyInstructionService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly aiService: AiService,
    ) {}

    /**
     * enabledOverride — включённость из настроек портала (дефолт: включено).
     * crmHint — CRM-подсказка из паспорта звонка (лид-заявка, сделка):
     * дописывается к инструкции, тип всё равно решается по содержанию.
     * prior — ожидаемый тип по CRM: применяется кодом, когда модель ответила
     * «другое» или не уверена (см. applyPrior).
     */
    async run(
        text: string,
        payload: CallReportJobPayload,
        transcriptionId: string,
        enabledOverride?: boolean,
        crmHint?: string | null,
        prior?: CallTypePrior | null,
    ): Promise<ClassificationWithPrior | null> {
        if (!(enabledOverride ?? true)) return null;
        try {
            // Реестр типов (встроенные + общие/клиентские из базы знаний):
            // enum схемы и каталог типов в промпте строятся из него.
            const registry = await this.callTypeRegistry.resolve(
                payload.domain,
            );
            const instruction =
                (await this.instructionService.resolve(payload.domain)) +
                this.renderTypeCatalog(registry) +
                (crmHint ?? '');
            const apiKey = await this.vibeKeyResolver.resolve(payload.domain);
            const modelAnswer = await this.vibeCodeClient.classifyCall(
                text,
                instruction,
                apiKey,
                registry.codes,
            );
            const classification = this.applyPrior(
                modelAnswer,
                prior ?? null,
                payload.activityId,
            );

            const needsEscalation =
                classification.confidence < this.escalationConfidence;
            if (needsEscalation) {
                this.logger.warn(
                    `Классификация неуверенная (activity ${payload.activityId}): ` +
                        `${classification.callType} с confidence ${classification.confidence} < ` +
                        `${this.escalationConfidence} — тип перепроверит синтез разбора`,
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

    /**
     * Подстраховка приором из CRM. Модель видит выжимку разговора, CRM —
     * стадию сделки; когда модель ответила «другое» или не уверена, стадия
     * надёжнее. Сильный приор (стадия «Презентация», «Доработка», лид из
     * заявки) перекрывает «другое» с любой уверенностью и любой
     * неуверенный ответ; слабый (новая/тёплая сделка) — только неуверенное
     * «другое». Уверенный ответ модели приор не трогает. Исходный ответ
     * сохраняется рядом — по нему калибруется точность (type-stats).
     */
    private applyPrior(
        answer: CallClassificationResultDto,
        prior: CallTypePrior | null,
        activityId: number | string,
    ): ClassificationWithPrior {
        if (!prior) return answer;
        const unsure = answer.confidence < this.escalationConfidence;
        const isOther = answer.callType === OTHER_CALL_TYPE;
        const applicable =
            prior.callType !== answer.callType &&
            (prior.strength === 'strong'
                ? isOther || unsure
                : isOther && unsure);
        if (!applicable) return { ...answer, priorCallType: prior.callType };
        const confidence = Math.max(
            answer.confidence,
            PRIOR_CONFIDENCE[prior.strength],
        );
        this.logger.log(
            `Приор CRM применён (activity ${activityId}): ` +
                `${answer.callType} (${answer.confidence}) → ${prior.callType} — ${prior.reason}`,
        );
        return {
            ...answer,
            callType: prior.callType,
            confidence,
            reason: `${answer.reason} | по CRM: ${prior.reason}`,
            priorCallType: prior.callType,
            priorApplied: true,
            originalCallType: answer.callType,
            originalConfidence: answer.confidence,
        };
    }

    /**
     * Каталог типов из реестра — дописывается к любой инструкции
     * (и дефолтной, и подменной): актуальный набор кодов всегда из
     * одного источника, а инструкция описывает только критерии выбора.
     */
    private renderTypeCatalog(registry: CallTypeRegistry): string {
        const lines = registry.codes.map(code => {
            const type = registry.types[code];
            return `- '${code}' — ${type.title}${type.focus ? `: ${type.focus}` : ''}`;
        });
        return `\n\nДопустимые коды callType (используй ровно один из списка):\n${lines.join('\n')}`;
    }
}
