import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from 'generated/prisma';
import { PBXService } from '@lib/pbx/pbx.service';
import {
    AiService,
    AGENT_ANALYSIS_TYPE,
    CALL_COMPLIANCE_REVIEW_TYPE,
    KnowledgeMaterialsService,
    renderMaterialBlock,
    TranscriptionPipelineView,
} from '@lib/call-lib';
import { KNOWLEDGE_KINDS } from '@lib/ai-rag';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { CallReportSmartWriterService } from '@lib/call-lib/call-report/services/call-report-smart-writer.service';
import { VibeCodeClient, VibeKeyResolverService } from '@lib/vibecode';
import { AgentCallAnalysisDto } from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    buildComplianceUserContent,
    COMPLIANCE_REVIEW_PROMPT,
    COMPLIANCE_REVIEW_SCHEMA,
    ComplianceReviewResult,
    ComplianceSeverityCode,
    PRESENTATION_COMPLIANCE_BLOCK,
} from '../contracts/call-compliance-review.contract';

/** Минимальная длина цитаты, которую есть смысл проверять на подлинность. */
const MIN_QUOTE_CHARS = 20;
/** Сколько символов цитаты сверяем с расшифровкой. */
const QUOTE_MATCH_CHARS = 40;
/** Не больше двух готовых реплик — иначе это не разбор, а переписывание. */
const MAX_BETTER_LINES = 2;

/**
 * ПРОВЕРКА ЗВОНКА ПО ДОКУМЕНТАМ КОМПАНИИ (Фаза 3 плана
 * ai/tasks/rag-driven-analysis-plan.md).
 *
 * Отдельный дешёвый проход после основного разбора: сверяет разговор со
 * скриптом, регламентом, фактами о продукте и — для презентаций —
 * с методологией показа. Основные оценки не трогает.
 *
 * Идемпотентность: перед вызовом модели проверяется ais-запись
 * CALL_COMPLIANCE_REVIEW_TYPE — повторный прогон звонка не тратит бюджет
 * и не плодит комментарии.
 *
 * Fail-open: любая ошибка гасится, конвейер продолжает работу — разбор
 * звонка уже сохранён.
 */
@Injectable()
export class CallComplianceReviewService {
    private readonly logger = new Logger(CallComplianceReviewService.name);

    constructor(
        private readonly pbxService: PBXService,
        private readonly aiService: AiService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly materials: KnowledgeMaterialsService,
        private readonly vibeCodeClient: VibeCodeClient,
        private readonly vibeKeyResolver: VibeKeyResolverService,
    ) {}

    /**
     * @param row строка конвейера (домен, транскрипт, активность)
     * @param callType тип звонка от классификатора
     * @param model модель VibeCode из настроек портала
     */
    async run(
        row: TranscriptionPipelineView,
        callType: string | null,
        model?: string,
    ): Promise<ComplianceReviewResult | null> {
        const domain = row.domain;
        if (!domain || !row.text?.trim()) return null;
        try {
            const records = await this.aiService.findByTranscriptionIds([
                row.id,
            ]);
            if (
                records.some(
                    record => record.type === CALL_COMPLIANCE_REVIEW_TYPE,
                )
            ) {
                this.logger.log(
                    `Проверка по регламенту уже выполнена (transcription ${row.id})`,
                );
                return null;
            }
            const analysis = records.find(
                record => record.type === AGENT_ANALYSIS_TYPE,
            )?.user_result as AgentCallAnalysisDto | undefined;
            if (!analysis) {
                this.logger.log(
                    `Разбора нет (transcription ${row.id}) — проверять нечего`,
                );
                return null;
            }

            const isPresentation = this.looksLikePresentation(
                callType,
                analysis,
            );
            const materialsText = await this.buildMaterials(
                domain,
                isPresentation,
            );
            if (!materialsText) {
                this.logger.log(
                    `Документов компании нет (${domain}) — проверка по ` +
                        `регламенту пропущена без вызова модели`,
                );
                return null;
            }

            const apiKey = await this.vibeKeyResolver.resolve(domain);
            const prompt = isPresentation
                ? COMPLIANCE_REVIEW_PROMPT + PRESENTATION_COMPLIANCE_BLOCK
                : COMPLIANCE_REVIEW_PROMPT;
            const raw = (await this.vibeCodeClient.structuredCompletion(
                prompt,
                buildComplianceUserContent({
                    transcript: row.text,
                    callType,
                    analysisDigest: this.renderAnalysisDigest(analysis),
                    materials: materialsText,
                }),
                'call_compliance_review',
                COMPLIANCE_REVIEW_SCHEMA,
                apiKey,
                { model },
            )) as ComplianceReviewResult;

            const result = this.sanitize(raw, row.text, row.id);
            await this.persist(domain, row, result);
            this.logger.log(
                `Проверка по регламенту (${domain}, activity ${row.activityId}): ` +
                    `нарушений ${result.violations.length}, пропущено пунктов ` +
                    `${this.missedCount(result)}, ошибок о продукте ` +
                    `${result.factErrors.length}`,
            );
            return result;
        } catch (error) {
            this.logger.warn(
                `Проверка по регламенту не выполнена (${domain}, transcription ` +
                    `${row.id}): ${(error as Error).message}`,
            );
            return null;
        }
    }

