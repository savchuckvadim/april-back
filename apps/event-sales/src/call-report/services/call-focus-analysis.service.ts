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
    renderCallTypeProfile,
    renderPresentationStrictnessBlock,
} from '../contracts/call-deep-analysis.contract';
import { CallReportSettingsService } from './call-report-settings.service';
import {
    CallFocusKey,
    FOCUS_CONTENT_PROMPT,
    FOCUS_CONTENT_SCHEMA,
    FOCUS_FORM_PROMPT,
    FOCUS_FORM_SCHEMA,
    FOCUS_MOVEMENT_PROMPT,
    FOCUS_MOVEMENT_SCHEMA,
    FOCUS_SYNTHESIS_PROMPT,
    FOCUS_SYNTHESIS_SCHEMA,
    renderFocusDigest,
} from '../contracts/call-focus-analysis.contract';

const FALLBACK_CALL_TYPE = 'other';

/** Описание одного фокус-прохода. */
interface FocusPass {
    key: CallFocusKey;
    label: string;
    prompt: string;
    schema: Record<string, unknown>;
}

const FOCUS_PASSES: FocusPass[] = [
    {
        key: 'form',
        label: 'форма разговора',
        prompt: FOCUS_FORM_PROMPT,
        schema: FOCUS_FORM_SCHEMA,
    },
    {
        key: 'content',
        label: 'содержание продажи',
        prompt: FOCUS_CONTENT_PROMPT,
        schema: FOCUS_CONTENT_SCHEMA,
    },
    {
        key: 'movement',
        label: 'движение сделки',
        prompt: FOCUS_MOVEMENT_PROMPT,
        schema: FOCUS_MOVEMENT_SCHEMA,
    },
];

/**
 * МНОГОСЛОЙНЫЙ разбор звонка (Фаза 2 плана call-analysis-v2): три
 * параллельных фокус-вызова с узкими схемами (форма / содержание /
 * движение сделки) + синтез итоговой картины по их выжимкам. Каждый фокус
 * получает паспорт звонка, профиль типа и методички портала — но отвечает
 * только за свои разделы, поэтому меньше галлюцинирует и глубже копает.
 *
 * Выход собирается в тот же AgentCallAnalysisDto — intake/writer/таймлайн
 * не отличают его от цельного разбора.
 *
 * Устойчивость: упавший фокус не роняет разбор (его разделы просто
 * отсутствуют); минимум два фокуса обязаны выжить, иначе null. Ошибка
 * синтеза тоже не фатальна — итоговые поля остаются пустыми.
 *
 * Включение: CALL_REPORT_ANALYSIS_MODE=focus (processor выбирает между
 * этим сервисом и цельным CallDeepAnalysisService).
 */
@Injectable()
export class CallFocusAnalysisService {
    private readonly logger = new Logger(CallFocusAnalysisService.name);

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

    /**
     * Ужесточение «5К и хвост»: на порталах с обязательной отчётностью
     * после презентации (event-sales `withCheckPresentation`) разбор
     * презентационных/решенческих звонков строже требует закрытие.
     * Fail-open: настройки не прочитались — разбор без блока.
     */
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

