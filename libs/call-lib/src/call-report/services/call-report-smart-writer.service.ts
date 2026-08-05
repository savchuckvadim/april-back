import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    buildCallReportItemFieldName,
    CALL_REPORT_SMART_TITLE,
    CallReportLinkStatusCode,
    CallReportSectionCode,
    splitTranscriptForSmart,
} from '../config/call-report-smart.config';
import { CallReportSmartInfo } from './call-report-smart-resolver.service';

/** Разбор одного раздела разговора для записи в смарт. */
export interface CallReportSectionInput {
    section: CallReportSectionCode;
    relevance: number;
    score?: number;
    analysis?: string;
    advice?: string;
}

/** Привязка к элементу списка отчётности. */
export interface CallReportListItemLink {
    itemId: string;
    status: CallReportLinkStatusCode;
}

/** Данные для записи элемента смарта «AI-анализ звонков». */
export interface CallReportSmartItemInput {
    activityId: string;
    dealId?: number;
    /** Звонок по лиду (entityType='lead'): нативная связь parentId1. */
    leadId?: number;
    companyId?: number;
    contactId?: number;
    callId?: string;
    callStartedAt?: Date | string;
    durationSec?: number;
    /** Направление звонка (из активности) — участвует в названии элемента. */
    callDirection?: 'incoming' | 'outgoing';
    managerId?: number;
    /** Код типа звонка (xmlId enum-значения из конфига). */
    callType?: string;
    productive?: boolean;
    interlocutorRole?: string;
    sentiment?: string;
    nextStepSet?: boolean;
    nextStep?: string;
    nextStepDate?: string;
    priceDiscussed?: boolean;
    competitorMentioned?: boolean;
    competitors?: string[];
    objectionCategories?: string[];
    riskFlags?: string[];
    refusalCategory?: string;
    talkRatioPct?: number;
    questionsCount?: number;
    weightedScore?: number;
    scriptCompliance?: number;
    coachingPriority?: string;
    transcriptionId?: string;
    /** Полный транскрипт — будет разложен кусками по TRANSCRIPT_N. */
    transcript?: string;
    summary?: string;
    resumeGigachat?: string;
    recomendationGigachat?: string;
    needsFound?: boolean;
    needs?: string;
    presentationDone?: boolean;
    productsOffered?: string;
    objections?: string;
    objectionsHandling?: string;
    recommendations?: string;
    score?: number;
    scoreExplanation?: string;
    speechAnalysis?: string;
    employeeRecommendations?: string;
    sections?: CallReportSectionInput[];
    /** Связи с воронками (id сделок). */
    mainDealId?: number;
    presentationDealId?: number;
    xoDealId?: number;
    /** Привязка к элементам списков отчётности. */
    kpiItem?: CallReportListItemLink;
    historyItem?: CallReportListItemLink;
    relatedReports?: string;
    agentName?: string;
    agentVersion?: string;
}

/**
 * Писатель элементов смарт-процесса «AI-анализ звонков».
 *
 * НЕ Injectable: создаётся через `new CallReportSmartWriterService(bitrix, info)`
 * под конкретный домен (правило CLAUDE.md — никакого this.bitrix в Injectable).
 *
 * Запись — строго одиночным crm.item.add (POST JSON), НЕ батчем:
 * batch-путь библиотеки не URL-кодирует значения, длинные тексты
 * анализа с '&'/'=' молча ломают команду.
 *
 * Форматы значений (проверено по боевому коду):
 * - crm-поля (DEAL_*) — массив строк-ссылок ['D_123'] (smart-report-flow);
 * - enumeration — числовой id значения (маппинг из resolver'а);
 * - boolean — 1/0; связи parentId{etid}/companyId/contactId — числа.
 */
export class CallReportSmartWriterService {
    private readonly logger = new Logger(CallReportSmartWriterService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly smartInfo: CallReportSmartInfo,
    ) {}