    /**
     * Презентационный контур включается ПО СОДЕРЖАНИЮ, а не по типу:
     * классификатор иногда ставит «другое», тогда как показ, хвост и 5К
     * в разговоре были (боевой кейс 27.08.2026).
     */
    private looksLikePresentation(
        callType: string | null,
        analysis: AgentCallAnalysisDto,
    ): boolean {
        if (
            callType === 'presentation' ||
            callType === 'decision' ||
            // Доработка — продолжение презентации: там добивают
            // невыясненные 5К и несогласованную дату решения.
            callType === 'refine'
        ) {
            return true;
        }
        return Boolean(
            analysis.presentationDone ||
                analysis.hvostDone !== undefined ||
                analysis.fiveKDone !== undefined ||
                analysis.hvostAnalysis ||
                analysis.fiveKAnalysis,
        );
    }

    /** Норма и факты: скрипт, регламент, продукт, плейбуки. */
    private async buildMaterials(
        domain: string,
        isPresentation: boolean,
    ): Promise<string> {
        const blocks = await this.materials.collect(domain, [
            { kind: KNOWLEDGE_KINDS.salesScript, budgetChars: 6000 },
            { kind: KNOWLEDGE_KINDS.callAnalysisBase, budgetChars: 3000 },
            { kind: KNOWLEDGE_KINDS.salesRegulation, budgetChars: 5000 },
            { kind: KNOWLEDGE_KINDS.productFacts, budgetChars: 6000 },
            { kind: KNOWLEDGE_KINDS.objectionPlaybook, budgetChars: 3000 },
            {
                kind: KNOWLEDGE_KINDS.presentationPlaybook,
                budgetChars: isPresentation ? 6000 : 0,
            },
        ]);
        const byKind = new Map(blocks.map(block => [block.kind, block]));
        return [
            renderMaterialBlock(
                'СКРИПТ РАЗГОВОРА (норма):',
                byKind.get(KNOWLEDGE_KINDS.salesScript),
            ),
            renderMaterialBlock(
                'БАЗОВЫЕ СТАНДАРТЫ:',
                byKind.get(KNOWLEDGE_KINDS.callAnalysisBase),
            ),
            renderMaterialBlock(
                'РЕГЛАМЕНТ ОТДЕЛА (что обязательно и что запрещено):',
                byKind.get(KNOWLEDGE_KINDS.salesRegulation),
            ),
            renderMaterialBlock(
                'ФАКТЫ О ПРОДУКТЕ, КОМПЛЕКТАХ И ЦЕНАХ (источник правды ' +
                    'для фактчека):',
                byKind.get(KNOWLEDGE_KINDS.productFacts),
            ),
            renderMaterialBlock(
                'ПЛЕЙБУК ОТРАБОТКИ ВОЗРАЖЕНИЙ:',
                byKind.get(KNOWLEDGE_KINDS.objectionPlaybook),
            ),
            isPresentation
                ? renderMaterialBlock(
                      'МЕТОДОЛОГИЯ ПРЕЗЕНТАЦИИ (показ под задачи, хвост, 5К):',
                      byKind.get(KNOWLEDGE_KINDS.presentationPlaybook),
                  )
                : '',
        ]
            .filter(Boolean)
            .join('\n\n===\n\n');
    }