    /** options.model — модель VibeCode из настроек портала (deepAnalysisModel). */
    async run(
        domain: string,
        transcript: string,
        callType: string | null,
        passportBlock?: string,
        options?: { model?: string },
    ): Promise<AgentCallAnalysisDto | null> {
        if (!transcript.trim()) {
            this.logger.warn(
                `Пустой транскрипт (${domain}) — фокус-разбор пропущен`,
            );
            return null;
        }
        try {
            const apiKey = await this.vibeKeyResolver.resolve(domain);
            const context =
                (await this.buildSharedContext(domain, callType)) +
                (await this.buildAfterPresentationBlock(domain, callType)) +
                (await this.buildStrictnessBlock(domain));
            const userContent = this.buildUserContent(
                transcript,
                callType,
                passportBlock,
            );

            const results = await Promise.all(
                FOCUS_PASSES.map(pass =>
                    this.runFocus(
                        pass,
                        context,
                        userContent,
                        apiKey,
                        domain,
                        options?.model,
                    ),
                ),
            );
            const byKey = Object.fromEntries(
                FOCUS_PASSES.map((pass, index) => [pass.key, results[index]]),
            ) as Record<CallFocusKey, Record<string, unknown> | null>;

            const survived = Object.values(byKey).filter(Boolean).length;
            if (survived < 2) {
                this.logger.warn(
                    `Фокус-разбор (${domain}): выжило ${survived}/3 проходов — результат отброшен`,
                );
                return null;
            }

            const synthesis = await this.runSynthesis(
                byKey,
                context,
                userContent,
                apiKey,
                domain,
                options?.model,
            );

            const merged: Record<string, unknown> = {
                ...(byKey.form ?? {}),
                ...(byKey.content ?? {}),
                ...(byKey.movement ?? {}),
                ...(synthesis ?? {}),
                sections: [
                    ...this.sectionsOf(byKey.form),
                    ...this.sectionsOf(byKey.content),
                    ...this.sectionsOf(byKey.movement),
                ],
                callType: callType ?? FALLBACK_CALL_TYPE,
            };
            const dto = plainToInstance(AgentCallAnalysisDto, merged);
            this.logger.log(
                `Фокус-разбор (${domain}): проходов ${survived}/3, ` +
                    `разделов ${dto.sections?.length ?? 0}, оценка ${dto.score ?? '—'}`,
            );
            return dto;
        } catch (error) {
            this.logger.warn(
                `Фокус-разбор не выполнен (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Профиль типа + методички — общие для всех проходов (один резолв). */
    private async buildSharedContext(
        domain: string,
        callType: string | null,
    ): Promise<string> {
        let profileBlock = '';
        let kind = `call-analysis-${callType ?? FALLBACK_CALL_TYPE}`;
        try {
            const registry = await this.callTypeRegistry.resolve(domain);
            const profile: CallTypeDefinition | null =
                registry.types[callType ?? FALLBACK_CALL_TYPE] ?? null;
            if (profile) {
                profileBlock = renderCallTypeProfile(profile);
                kind = profile.knowledgeKind ?? kind;
            }
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );
        }
        try {
            const documents = await this.knowledgeContent.readAll(domain, kind);
            const materials = documents
                .filter(doc => doc.kind === kind)
                .map(doc => doc.text.trim())
                .filter(Boolean);
            if (materials.length) {
                return (
                    `${profileBlock}\n\n` +
                    `МАТЕРИАЛЫ КОМПАНИИ (скрипты, критерии оценки, эталонные разборы) — ` +
                    `опирайся на них при оценке:\n\n${materials.join('\n\n---\n\n')}`
                );
            }
        } catch (error) {
            this.logger.warn(
                `База знаний ${kind} недоступна (${domain}): ${(error as Error).message}`,
            );
        }
        return profileBlock;
    }

    private buildUserContent(
        transcript: string,
        callType: string | null,
        passportBlock?: string,
    ): string {
        const typeLine = callType
            ? `Тип звонка по классификатору: ${callType}.\n`
            : '';
        const passport = passportBlock ? `${passportBlock}\n\n` : '\n';
        return `${typeLine}${passport}Разбери звонок по расшифровке:\n\n${transcript}`;
    }

    /** Один фокус-проход; ошибка → null (разбор продолжается без него). */
    private async runFocus(
        pass: FocusPass,
        sharedContext: string,
        userContent: string,
        apiKey: string,
        domain: string,
        model?: string,
    ): Promise<Record<string, unknown> | null> {
        try {
            const parsed = await this.vibeCodeClient.structuredCompletion(
                `${pass.prompt}${sharedContext ? `\n${sharedContext}` : ''}`,
                userContent,
                `call_focus_${pass.key}`,
                pass.schema,
                apiKey,
                { model },
            );
            return parsed as Record<string, unknown>;
        } catch (error) {
            this.logger.warn(
                `Фокус «${pass.label}» не выполнен (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /** Синтез итоговых полей по выжимкам фокусов; ошибка → null. */
    private async runSynthesis(
        byKey: Record<CallFocusKey, Record<string, unknown> | null>,
        sharedContext: string,
        userContent: string,
        apiKey: string,
        domain: string,
        model?: string,
    ): Promise<Record<string, unknown> | null> {
        const digests = [
            renderFocusDigest('ФОРМА РАЗГОВОРА', byKey.form),
            renderFocusDigest('СОДЕРЖАНИЕ ПРОДАЖИ', byKey.content),
            renderFocusDigest('ДВИЖЕНИЕ СДЕЛКИ', byKey.movement),
        ].join('\n\n');
        try {
            const parsed = await this.vibeCodeClient.structuredCompletion(
                `${FOCUS_SYNTHESIS_PROMPT}${sharedContext ? `\n${sharedContext}` : ''}`,
                `ВЫВОДЫ СПЕЦИАЛИЗИРОВАННЫХ РАЗБОРОВ:\n\n${digests}\n\n${userContent}`,
                'call_focus_synthesis',
                FOCUS_SYNTHESIS_SCHEMA,
                apiKey,
                { model },
            );
            return parsed as Record<string, unknown>;
        } catch (error) {
            this.logger.warn(
                `Синтез фокус-разбора не выполнен (${domain}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    private sectionsOf(
        result: Record<string, unknown> | null,
    ): Record<string, unknown>[] {
        return Array.isArray(result?.sections)
            ? (result.sections as Record<string, unknown>[])
            : [];
    }
}
