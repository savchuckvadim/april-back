import { Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
    CallTypeDefinition,
    CallTypeRegistryService,
    KnowledgeMaterialsService,
    budgetRequests,
    focusBudgetLines,
    isPresentationContour,
    methodologyBudgetLines,
} from '@lib/call-lib';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import type { VibecodeStructuredCompletionWithUsage } from '@lib/vibecode';
import { StructuredLlmGateway, isRetryableLlmError } from '@lib/llm-gateway';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import { dedupeSectionsWithLog } from '../../agent-gate/services/agent-analysis-sections.util';
import {
    AFTER_PRESENTATION_STRICT_BLOCK,
    DECISION_CALL_BLOCK,
    EVENT_INVITE_CALL_BLOCK,
    REFINE_CALL_BLOCK,
    renderCallTypeProfile,
    renderPresentationStrictnessBlock,
    buildDeepAnalysisUserContent,
} from '../contracts/call-deep-analysis.contract';
import { CALL_REPORT_PROMPT_VERSION } from '../contracts/call-report-versions.const';
import { sumCompletionUsage } from './call-analysis-usage.util';
import {
    focusIncompleteParts,
    mergeFocusResults,
    ownSectionsOf,
    type FocusResultsByKey,
} from './call-focus-assemble.util';
import { renderMethodologyAnchorsBlock } from './call-focus-anchors.util';
import {
    isFocusProviderFailure,
    type CallFocusOutcome,
} from './call-focus-failure.util';
import {
    focusContextFor,
    methodologyContextOf,
    renderFocusMaterials,
    synthesisContextOf,
    type FocusMaterials,
} from './call-focus-materials.util';
import {
    runWaveWithRetry,
    settleWaveCall,
    type WaveAttempt,
    type WaveCall,
    type WaveResult,
} from './call-focus-retry.util';
import {
    STORED_FOCUS_PASSES_KEY,
    buildStoredFocusPasses,
    type StoredFocusPasses,
} from './call-focus-stored.util';
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
import {
    MethodologyRegistryService,
    type ResolvedMethodology,
} from '@lib/call-lib/call-report/methodology';
import {
    applyMethodologyToDto,
    buildMethodologyPass,
    type MethodologyPassSpec,
} from './call-focus-methodology.util';

const FALLBACK_CALL_TYPE = 'other';

/**
 * Базовый вид документов базы знаний: скрипты продаж, регламенты,
 * стандарты качества. Подмешивается в КАЖДЫЙ разбор независимо от типа
 * звонка — так загруженные материалы влияют на весь анализ, а не на
 * отдельные поля (запрос владельца 27.08.2026).
 */
export const BASE_KNOWLEDGE_KIND = 'call-analysis-base';

/** Описание одного фокус-прохода. */
interface FocusPass {
    key: CallFocusKey;
    label: string;
    prompt: string;
    schema: Record<string, unknown>;
}

/** Опции запуска фокус-разбора. */
export interface CallFocusRunOptions {
    /** Модель VibeCode из настроек портала (deepAnalysisModel). */
    model?: string;
    /**
     * Сохранённые ответы проходов неполного разбора (догон): такие проходы
     * заново не вызываются. Годность (версия промпта) проверяет вызывающий.
     */
    stored?: StoredFocusPasses;
}

/** Ответ одного вызова модели с расходом токенов. */
type FocusCompletion = VibecodeStructuredCompletionWithUsage;

/** Синтез итога — в журнале и схеме как отдельный проход. */
const SYNTHESIS_PASS = {
    key: 'synthesis',
    label: 'синтез',
    title: 'Синтез фокус-разбора',
    schema: FOCUS_SYNTHESIS_SCHEMA,
} as const;

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
 * синтеза тоже не фатальна — итоговые поля остаются пустыми. runWithOutcome
 * отдаёт и причину провала: проходы оборвались на поставщике модели —
 * процессор тогда не зовёт цельную страховку (11.11.2026).
 *
 * Учёт токенов: каждый удавшийся вызов (фокусы и синтез) возвращает usage
 * провайдера; сумма едет в dto.usage — приём разбора кладёт её в колонки
 * ais (tokens_count / price), и расход виден в GET admin/ai-analytics/cost.
 *
 * Включение: CALL_REPORT_ANALYSIS_MODE=focus (processor выбирает между
 * этим сервисом и цельным CallDeepAnalysisService).
 */
