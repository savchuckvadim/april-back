import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    CallTypeDefinition,
    CallTypeRegistryService,
    KnowledgeMaterialRequest,
    KnowledgeMaterialsService,
    renderMaterialBlock,
} from '@lib/call-lib';
import { KNOWLEDGE_KINDS } from '@lib/ai-rag';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    AFTER_PRESENTATION_STRICT_BLOCK,
    DECISION_CALL_BLOCK,
    REFINE_CALL_BLOCK,
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

/**
 * Базовый вид документов базы знаний: скрипты продаж, регламенты,
 * стандарты качества. Подмешивается в КАЖДЫЙ разбор независимо от типа
 * звонка — так загруженные материалы влияют на весь анализ, а не на
 * отдельные поля (запрос владельца 27.08.2026).
 */
export const BASE_KNOWLEDGE_KIND = 'call-analysis-base';

/** Потолок материалов в промпте, символов (контекст модели не резиновый). */
const MATERIALS_BUDGET_CHARS = 24000;

/** Материалы разбора: общий слой и добавки конкретных проходов. */
interface FocusMaterials {
    /** Идёт во все проходы и в синтез. */
    shared: string;
    /** Плейбук возражений — фокус «содержание продажи». */
    content: string;
    /** Регламент отдела — фокус «движение сделки». */
    movement: string;
    /** Эталонные разборы — синтез (калибровка оценок). */
    synthesis: string;
}

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
        private readonly materials: KnowledgeMaterialsService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly reportSettings: CallReportSettingsService,
    ) {}

    /**
     * Блок этапа воронки: доработка и звонок по решению разбираются
     * иначе, чем презентация (доменные правила от владельца 27.08.2026).
     * Доработка — вытащить настоящее возражение из-под «подумаю»;
     * решение — воссоздать ценность и продать цену/предложение.
     */
    private buildStageBlock(callType: string | null): string {
        if (callType === 'refine') return REFINE_CALL_BLOCK;
        if (callType === 'decision') return DECISION_CALL_BLOCK;
        return '';
    }

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
            const materials = await this.buildMaterials(domain, callType);
            // Общие поправки разбора (строгость презентации, требование
            // закрытия хвоста/5К) идут в КАЖДЫЙ проход вместе с материалами.
            const commonTail =
                this.buildStageBlock(callType) +
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
                        this.contextFor(materials, pass.key) + commonTail,
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

            // Синтез выставляет итоговую оценку — ему дополнительно идут
            // эталонные разборы РОПа, чтобы шкала не «плавала».
            const synthesisContext = materials.synthesis
                ? `${materials.shared}\n\n${materials.synthesis}${commonTail}`
                : materials.shared + commonTail;
            const synthesis = await this.runSynthesis(
                byKey,
                synthesisContext,
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

    /**
     * Материалы базы знаний по ролям + профиль типа звонка.
     *
     * Каждый вид получает СВОЙ бюджет и СВОЮ точку подмешивания
     * (Фаза 2 плана ai/tasks/rag-driven-analysis-plan.md):
     * - общий слой (все проходы и синтез): профиль типа, скрипт разговора,
     *   устаревший `call-analysis-base` как алиас скрипта, материалы типа
     *   звонка и общие материалы компании;
     * - «содержание продажи» дополнительно получает плейбук возражений;
     * - «движение сделки» — регламент отдела;
     * - синтез — эталонные разборы РОПа (калибровка шкалы оценок).
     *
     * ПРЕЗЕНТАЦИИ — отдельный усиленный контур (требование владельца
     * 27.08.2026): методология показа, хвоста и 5К подмешивается во ВСЕ
     * проходы и с большим бюджетом, потому что презентация — самый
     * дорогой звонок воронки.
     */
    private async buildMaterials(
        domain: string,
        callType: string | null,
    ): Promise<FocusMaterials> {
        let profileBlock = '';
        let typedKind = `call-analysis-${callType ?? FALLBACK_CALL_TYPE}`;
        try {
            const registry = await this.callTypeRegistry.resolve(domain);
            const profile: CallTypeDefinition | null =
                registry.types[callType ?? FALLBACK_CALL_TYPE] ?? null;
            if (profile) {
                profileBlock = renderCallTypeProfile(profile);
                typedKind = profile.knowledgeKind ?? typedKind;
            }
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );
        }

        // Презентационный контур: показ, дожим решения И ДОРАБОТКА —
        // в доработке добивают то, что не закрыли на презентации
        // (невыясненные 5К, несогласованная дата).
        const isPresentation =
            callType === 'presentation' ||
            callType === 'decision' ||
            callType === 'refine';
        const requests: KnowledgeMaterialRequest[] = [
            { kind: KNOWLEDGE_KINDS.salesScript, budgetChars: 6000 },
            { kind: KNOWLEDGE_KINDS.callAnalysisBase, budgetChars: 4000 },
            { kind: KNOWLEDGE_KINDS.general, budgetChars: 2000 },
            {
                kind: KNOWLEDGE_KINDS.presentationPlaybook,
                budgetChars: isPresentation ? 6000 : 1500,
            },
            { kind: KNOWLEDGE_KINDS.objectionPlaybook, budgetChars: 3000 },
            { kind: KNOWLEDGE_KINDS.salesRegulation, budgetChars: 3000 },
            { kind: KNOWLEDGE_KINDS.callEtalon, budgetChars: 3000 },
        ];
        if (typedKind !== KNOWLEDGE_KINDS.callAnalysisBase) {
            requests.push({ kind: typedKind, budgetChars: 6000 });
        }
        const blocks = await this.materials.collect(domain, requests);
        const byKind = new Map(blocks.map(block => [block.kind, block]));

        const shared = [
            profileBlock,
            renderMaterialBlock(
                'СТАНДАРТЫ КОМПАНИИ (скрипт разговора) — обязательны к ' +
                    'применению в любом разборе:',
                byKind.get(KNOWLEDGE_KINDS.salesScript),
            ),
            renderMaterialBlock(
                'СТАНДАРТЫ КОМПАНИИ (базовый слой):',
                byKind.get(KNOWLEDGE_KINDS.callAnalysisBase),
            ),
            renderMaterialBlock(
                'ОБЩИЕ МАТЕРИАЛЫ КОМПАНИИ:',
                byKind.get(KNOWLEDGE_KINDS.general),
            ),
            renderMaterialBlock(
                'МАТЕРИАЛЫ ПО ЭТОМУ ТИПУ ЗВОНКА (критерии оценки):',
                byKind.get(typedKind),
            ),
            isPresentation
                ? renderMaterialBlock(
                      'МЕТОДОЛОГИЯ ПРЕЗЕНТАЦИИ (показ под задачи, хвост, 5К) — ' +
                          'по ней судим этот звонок:',
                      byKind.get(KNOWLEDGE_KINDS.presentationPlaybook),
                  )
                : '',
        ]
            .filter(Boolean)
            .join('\n\n');

        return {
            shared: this.fitToBudget(shared),
            content: renderMaterialBlock(
                'ПЛЕЙБУК ОТРАБОТКИ ВОЗРАЖЕНИЙ:',
                byKind.get(KNOWLEDGE_KINDS.objectionPlaybook),
            ),
            movement: renderMaterialBlock(
                'РЕГЛАМЕНТ ОТДЕЛА (обещания, сроки, что запрещено):',
                byKind.get(KNOWLEDGE_KINDS.salesRegulation),
            ),
            synthesis: renderMaterialBlock(
                'ЭТАЛОННЫЕ РАЗБОРЫ (калибровка шкалы оценок):',
                byKind.get(KNOWLEDGE_KINDS.callEtalon),
            ),
        };
    }

    /** Контекст конкретного прохода: общий слой + слой этого фокуса. */
    private contextFor(materials: FocusMaterials, key: CallFocusKey): string {
        const extra =
            key === 'content'
                ? materials.content
                : key === 'movement'
                  ? materials.movement
                  : '';
        return extra ? `${materials.shared}\n\n${extra}` : materials.shared;
    }

    /**
     * Бюджет материалов в промпте: методички клиента могут быть на сотни
     * страниц, а контекст модели не резиновый — режем с явной пометкой,
     * чтобы транскрипт и инструкции разбора точно поместились.
     */
    private fitToBudget(text: string): string {
        if (text.length <= MATERIALS_BUDGET_CHARS) return text;
        this.logger.warn(
            `Материалы базы знаний ${text.length} симв. — усечены до ` +
                `${MATERIALS_BUDGET_CHARS} (контекст модели)`,
        );
        return (
            `${text.slice(0, MATERIALS_BUDGET_CHARS)}\n\n` +
            '… материалы усечены по размеру контекста'
        );
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