    /**
     * Создаёт элемент смарта, возвращает его id.
     *
     * Дедуп на уровне Bitrix: один разговор (activityId) = один элемент.
     * В `xmlId` (внешний код элемента crm.item) пишется `aicall_{activityId}`,
     * перед созданием ищется существующий элемент по этому коду — ретраи и
     * повторные push-back при потерянной связке в ais не плодят дубли.
     */
    async addItem(input: CallReportSmartItemInput): Promise<number> {
        const xmlId = input.activityId
            ? `aicall_${input.activityId}`
            : undefined;
        if (xmlId) {
            const existingId = await this.findIdByXmlId(xmlId);
            if (existingId) {
                // Upsert: существующий элемент ДОПОЛНЯЕТСЯ переданными полями
                // (частичный update) — базовый элемент из smoke-прогона
                // конвейера потом обогащается глубоким анализом агента.
                await this.writeWithDegradation(
                    this.buildFields(input),
                    fields =>
                        this.bitrix.item.update(
                            existingId,
                            this.smartInfo.entityTypeId as never,
                            fields as Partial<IBXItem>,
                        ),
                ).catch((error: Error) =>
                    // Не фатально: транскрипт и ais уже в БД, разбор
                    // дольётся повторным прогоном. { telegram: true } —
                    // алерт, иначе пустые поля ищут неделями.
                    this.logger.error(
                        `Элемент #${existingId} не обновлён (${xmlId}): ${error.message}`,
                        { telegram: true, itemId: existingId },
                    ),
                );
                this.logger.log(
                    `Элемент смарта уже существует: #${existingId} (${xmlId}) — обновил поля, дубль не создаю`,
                );
                return existingId;
            }
        }

        const fields = this.buildFields(input);
        if (xmlId) fields.xmlId = xmlId;
        const response = (await this.writeWithDegradation(
            fields as Record<string, unknown>,
            degraded =>
                this.bitrix.item.add(
                    String(this.smartInfo.entityTypeId),
                    degraded as Partial<IBXItem>,
                ),
        )) as { result?: { item?: { id?: number } } } | undefined;
        const itemId = Number(response?.result?.item?.id);
        if (!itemId) {
            throw new Error(
                `crm.item.add не вернул id элемента (activity ${input.activityId})`,
            );
        }
        this.logger.log(
            `Создан элемент смарта #${itemId} (activity ${input.activityId})`,
        );
        return itemId;
    }