@Injectable()
export class CallFocusAnalysisService {
    private readonly logger = new Logger(CallFocusAnalysisService.name);

    constructor(
        private readonly llm: StructuredLlmGateway,
        private readonly materials: KnowledgeMaterialsService,
        private readonly callTypeRegistry: CallTypeRegistryService,
        private readonly appSettings: PortalAppSettingsService,
        private readonly reportSettings: CallReportSettingsService,
        private readonly methodologyRegistry: MethodologyRegistryService,
    ) {}

    /** Методика портала; реестр недоступен — разбор без методики (fail-open). */
    private async resolveMethodology(
        domain: string,
    ): Promise<ResolvedMethodology | null> {
        try {
            return await this.methodologyRegistry.resolve(domain);
        } catch (error) {
            this.logger.warn(
                `Реестр методик недоступен (${domain}): ${(error as Error).message} — разбор без методики`,
            );
            return null;
        }
    }

    /**
     * Блок этапа воронки: доработка и звонок по решению разбираются
     * иначе, чем презентация (доменные правила от владельца 27.08.2026).
     * Доработка — вытащить настоящее возражение из-под «подумаю»;
     * решение — воссоздать ценность и продать цену/предложение;
     * приглашение на мероприятие — польза для специалиста и договорённость,
     * продукт лишь повод (решение владельца 19.10.2026).
     */
    private buildStageBlock(callType: string | null): string {
        if (callType === 'refine') return REFINE_CALL_BLOCK;
        if (callType === 'decision') return DECISION_CALL_BLOCK;
        if (callType === 'event_invite') return EVENT_INVITE_CALL_BLOCK;
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

    /** Только разбор (переразбор, test-retest, догон): null — не собрался. */
    async run(
        ...args: Parameters<CallFocusAnalysisService['runWithOutcome']>
    ): Promise<AgentCallAnalysisDto | null> {
        return (await this.runWithOutcome(...args)).analysis;
    }

    /**
     * Разбор и причина провала — для процессора. options.model — модель
     * VibeCode из настроек портала (deepAnalysisModel).
     */
    async runWithOutcome(
        domain: string,
        transcript: string,
        callType: string | null,
        passportBlock?: string,
        options?: CallFocusRunOptions,
    ): Promise<CallFocusOutcome> {
        if (!transcript.trim()) {
            this.logger.warn(
                `Пустой транскрипт (${domain}) — фокус-разбор пропущен`,
            );
            return { analysis: null, providerFailure: false };
        }
        try {
            // Методика портала (конфиг чек-пунктов): четвёртый проход идёт
            // только на порталах с выбранной методикой и для её типов.
            const resolved = await this.resolveMethodology(domain);
            const methodologyPass: MethodologyPassSpec | null =
                buildMethodologyPass(resolved, callType);
            // Виды, объявленные методикой (факты о продукте, плейбуки),
            // читаются только когда у звонка есть её проход.
            const materials = await this.buildMaterials(
                domain,
                callType,
                methodologyPass ? resolved?.methodology.knowledge : undefined,
            );
            // Общие поправки разбора (строгость презентации, требование
            // закрытия хвоста/5К) идут в КАЖДЫЙ проход вместе с материалами.
            const commonTail =
                this.buildStageBlock(callType) +
                (await this.buildAfterPresentationBlock(domain, callType)) +
                (await this.buildStrictnessBlock(domain));
            // Якоря шкалы из методики — только проходам, которые ставят
            // оценки, и только когда у методики есть проход для этого типа.
            const scoringTail =
                commonTail +
                (methodologyPass
                    ? renderMethodologyAnchorsBlock(resolved)
                    : '');
            const userContent = this.buildUserContent(
                transcript,
                callType,
                passportBlock,
            );

            // Ошибки сорвавшихся фокус-проходов — по ним причина провала.
            // Массив свой у каждого вызова: разборы идут параллельно.
            const passErrors: unknown[] = [];
            // Догон неполного разбора приносит сохранённые ответы проходов:
            // такие проходы заново не вызываются (call-focus-stored.util.ts).
            const stored = options?.stored;
            // Ответ прохода методики годится, пока у портала та же методика
            // той же версии.
            const keptMethodology = stored?.methodology;
            const storedMethodology =
                methodologyPass &&
                keptMethodology &&
                keptMethodology.tag === resolved?.versionTag
                    ? keptMethodology.result
                    : null;
            const livePasses = FOCUS_PASSES.filter(
                pass => !stored?.passes[pass.key],
            );
            // Проходы идут одновременно; сорвался ровно один и по временной
            // причине — он повторяется (call-focus-retry.util.ts).
            const calls: WaveCall<string, FocusCompletion>[] = [
                ...livePasses.map(pass => ({
                    key: pass.key,
                    run: (attempt: WaveAttempt) =>
                        this.callFocus(
                            pass,
                            focusContextFor(materials, pass.key) + scoringTail,
                            userContent,
                            domain,
                            attempt,
                            options?.model,
                        ),
                })),
                ...(methodologyPass && !storedMethodology
                    ? [
                          {
                              key: methodologyPass.key,
                              run: (attempt: WaveAttempt) =>
                                  this.callFocus(
                                      methodologyPass,
                                      methodologyContextOf(materials) +
                                          commonTail,
                                      userContent,
                                      domain,
                                      attempt,
                                      options?.model,
                                  ),
                          },
                      ]
                    : []),
            ];
            const wave = await runWaveWithRetry(
                calls,
                isRetryableLlmError,
                key =>
                    this.logger.warn(
                        `Фокус-разбор (${domain}): проход ${key} сорвался один из всех — повтор`,
                    ),
            );
            const responses: (FocusCompletion | null)[] = [];
            const byKey: FocusResultsByKey = {
                form: null,
                content: null,
                movement: null,
            };
            for (const pass of FOCUS_PASSES) {
                const kept = stored?.passes[pass.key];
                if (kept) {
                    byKey[pass.key] = kept;
                    continue;
                }
                const response = await this.settle(
                    wave,
                    pass,
                    domain,
                    passErrors,
                );
                responses.push(response);
                byKey[pass.key] = resultOf(response);
            }
            const methodologyResponse =
                methodologyPass && !storedMethodology
                    ? await this.settle(wave, methodologyPass, domain)
                    : null;
            const methodologyResult =
                storedMethodology ?? resultOf(methodologyResponse);

            const survived = Object.values(byKey).filter(Boolean).length;
            if (survived < 2) {
                const providerFailure = isFocusProviderFailure(passErrors);
                this.logger.warn(
                    `Фокус-разбор (${domain}): выжило ${survived}/3 проходов — результат отброшен` +
                        (providerFailure
                            ? ' (проходы оборвались на поставщике модели)'
                            : ''),
                );
                return { analysis: null, providerFailure };
            }

            // Синтез выставляет итоговую оценку — ему дополнительно идут
            // эталонные разборы РОПа, чтобы шкала не «плавала».
            const synthesisContext =
                synthesisContextOf(materials) + scoringTail;
            const synthesisWave = await runWaveWithRetry(
                [
                    {
                        key: SYNTHESIS_PASS.key,
                        run: (attempt: WaveAttempt) =>
                            this.callSynthesis(
                                byKey,
                                synthesisContext,
                                userContent,
                                domain,
                                attempt,
                                options?.model,
                            ),
                    },
                ],
                isRetryableLlmError,
                () =>
                    this.logger.warn(
                        `Фокус-разбор (${domain}): синтез сорвался — повтор`,
                    ),
            );
            const synthesisResponse = await this.settle(
                synthesisWave,
                SYNTHESIS_PASS,
                domain,
            );
            const synthesis = resultOf(synthesisResponse);
            // Что не собралось — по этому списку догон найдёт неполный
            // разбор и доделает его, когда поставщик снова ответит.
            const incompleteParts = focusIncompleteParts(
                byKey,
                synthesis,
                methodologyPass !== null,
                methodologyResult,
            );
            const merged = mergeFocusResults({
                byKey,
                synthesis,
                // Каждый проход — только разделы своей зоны (чужие коды от
                // модели отбрасываются); дубли кодов схлопываются ниже.
                sections: FOCUS_PASSES.flatMap(pass =>
                    this.sectionsOf(byKey[pass.key], pass, domain),
                ),
                callType: callType ?? FALLBACK_CALL_TYPE,
                incompleteParts,
                // Расход вызовов ЭТОГО запуска (фокусы, методика, синтез):
                // сохранённые проходы оплачены раньше и второй раз не идут.
                usage: sumCompletionUsage(
                    [
                        ...responses,
                        synthesisResponse,
                        methodologyResponse,
                    ].filter(
                        (response): response is FocusCompletion =>
                            response !== null,
                    ),
                ),
            });
            const dto = plainToInstance(AgentCallAnalysisDto, merged);
            // Неполный разбор уносит ответы выживших проходов — догону
            // останется позвать только недостающее. Полный их не несёт.
            if (incompleteParts.length > 0) {
                dto.extra = {
                    ...(dto.extra ?? {}),
                    [STORED_FOCUS_PASSES_KEY]: buildStoredFocusPasses(
                        byKey,
                        methodologyResult && resolved
                            ? {
                                  tag: resolved.versionTag,
                                  result: methodologyResult,
                              }
                            : null,
                        CALL_REPORT_PROMPT_VERSION,
                    ),
                };
            }
            // Один раздел — одна запись: проход с единственным разрешённым
            // кодом присылал «моменты» приветствия отдельными записями, и в
            // ленту сделки уходили три «Приветствия» (29.10.2026).
            dto.sections = dedupeSectionsWithLog(
                dto.sections,
                `Фокус-разбор (${domain})`,
                this.logger,
            );
            // Ограничители ядра (все порталы) и методика портала: факты из
            // разбора, пункты модели и правил, срез оценок до потолков.
            const applied = applyMethodologyToDto(
                dto,
                resolved,
                methodologyResult,
                materials.talkRatioMax,
            );
            if (applied.capsTriggered > 0 || applied.methodology) {
                this.logger.log(
                    `Фокус-разбор (${domain}): ограничителей сработало ${applied.capsTriggered} (срезано ${applied.capsApplied})` +
                        (applied.methodology
                            ? `, методика ${applied.methodology.code}: пунктов ${applied.methodology.checkpointsDone}/${applied.methodology.checkpointsTotal}`
                            : ''),
                );
            }
            const keptKeys = Object.keys(stored?.passes ?? {});
            this.logger.log(
                `Фокус-разбор (${domain}): проходов ${survived}/3` +
                    (keptKeys.length > 0
                        ? ` (из сохранённых: ${keptKeys.join(', ')})`
                        : '') +
                    `, разделов ${dto.sections?.length ?? 0}, оценка ${dto.score ?? '—'}`,
            );
            return { analysis: dto, providerFailure: false };
        } catch (error) {
            this.logger.warn(
                `Фокус-разбор не выполнен (${domain}): ${(error as Error).message}`,
            );
            return { analysis: null, providerFailure: false };
        }
    }

    /**
     * Материалы базы знаний по проходам + профиль типа звонка. Какие виды и
     * сколько знаков читать — общая таблица бюджетов; что куда подмешать —
     * call-focus-materials.util.ts.
     * @param knowledge виды, объявленные методикой портала; нет — прохода
     * методики у звонка нет
     */
    private async buildMaterials(
        domain: string,
        callType: string | null,
        knowledge?: Readonly<Record<string, string>>,
    ): Promise<FocusMaterials> {
        let profileBlock = '';
        let talkRatioMax: number | null = null;
        let typedKind = `call-analysis-${callType ?? FALLBACK_CALL_TYPE}`;
        try {
            const registry = await this.callTypeRegistry.resolve(domain);
            const profile: CallTypeDefinition | null =
                registry.types[callType ?? FALLBACK_CALL_TYPE] ?? null;
            if (profile) {
                profileBlock = renderCallTypeProfile(profile);
                typedKind = profile.knowledgeKind ?? typedKind;
                talkRatioMax = profile.talkRatioNorm?.max ?? null;
            }
        } catch (error) {
            this.logger.warn(
                `Реестр типов недоступен (${domain}): ${(error as Error).message}`,
            );
        }

        const presentation = isPresentationContour(callType);
        const focus = focusBudgetLines({ typedKind, presentation });
        const lines = [
            ...focus,
            ...methodologyBudgetLines(knowledge, { focus, presentation }),
        ];
        const { materials, sharedCutChars } = renderFocusMaterials({
            profileBlock,
            typedKind,
            presentation,
            lines,
            blocks: await this.materials.collect(domain, budgetRequests(lines)),
            talkRatioMax,
        });
        if (sharedCutChars > 0) {
            this.logger.warn(
                `Материалы базы знаний (${domain}): общий слой не поместился, ` +
                    `обрезано ${sharedCutChars} симв. (контекст модели)`,
            );
        }
        return materials;
    }

    /** User-часть — та же, что у цельного разбора: тип словами, паспорт, расшифровка. */
    private buildUserContent(
        transcript: string,
        callType: string | null,
        passportBlock?: string,
    ): string {
        return buildDeepAnalysisUserContent(
            transcript,
            callType,
            passportBlock,
        );
    }

    /**
     * Один фокус-проход (ответ + usage). Ошибку бросает: повторять ли проход
     * и что писать в журнал, решает волна (runWaveWithRetry / settle).
     * Тревога «не ответил никто» первой попытки откладывается — одиночный
     * сбой повторяется, и тревожить о нём рано.
     */
    private callFocus(
        pass: Pick<FocusPass, 'prompt' | 'schema'> & { key: string },
        sharedContext: string,
        userContent: string,
        domain: string,
        attempt: WaveAttempt,
        model?: string,
    ): Promise<FocusCompletion> {
        return this.llm.structuredCompletionWithUsage(
            `${pass.prompt}${sharedContext ? `\n${sharedContext}` : ''}`,
            userContent,
            `call_focus_${pass.key}`,
            pass.schema,
            domain,
            { model, deferExhaustedAlert: attempt === 1 },
        );
    }

    /** Синтез итоговых полей по выжимкам фокусов (ответ + usage); ошибку бросает. */
    private callSynthesis(
        byKey: Record<CallFocusKey, Record<string, unknown> | null>,
        sharedContext: string,
        userContent: string,
        domain: string,
        attempt: WaveAttempt,
        model?: string,
    ): Promise<FocusCompletion> {
        const digests = [
            renderFocusDigest('ФОРМА РАЗГОВОРА', byKey.form),
            renderFocusDigest('СОДЕРЖАНИЕ ПРОДАЖИ', byKey.content),
            renderFocusDigest('ДВИЖЕНИЕ СДЕЛКИ', byKey.movement),
        ].join('\n\n');
        return this.callFocus(
            { ...SYNTHESIS_PASS, prompt: FOCUS_SYNTHESIS_PROMPT },
            sharedContext,
            `ВЫВОДЫ СПЕЦИАЛИЗИРОВАННЫХ РАЗБОРОВ:\n\n${digests}\n\n${userContent}`,
            domain,
            attempt,
            model,
        );
    }

    /**
     * Ответ вызова из волны или null: сбой — в журнал и в `failures`
     * (разбор продолжается без этого прохода); тревога, отложенная на первой
     * попытке, уходит здесь, если повтора не было.
     */
    private settle(
        wave: ReadonlyMap<string, WaveResult<FocusCompletion>>,
        pass: { key: string; label: string; title?: string },
        domain: string,
        failures?: unknown[],
    ): Promise<FocusCompletion | null> {
        return settleWaveCall(
            wave.get(pass.key),
            {
                title: pass.title ?? `Фокус «${pass.label}»`,
                schemaName: `call_focus_${pass.key}`,
                domain,
            },
            {
                warn: message => this.logger.warn(message),
                reportExhausted: (error, request) =>
                    this.llm.reportExhausted(error, request),
            },
            failures,
        );
    }

    /**
     * Разделы прохода — только коды его зоны: чужой код (модель нарушила
     * enum схемы) отбрасывается с предупреждением, иначе он задвоил бы
     * раздел другого прохода.
     */
    private sectionsOf(
        result: Record<string, unknown> | null,
        pass: FocusPass,
        domain: string,
    ): Record<string, unknown>[] {
        const { own, foreign } = ownSectionsOf(result, pass.key);
        if (foreign.length > 0) {
            this.logger.warn(
                `Фокус-разбор (${domain}), проход «${pass.label}»: чужие разделы ${foreign.join(', ')} отброшены`,
            );
        }
        return own;
    }
}

/** Разобранный JSON ответа провайдера; вызов не удался — null. */
function resultOf(
    response: VibecodeStructuredCompletionWithUsage | null,
): Record<string, unknown> | null {
    return response ? (response.result as Record<string, unknown>) : null;
}