    /**
     * АНТИ-ГАЛЛЮЦИНАЦИЯ: находка без реальной цитаты недопустима —
     * менеджеру нельзя предъявлять то, чего он не говорил. Цитаты
     * сверяются с расшифровкой по нормализованному тексту.
     */
    private sanitize(
        raw: ComplianceReviewResult,
        transcript: string,
        transcriptionId: string,
    ): ComplianceReviewResult {
        const haystack = this.normalize(transcript);
        const isQuoted = (quote: string | null | undefined): boolean => {
            const normalized = this.normalize(quote ?? '');
            if (normalized.length < MIN_QUOTE_CHARS) return false;
            return haystack.includes(normalized.slice(0, QUOTE_MATCH_CHARS));
        };

        const violations = (raw.violations ?? []).filter(item =>
            isQuoted(item.quote),
        );
        const factErrors = (raw.factErrors ?? []).filter(item =>
            isQuoted(item.quote),
        );
        const dropped =
            (raw.violations?.length ?? 0) -
            violations.length +
            ((raw.factErrors?.length ?? 0) - factErrors.length);
        if (dropped > 0) {
            this.logger.warn(
                `Проверка по регламенту: отброшено ${dropped} находок без ` +
                    `подтверждённой цитаты (transcription ${transcriptionId})`,
            );
        }
        return {
            scriptChecklist: raw.scriptChecklist ?? [],
            violations,
            factErrors,
            betterLines: (raw.betterLines ?? []).slice(0, MAX_BETTER_LINES),
            verdict: raw.verdict ?? '',
            scriptCompliance: raw.scriptCompliance ?? null,
        };
    }