    /**
     * Запись с деградацией под лимит строки MySQL Битрикса.
     *
     * Прод-инцидент 05.08.2026: crm.item.update падал с «Mysql query error:
     * (1118) Row size too large (> 8126)» — строка таблицы смарта не
     * вмещает все длинные текстовые поля разом (транскрипт 4×40к + разборы
     * разделов), и Bitrix отбрасывал ВЕСЬ разбор: карточка оставалась с
     * пустыми полями. Стратегия:
     *   1) все поля как есть;
     *   2) без TRANSCRIPT_N (текст есть в БД и в таймлайне диалогом);
     *   3) дополнительно все длинные строки обрезаются до 1024 символов.
     * Что выброшено/обрезано — в логе; иная ошибка пробрасывается сразу.
     */
    private async writeWithDegradation(
        fields: Record<string, unknown>,
        write: (fields: Record<string, unknown>) => Promise<unknown>,
    ): Promise<unknown> {
        const variants = this.degradationVariants(fields);
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            try {
                return await write(variant.fields);
            } catch (error) {
                const message = (error as Error).message ?? '';
                const isRowSize = message.includes('Row size too large');
                const hasNext = i + 1 < variants.length;
                if (!isRowSize || !hasNext) throw error;
                this.logger.warn(
                    `Строка смарта не влезла в лимит Bitrix (${variant.label}) — ` +
                        `повторяю: ${variants[i + 1].label}`,
                );
            }
        }
        // Недостижимо: последний вариант либо вернулся, либо бросил.
        throw new Error('writeWithDegradation: нет вариантов записи');
    }

    /** Варианты записи от полного к минимальному (для row size лимита). */
    private degradationVariants(
        fields: Record<string, unknown>,
    ): { label: string; fields: Record<string, unknown> }[] {
        const transcriptKeys = [1, 2, 3, 4].map(index =>
            this.ufName(`TRANSCRIPT_${index}`),
        );
        const withoutTranscript = Object.fromEntries(
            Object.entries(fields).filter(
                ([key]) => !transcriptKeys.includes(key),
            ),
        );
        const trimmed = Object.fromEntries(
            Object.entries(withoutTranscript).map(([key, value]) => [
                key,
                typeof value === 'string' && value.length > 1024
                    ? `${value.slice(0, 1024)}… [обрезано: лимит строки Bitrix]`
                    : value,
            ]),
        );
        return [
            { label: 'все поля', fields },
            { label: 'без транскрипта', fields: withoutTranscript },
            {
                label: 'без транскрипта, длинные тексты обрезаны до 1024',
                fields: trimmed,
            },
        ];
    }

    /**
     * Название элемента в духе записей телефонии:
     * «Исходящий звонок от 24.06.2026 15:02 · 12 мин». Без даты/длительности —
     * fallback на технический формат с activityId.
     */
    private buildTitle(input: CallReportSmartItemInput): string {
        const direction =
            input.callDirection === 'incoming'
                ? 'Входящий звонок'
                : input.callDirection === 'outgoing'
                  ? 'Исходящий звонок'
                  : 'Звонок';
        const startedAt = input.callStartedAt
            ? new Date(input.callStartedAt)
            : null;
        const date =
            startedAt && !Number.isNaN(startedAt.getTime())
                ? startedAt.toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Moscow',
                  })
                : null;
        const minutes = input.durationSec
            ? `${Math.max(1, Math.round(input.durationSec / 60))} мин`
            : null;
        if (!date && !minutes) {
            return `${CALL_REPORT_SMART_TITLE}: звонок #${input.activityId}`;
        }
        return [
            direction,
            date ? `от ${date}` : null,
            minutes ? `· ${minutes}` : null,
        ]
            .filter(Boolean)
            .join(' ');
    }

    /** id существующего элемента по внешнему коду xmlId; null — не найден. */
    private async findIdByXmlId(xmlId: string): Promise<number | null> {
        try {
            const response = (await this.bitrix.item.list(
                String(this.smartInfo.entityTypeId),
                { xmlId } as Partial<IBXItem>,
                ['id', 'xmlId'],
            )) as { result?: { items?: { id?: number }[] } };
            const id = Number(response?.result?.items?.[0]?.id);
            return id > 0 ? id : null;
        } catch (error) {
            // Fail-open: сломанный поиск не должен блокировать запись анализа —
            // выше по цепочке дедуп прикрывают ais.report_item_id и dedup_key.
            this.logger.warn(
                `Поиск элемента по xmlId=${xmlId} не выполнен: ${(error as Error).message}`,
            );
            return null;
        }
    }

    private buildFields(input: CallReportSmartItemInput): Partial<IBXItem> {
        const fields: Record<string, unknown> = {
            title: this.buildTitle(input),
        };

        // — Нативные связи смарта (работают при relations.parent у типа) —
        if (input.dealId) {
            fields[`parentId${BitrixOwnerTypeId.DEAL}`] = input.dealId;
        }
        if (input.leadId) {
            fields[`parentId${BitrixOwnerTypeId.LEAD}`] = input.leadId;
        }
        if (input.companyId) fields.companyId = input.companyId;
        if (input.contactId) fields.contactId = input.contactId;
        if (input.managerId) fields.assignedById = input.managerId;

        // — Идентификация звонка —
        this.setUf(fields, 'ACTIVITY_ID', input.activityId);
        this.setUf(fields, 'CALL_ID', input.callId);
        this.setUf(
            fields,
            'CALL_DATE',
            input.callStartedAt instanceof Date
                ? input.callStartedAt.toISOString()
                : input.callStartedAt,
        );
        this.setUf(fields, 'DURATION_SEC', input.durationSec);
        this.setUf(fields, 'MANAGER', input.managerId);
        this.setUf(fields, 'TRANSCRIPTION_ID', input.transcriptionId);

        // — Классификация —
        this.setEnumUf(fields, 'CALL_TYPE', input.callType);
        this.setBoolUf(fields, 'PRODUCTIVE', input.productive);
        this.setEnumUf(fields, 'INTERLOCUTOR_ROLE', input.interlocutorRole);
        this.setEnumUf(fields, 'SENTIMENT', input.sentiment);

        // — Следующий шаг —
        this.setBoolUf(fields, 'NEXT_STEP_SET', input.nextStepSet);
        this.setUf(fields, 'NEXT_STEP', input.nextStep);
        this.setUf(fields, 'NEXT_STEP_DATE', input.nextStepDate);

        // — Событийные флаги и справочники —
        this.setBoolUf(fields, 'PRICE_DISCUSSED', input.priceDiscussed);
        this.setBoolUf(
            fields,
            'COMPETITOR_MENTIONED',
            input.competitorMentioned,
        );
        this.setMultiEnumUf(fields, 'COMPETITORS', input.competitors);
        this.setMultiEnumUf(
            fields,
            'OBJECTION_CATEGORIES',
            input.objectionCategories,
        );
        this.setMultiEnumUf(fields, 'RISK_FLAGS', input.riskFlags);
        this.setEnumUf(fields, 'REFUSAL_CATEGORY', input.refusalCategory);

        // — Метрики речи —
        this.setUf(fields, 'TALK_RATIO_PCT', input.talkRatioPct);
        this.setUf(fields, 'QUESTIONS_COUNT', input.questionsCount);

        // — Связи с воронками (crm-поля: массив ссылок D_id) —
        this.setCrmDealUf(fields, 'DEAL_MAIN', input.mainDealId);
        this.setCrmDealUf(
            fields,
            'DEAL_PRESENTATION',
            input.presentationDealId,
        );
        this.setCrmDealUf(fields, 'DEAL_XO', input.xoDealId);

        // — Привязка к спискам отчётности —
        this.setUf(fields, 'KPI_ITEM_ID', input.kpiItem?.itemId);
        this.setEnumUf(fields, 'KPI_ITEM_STATUS', input.kpiItem?.status);
        this.setUf(fields, 'HISTORY_ITEM_ID', input.historyItem?.itemId);
        this.setEnumUf(
            fields,
            'HISTORY_ITEM_STATUS',
            input.historyItem?.status,
        );
        this.setUf(fields, 'RELATED_REPORTS', input.relatedReports);

        // — Содержание —
        this.setUf(fields, 'SUMMARY', input.summary);
        this.setBoolUf(fields, 'NEEDS_FOUND', input.needsFound);
        this.setUf(fields, 'NEEDS', input.needs);
        this.setBoolUf(fields, 'PRESENTATION_DONE', input.presentationDone);
        this.setUf(fields, 'PRODUCTS_OFFERED', input.productsOffered);
        this.setUf(fields, 'OBJECTIONS', input.objections);
        this.setUf(fields, 'OBJECTIONS_HANDLING', input.objectionsHandling);

        // — Первичный RAG —
        this.setUf(fields, 'RESUME_GIGACHAT', input.resumeGigachat);
        this.setUf(
            fields,
            'RECOMENDATION_GIGACHAT',
            input.recomendationGigachat,
        );

        // — Итоговая оценка —
        this.setUf(fields, 'SCORE', input.score);
        this.setUf(fields, 'WEIGHTED_SCORE', input.weightedScore);
        this.setUf(fields, 'SCRIPT_COMPLIANCE', input.scriptCompliance);
        this.setEnumUf(fields, 'COACHING_PRIORITY', input.coachingPriority);
        this.setUf(fields, 'SCORE_EXPLANATION', input.scoreExplanation);
        this.setUf(fields, 'SPEECH_ANALYSIS', input.speechAnalysis);
        this.setUf(
            fields,
            'EMPLOYEE_RECOMMENDATIONS',
            input.employeeRecommendations,
        );
        this.setUf(fields, 'RECOMMENDATIONS', input.recommendations);

        // — Разделы анализа —
        for (const section of input.sections ?? []) {
            this.setUf(
                fields,
                `${section.section}_RELEVANCE`,
                section.relevance,
            );
            this.setUf(fields, `${section.section}_SCORE`, section.score);
            this.setUf(fields, `${section.section}_ANALYSIS`, section.analysis);
            this.setUf(fields, `${section.section}_ADVICE`, section.advice);
        }

        // — Транскрипт кусками —
        if (input.transcript) {
            const parts = splitTranscriptForSmart(input.transcript);
            parts.forEach((part, index) => {
                this.setUf(fields, `TRANSCRIPT_${index + 1}`, part);
            });
            // Диагностика «транскрипт не заполнен»: видно, ушли ли куски
            // и под какими ключами (подозрение на молчаливый дроп длинных
            // значений string-полей на стороне Bitrix REST).
            this.logger.log(
                `Транскрипт ${input.transcript.length} симв → ${parts.length} частей, ` +
                    `ключ первой: ${this.ufName('TRANSCRIPT_1')}`,
            );
        } else {
            this.logger.warn(
                `Транскрипт пуст в input (activity ${input.activityId}) — TRANSCRIPT_N не заполняются`,
            );
        }

        // — Служебные —
        this.setUf(fields, 'AGENT_NAME', input.agentName);
        this.setUf(fields, 'AGENT_VERSION', input.agentVersion);

        return fields as Partial<IBXItem>;
    }

    private setUf(
        fields: Record<string, unknown>,
        code: string,
        value: string | number | undefined,
    ): void {
        if (value === undefined || value === '') return;
        fields[this.ufName(code)] = value;
    }

    private setBoolUf(
        fields: Record<string, unknown>,
        code: string,
        value: boolean | undefined,
    ): void {
        if (value === undefined) return;
        fields[this.ufName(code)] = value ? 1 : 0;
    }

    /** crm-поле со ссылкой на сделку: массив ['D_123'] (формат crm.item). */
    private setCrmDealUf(
        fields: Record<string, unknown>,
        code: string,
        dealId: number | undefined,
    ): void {
        if (!dealId) return;
        fields[this.ufName(code)] = [`D_${dealId}`];
    }

    /** Multi-enum: массив числовых id значений; неизвестные коды — warn и skip. */
    private setMultiEnumUf(
        fields: Record<string, unknown>,
        code: string,
        xmlIds: string[] | undefined,
    ): void {
        if (!xmlIds?.length) return;
        const mapping = this.smartInfo.enumItems[code] ?? {};
        const ids: number[] = [];
        for (const xmlId of xmlIds) {
            const enumId = mapping[xmlId];
            if (enumId === undefined) {
                this.logger.warn(
                    `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
                );
                continue;
            }
            ids.push(enumId);
        }
        if (ids.length) fields[this.ufName(code)] = ids;
    }

    /** Enum пишется числовым id значения; неизвестный код — warn и skip. */
    private setEnumUf(
        fields: Record<string, unknown>,
        code: string,
        xmlId: string | undefined,
    ): void {
        if (!xmlId) return;
        const enumId = this.smartInfo.enumItems[code]?.[xmlId];
        if (enumId === undefined) {
            this.logger.warn(
                `Неизвестное enum-значение "${xmlId}" для поля ${code} — пропущено`,
            );
            return;
        }
        fields[this.ufName(code)] = enumId;
    }

    private ufName(code: string): string {
        // Канонический ключ — из зеркала PortalDB/PortalModel (bitrixCamelId);
        // fallback — сборка по typeId (id crm.type.list — основа UF-имён,
        // НЕ entityTypeId; см. доки userfieldconfig).
        return (
            this.smartInfo.ufKeyByCode?.[code] ??
            buildCallReportItemFieldName(
                this.smartInfo.typeId ?? this.smartInfo.entityTypeId,
                code,
            )
        );
    }
}
