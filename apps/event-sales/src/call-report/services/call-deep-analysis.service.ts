import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { envEnabledByDefault } from '@lib/shared';
import { KnowledgeContentService } from '@lib/ai-rag';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    buildDeepAnalysisUserContent,
    CALL_DEEP_ANALYSIS_SCHEMA,
    CALL_DEEP_ANALYSIS_SYSTEM_PROMPT,
} from '../contracts/call-deep-analysis.contract';

/** Префикс kind-ов базы знаний с методичками разбора по типам звонков. */
const DEEP_ANALYSIS_KIND_PREFIX = 'call-analysis-';

/** Тип, под которым ищем методичку, если классификатор промолчал. */
const FALLBACK_CALL_TYPE = 'other';

/**
 * Глубокий разбор звонка (7 разделов, спич, оценки) — то, что раньше
 * присылал внешний агент через POST /agent/calls/{id}/analysis. Теперь
 * считается здесь же, внутри конвейера: внешнего контура больше нет.
 *
 * Инструкция собирается из двух частей:
 * 1) базовый системный промпт из контракта (правила разбора, состав
 *    разделов — строится из констант смарта, рассинхрона быть не может);
 * 2) методички портала из базы знаний kind='call-analysis-{тип звонка}'
 *    (скрипты, критерии оценки, эталонные разборы) — подменяются без
 *    деплоя через админку «База знаний AI».
 *
 * Состав ответа зафиксирован strict JSON-схемой и от текста методички не
 * зависит: методичка влияет на содержание разбора, а не на его формат.
 *
 * Ошибка шага НЕ роняет конвейер (возврат null): транскрипт, первичный
 * RAG-анализ и базовый элемент смарта уже сохранены, разбор дольётся
 * повторным прогоном (writer работает upsert-ом по xmlId).
 *
 * Env: CALL_REPORT_DEEP_ANALYSIS_ENABLED (0 — выключить шаг).
 */
@Injectable()
export class CallDeepAnalysisService {
    private readonly logger = new Logger(CallDeepAnalysisService.name);
    private readonly enabled: boolean;

    constructor(
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly knowledgeContent: KnowledgeContentService,
        configService: ConfigService,
    ) {
        this.enabled = envEnabledByDefault(
            configService.get<string>('CALL_REPORT_DEEP_ANALYSIS_ENABLED'),
        );
    }

    /**
     * Разбор одного звонка. null — шаг выключён или не удался;
     * вызывающий код обязан продолжить работу без разбора.
     */
    async run(
        domain: string,
        transcript: string,
        callType: string | null,
    ): Promise<AgentCallAnalysisDto | null> {
        if (!this.enabled) return null;
        if (!transcript.trim()) {
            this.logger.warn(
                `Пустой транскрипт (${domain}) — глубокий разбор пропущен`,
            );
            return null;
        }

        try {
            const systemPrompt = await this.buildSystemPrompt(domain, callType);
            const apiKey = await this.vibeKeyResolver.resolve(domain);
            const parsed = await this.vibeCodeClient.structuredCompletion(
                systemPrompt,
                buildDeepAnalysisUserContent(transcript, callType),
                'call_deep_analysis',
                CALL_DEEP_ANALYSIS_SCHEMA,
                apiKey,
            );

            const dto = plainToInstance(AgentCallAnalysisDto, {
                ...(parsed as Record<string, unknown>),
                // callType не спрашиваем у модели повторно: он уже определён
                // дешёвым классификатором на предыдущем шаге конвейера.
                callType: callType ?? FALLBACK_CALL_TYPE,
            });
            this.logger.log(
                `Глубокий разбор (${domain}): оценка ${dto.score ?? '—'}, ` +
                    `разделов ${dto.sections?.length ?? 0}, тип ${dto.callType}`,
            );
            return dto;
        } catch (error) {
            this.logger.warn(
                `Глубокий разбор не выполнен (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Базовый промпт + методички портала по типу звонка. Как и в
     * классификаторе, берём строго документы своего kind: listDocuments
     * подмешивает general/, и без фильтра промпт зарос бы общими
     * материалами базы знаний.
     */
    private async buildSystemPrompt(
        domain: string,
        callType: string | null,
    ): Promise<string> {
        const kind = `${DEEP_ANALYSIS_KIND_PREFIX}${callType ?? FALLBACK_CALL_TYPE}`;
        try {
            const documents = await this.knowledgeContent.readAll(domain, kind);
            const materials = documents
                .filter(doc => doc.kind === kind)
                .map(doc => doc.text.trim())
                .filter(Boolean);
            if (materials.length) {
                this.logger.log(
                    `Методички разбора ${kind} (${domain}): ${materials.length} докум.`,
                );
                return (
                    `${CALL_DEEP_ANALYSIS_SYSTEM_PROMPT}\n\n` +
                    `МАТЕРИАЛЫ КОМПАНИИ (скрипты, критерии оценки, эталонные разборы) — ` +
                    `опирайся на них при оценке:\n\n${materials.join('\n\n---\n\n')}`
                );
            }
            this.logger.log(
                `Методичек ${kind} нет (${domain}) — базовый промпт разбора`,
            );
        } catch (error) {
            this.logger.warn(
                `База знаний ${kind} недоступна (${domain}): ${(error as Error).message}`,
            );
        }
        return CALL_DEEP_ANALYSIS_SYSTEM_PROMPT;
    }
}
