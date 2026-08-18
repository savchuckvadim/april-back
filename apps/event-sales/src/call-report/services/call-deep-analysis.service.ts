import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { KnowledgeContentService } from '@lib/ai-rag';
import { CallTypeDefinition, CallTypeRegistryService } from '@lib/call-lib';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    AFTER_PRESENTATION_STRICT_BLOCK,
    buildDeepAnalysisUserContent,
    CALL_DEEP_ANALYSIS_SCHEMA,
    CALL_DEEP_ANALYSIS_SYSTEM_PROMPT,
    renderCallTypeProfile,
    renderPresentationStrictnessBlock,
} from '../contracts/call-deep-analysis.contract';
import { CallReportSettingsService } from './call-report-settings.service';

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
 * Включение шага решает вызывающий код (processor) по настройкам портала
 * (CallReportSettingsService: портал → env CALL_REPORT_DEEP_ANALYSIS_ENABLED
 * → дефолт) — сервис своего выключателя не имеет.
 */
@Injectable()
export class CallDeepAnalysisService {
    private readonly logger = new Logger(CallDeepAnalysisService.name);

    constructor(
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
        private readonly knowledgeContent: KnowledgeContentService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly reportSettings: CallReportSettingsService,
    ) {}

    /** Поправка строгости презентации (настройка портала) — fail-open. */
    private async buildStrictnessBlock(domain: string): Promise<string> {
        try {
            const settings = await this.reportSettings.resolve(domain);
            return renderPresentationStrictnessBlock(
                settings.presentationStrictness,
            );
        } catch {
            return '';
        }
    }

    /** Ужесточение «5К и хвост» (см. CallFocusAnalysisService) — fail-open. */
    private async buildAfterPresentationBlock(
        domain: string,
        callType: string | null,
    ): Promise<string> {
        if (callType !== 'presentation' && callType !== 'decision') return '';
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return settings.withCheckPresentation
                ? AFTER_PRESENTATION_STRICT_BLOCK
                : '';
        } catch (error) {
            this.logger.warn(
                `Настройки event-sales недоступны (${domain}): ${(error as Error).message}`,
            );
            return '';
        }
    }

    /**
     * Разбор одного звонка. null — шаг не удался; вызывающий код обязан
     * продолжить работу без разбора.
     * passportBlock — «паспорт звонка» слоя 0 (CRM-контекст/направление/
     * история, CallContextBuilderService.renderForPrompt); опционален —
     * без него разбор работает как раньше.
     * options.model — модель VibeCode из настроек портала (deepAnalysisModel).
     */
    async run(
        domain: string,
        transcript: string,
        callType: string | null,
        passportBlock?: string,
        options?: { model?: string },
    ): Promise<AgentCallAnalysisDto | null> {
        if (!transcript.trim()) {
            this.logger.warn(
                `Пустой транскрипт (${domain}) — глубокий разбор пропущен`,
            );
            return null;
        }

        try {
            const systemPrompt =
                (await this.buildSystemPrompt(domain, callType)) +
                (await this.buildAfterPresentationBlock(domain, callType)) +
                (await this.buildStrictnessBlock(domain));
            const apiKey = await this.vibeKeyResolver.resolve(domain);
            const parsed = await this.vibeCodeClient.structuredCompletion(
                systemPrompt,
                buildDeepAnalysisUserContent(
                    transcript,
                    callType,
                    passportBlock,
                ),
                'call_deep_analysis',
                CALL_DEEP_ANALYSIS_SCHEMA,
                apiKey,
                { model: options?.model },
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
     * Промпт = базовые правила разбора + профиль этапа продаж + методички
     * портала.
     *
     * Профиль (фокус этапа, приоры актуальности разделов, нормы речи)
     * берётся из реестра типов — того же, что использует классификатор,
     * и подменяемого через базу знаний. Без него холодный звонок
     * оценивался бы по меркам презентации: там, где менеджер правильно
     * НЕ стал презентовать, разбор списывал бы ему баллы.
     *
     * Kind методички тоже берём из профиля (knowledgeKind), а не собираем
     * строкой: у клиентского типа звонка он может быть нестандартным.
     */
    private async buildSystemPrompt(
        domain: string,
        callType: string | null,
    ): Promise<string> {
        const profile = await this.resolveProfile(domain, callType);
        const basePrompt = profile
            ? CALL_DEEP_ANALYSIS_SYSTEM_PROMPT + renderCallTypeProfile(profile)
            : CALL_DEEP_ANALYSIS_SYSTEM_PROMPT;
        const kind =
            profile?.knowledgeKind ??
            `call-analysis-${callType ?? FALLBACK_CALL_TYPE}`;
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
                    `${basePrompt}\n\n` +
                    `МАТЕРИАЛЫ КОМПАНИИ (скрипты, критерии оценки, эталонные разборы) — ` +
                    `опирайся на них при оценке:\n\n${materials.join('\n\n---\n\n')}`
                );
            }
            this.logger.log(
                `Методичек ${kind} нет (${domain}) — разбор по базовому промпту`,
            );
        } catch (error) {
            this.logger.warn(
                `База знаний ${kind} недоступна (${domain}): ${(error as Error).message}`,
            );
        }
        return basePrompt;
    }

    /** Профиль типа звонка из реестра; null — тип неизвестен реестру. */
    private async resolveProfile(
        domain: string,
        callType: string | null,
    ): Promise<CallTypeDefinition | null> {
        try {
            const registry = await this.callTypeRegistry.resolve(domain);
            const profile =
                registry.types[callType ?? FALLBACK_CALL_TYPE] ?? null;
            if (!profile) {
                this.logger.warn(
                    `Тип «${callType ?? FALLBACK_CALL_TYPE}» вне реестра (${domain}) — ` +
                        'разбор без калибровки по этапу',
                );
            }
            return profile;
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }
}