    /** Текст к сравнимому виду: регистр, пунктуация, пробелы. */
    private normalize(value: string): string {
        return value
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Запись результата: ais + поля смарта + таймлайн элемента. */
    private async persist(
        domain: string,
        row: TranscriptionPipelineView,
        result: ComplianceReviewResult,
    ): Promise<void> {
        await this.aiService
            .create({
                provider: 'call-compliance-review',
                model: 'call-compliance-review',
                type: CALL_COMPLIANCE_REVIEW_TYPE,
                status: 'done',
                result: result.verdict,
                // Полный результат в ais: источник для отчётов и
                // повторного просмотра без обращения к Битриксу.
                user_result: JSON.parse(
                    JSON.stringify(result),
                ) as Prisma.JsonValue,
                domain,
                app: 'call-report',
                transcription_id: row.id,
                activity_id: row.activityId ?? undefined,
            })
            .catch((error: Error) =>
                this.logger.warn(
                    `ais-запись проверки не создана: ${error.message}`,
                ),
            );

        if (!row.activityId) return;
        const smartInfo = await this.smartResolver.resolve(domain);
        if (!smartInfo) return;
        const { bitrix } = await this.pbxService.init(domain);
        const writer = new CallReportSmartWriterService(bitrix, smartInfo);
        const itemId = await writer.updateExisting({
            activityId: row.activityId,
            complianceDone: true,
            complianceSeverity: this.maxSeverity(result),
            complianceViolations: result.violations.length,
            scriptMissed: this.missedCount(result),
            productFactErrors: result.factErrors.length,
            complianceSummary: result.verdict.slice(0, 350),
        });
        if (!itemId) return;

        await bitrix.timeline
            .addTimelineComment({
                ENTITY_ID: itemId,
                ENTITY_TYPE: `DYNAMIC_${smartInfo.entityTypeId}`,
                COMMENT: this.renderComment(result),
                AUTHOR_ID: '1',
            })
            .catch((error: Error) =>
                this.logger.warn(
                    `Комментарий проверки не записан: ${error.message}`,
                ),
            );
    }

    /** Итог проверки для таймлайна — с цитатами, чтобы можно было проверить. */
    private renderComment(result: ComplianceReviewResult): string {
        const lines: string[] = [
            '📕 [b]Проверка по документам компании[/b]',
            '',
            result.verdict,
        ];
        const missed = result.scriptChecklist.filter(
            point => point.status === 'missed',
        );
        if (missed.length) {
            lines.push(
                '',
                '[b]Пропущенные пункты скрипта:[/b]',
                ...missed.map(point => `✗ ${point.point}`),
            );
        }
        if (result.violations.length) {
            lines.push('', '[b]Нарушения регламента:[/b]');
            for (const item of result.violations) {
                lines.push(
                    `• ${item.rule} — ${item.what}`,
                    `   «${item.quote}»`,
                );
            }
        }
        if (result.factErrors.length) {
            lines.push('', '[b]Ошибки о продукте (фактчек):[/b]');
            for (const item of result.factErrors) {
                lines.push(
                    `• Сказано: «${item.quote}»`,
                    `   На самом деле: ${item.factFromBase}`,
                );
            }
        }
        if (result.betterLines.length) {
            lines.push('', '[b]Как надо было:[/b]');
            for (const item of result.betterLines) {
                lines.push(
                    `• ${item.moment}`,
                    `   было: ${item.asWas}`,
                    `   лучше: ${item.asShouldBe}`,
                );
            }
        }
        return lines.join('\n');
    }

    private missedCount(result: ComplianceReviewResult): number {
        return result.scriptChecklist.filter(point => point.status === 'missed')
            .length;
    }

    /** Худшая из найденных серьёзностей; ничего не нашли — «нарушений нет». */
    private maxSeverity(result: ComplianceReviewResult): string {
        const order: ComplianceSeverityCode[] = ['low', 'medium', 'high'];
        const found = [...result.violations, ...result.factErrors].map(
            item => item.severity,
        );
        if (!found.length) return 'none';
        return order.reduce(
            (worst, level) => (found.includes(level) ? level : worst),
            'low' as ComplianceSeverityCode,
        );
    }

    /** Выжимка разбора для контекста проверки (не пересматривается). */
    private renderAnalysisDigest(dto: AgentCallAnalysisDto): string {
        return [
            `Тип звонка: ${dto.callType ?? '—'}`,
            `Резюме: ${dto.summary ?? '—'}`,
            dto.productsOffered?.length
                ? `Предложенные продукты: ${dto.productsOffered.join('; ')}`
                : null,
            dto.objections?.length
                ? `Возражения: ${dto.objections
                      .map(objection => objection.objection)
                      .join('; ')}`
                : null,
            dto.riskFlags?.length
                ? `Риск-флаги разбора: ${dto.riskFlags.join('; ')}`
                : null,
            dto.nextStep
                ? `Следующий шаг: ${dto.nextStep.set ? 'назначен' : 'НЕ назначен'}` +
                  (dto.nextStep.description
                      ? ` — ${dto.nextStep.description}`
                      : '')
                : null,
            dto.hvostDone !== undefined && dto.hvostDone !== null
                ? `Хвост: ${dto.hvostDone ? 'пройден' : 'НЕ пройден'}`
                : null,
            dto.fiveKDone !== undefined && dto.fiveKDone !== null
                ? `5К: ${dto.fiveKDone ? 'закрыто' : 'НЕ закрыто'}`
                : null,
        ]
            .filter(Boolean)
            .join('\n');
    }
}
