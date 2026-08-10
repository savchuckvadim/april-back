import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { IBXItem } from '@lib/bitrix/domain/crm/item/interface/item.interface';
import {
    buildCallReportItemFieldName,
    CALL_REPORT_SECTION_CODES,
    CALL_REPORT_SMART_FIELDS,
    CALL_REPORT_SMART_TITLE,
    CallReportLinkStatusCode,
    CallReportSectionCode,
    splitTranscriptForSmart,
} from '../config/call-report-smart.config';

/** Поле, не поместившееся в строку элемента (уходит в таймлайн). */
interface DroppedField {
    /** UF-ключ поля (camelCase). */
    key: string;
    /** Полное значение. */
    value: string;
}
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
                try {
                    const { dropped } = await this.writeWithDegradation(
                        this.buildFields(input),
                        fields =>
                            this.bitrix.item.update(
                                existingId,
                                this.smartInfo.entityTypeId as never,
                                fields as Partial<IBXItem>,
                            ),
                    );
                    await this.postDroppedToTimeline(existingId, dropped);
                } catch (error) {
                    // Не фатально: транскрипт и ais уже в БД, разбор
                    // дольётся повторным прогоном. { telegram: true } —
                    // алерт, иначе пустые поля ищут неделями.
                    this.logger.error(
                        `Элемент #${existingId} не обновлён (${xmlId}): ${(error as Error).message}`,
                        { telegram: true, itemId: existingId },
                    );
                }
                this.logger.log(
                    `Элемент смарта уже существует: #${existingId} (${xmlId}) — обновил поля, дубль не создаю`,
                );
                return existingId;
            }
        }

        const fields = this.buildFields(input);
        if (xmlId) fields.xmlId = xmlId;
        const { response, dropped } = await this.writeWithDegradation(
            fields as Record<string, unknown>,
            degraded =>
                this.bitrix.item.add(
                    String(this.smartInfo.entityTypeId),
                    degraded as Partial<IBXItem>,
                ),
        );
        const itemId = Number(
            (response as { result?: { item?: { id?: number } } } | undefined)
                ?.result?.item?.id,
        );
        if (!itemId) {
            throw new Error(
                `crm.item.add не вернул id элемента (activity ${input.activityId})`,
            );
        }
        await this.postDroppedToTimeline(itemId, dropped);
        this.logger.log(
            `Создан элемент смарта #${itemId} (activity ${input.activityId})`,
        );
        return itemId;
    }

    /**
     * Запись с деградацией под лимит строки MySQL Битрикса.
     *
     * ФИЗИКА ЛИМИТА (прод-уроки 05–10.08.2026, зафиксировано скиллом
     * .claude/skills/bitrix-field-limits): UF-поля смарта — колонки одной
     * строки таблицы b_crm_dynamic_items_{typeId}; InnoDB даёт ~8126 байт
     * на строку. Каждое текстовое поле ДЛИННЕЕ ~768 байт занимает в строке
     * фиксированный 768-байтовый префикс НЕЗАВИСИМО от длины — поэтому
     * обрезка длинного текста до 1-2к символов НЕ помогает (проверено:
     * 10.08 все три старых варианта упали подряд). Помогает только
     * УМЕНЬШЕНИЕ ЧИСЛА длинных полей либо укорачивание до <700 байт.
     *
     * Стратегия (что выброшено — постится полным текстом в таймлайн
     * элемента, см. postDroppedToTimeline):
     *   1) все поля как есть;
     *   2) без TRANSCRIPT_N (−4 длинных поля; текст есть в БД и таймлайне);
     *   3) остаются только приоритетные тексты, ужатые до <700 байт,
     *      остальные длинные — в таймлайн;
     *   4) только числа/enum/связи + SUMMARY <700 байт.
     * Иная ошибка (не row size) пробрасывается сразу.
     */
    private async writeWithDegradation(
        fields: Record<string, unknown>,
        write: (fields: Record<string, unknown>) => Promise<unknown>,
    ): Promise<{ response: unknown; dropped: DroppedField[] }> {
        const variants = this.degradationVariants(fields);
        for (let i = 0; i < variants.length; i++) {
            const variant = variants[i];
            try {
                const response = await write(variant.fields);
                return { response, dropped: variant.dropped };
            } catch (error) {
                const hasNext = i + 1 < variants.length;
                if (!this.isRowSizeError(error) || !hasNext) throw error;
                this.logger.warn(
                    `Строка смарта не влезла в лимит Bitrix (${variant.label}) — ` +
                        `повторяю: ${variants[i + 1].label}`,
                );
            }
        }
        // Недостижимо: последний вариант либо вернулся, либо бросил.
        throw new Error('writeWithDegradation: нет вариантов записи');
    }

    /**
     * Детект «Row size too large» и в message, и в теле ответа Bitrix:
     * AxiosError.message — это «Request failed with status code 400», сам
     * текст MySQL-ошибки лежит в response.data.error_description
     * (прод-урок 06.08.2026: детект только по message деградацию не включал).
     */
    private isRowSizeError(error: unknown): boolean {
        const axiosLike = error as {
            message?: string;
            response?: { data?: unknown };
        };
        let responseText = '';
        try {
            responseText = JSON.stringify(axiosLike?.response?.data ?? '');
        } catch {
            // Циклическая структура в data — детектим только по message.
            responseText = '';
        }
        return `${axiosLike?.message ?? ''} ${responseText}`.includes(
            'Row size too large',
        );
    }

    /** Байтовый порог «длинного» поля: длиннее — платит 768-байт префикс. */
    private static readonly LONG_FIELD_BYTES = 700;

    /**
     * Коды текстовых полей, которые важнее всего оставить В ПОЛЯХ элемента
     * (для фильтров/списков); остальные длинные тексты при деградации
     * уезжают полным текстом в таймлайн.
     */
    private static readonly PRIORITY_TEXT_CODES = [
        'SUMMARY',
        'SCORE_EXPLANATION',
        'RECOMMENDATIONS',
        'EMPLOYEE_RECOMMENDATIONS',
        'NEEDS',
        'PRODUCTS_OFFERED',
        'OBJECTIONS',
        'NEXT_STEP',
    ];

    /** Варианты записи от полного к минимальному (для row size лимита). */
    private degradationVariants(fields: Record<string, unknown>): {
        label: string;
        fields: Record<string, unknown>;
        dropped: DroppedField[];
    }[] {
        const transcriptKeys = [1, 2, 3, 4].map(index =>
            this.ufName(`TRANSCRIPT_${index}`),
        );
        const priorityKeys =
            CallReportSmartWriterService.PRIORITY_TEXT_CODES.map(code =>
                this.ufName(code),
            );
        const byteLength = (value: string): number =>
            Buffer.byteLength(value, 'utf8');
        /** Обрезка строки до лимита БАЙТ по границе символов. */
        const shrink = (value: string): string => {
            let result = value;
            while (
                byteLength(result) >
                CallReportSmartWriterService.LONG_FIELD_BYTES - 2
            ) {
                result = result.slice(
                    0,
                    Math.floor(
                        (result.length *
                            (CallReportSmartWriterService.LONG_FIELD_BYTES -
                                2)) /
                            byteLength(result),
                    ),
                );
            }
            return `${result}…`;
        };
        const isLongText = (value: unknown): value is string =>
            typeof value === 'string' &&
            byteLength(value) > CallReportSmartWriterService.LONG_FIELD_BYTES;

        const withoutTranscript: Record<string, unknown> = {};
        const droppedTranscript: DroppedField[] = [];
        for (const [key, value] of Object.entries(fields)) {
            if (transcriptKeys.includes(key)) {
                droppedTranscript.push({ key, value: String(value) });
            } else {
                withoutTranscript[key] = value;
            }
        }

        const prioritized: Record<string, unknown> = {};
        const droppedPrioritized: DroppedField[] = [...droppedTranscript];
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (!isLongText(value)) {
                prioritized[key] = value;
                continue;
            }
            // Длинный текст: приоритетный — ужимается до <700 байт (полный
            // уходит в таймлайн), остальные — целиком в таймлайн.
            droppedPrioritized.push({ key, value });
            if (priorityKeys.includes(key)) {
                prioritized[key] = shrink(value);
            }
        }

        const summaryKey = this.ufName('SUMMARY');
        const minimal: Record<string, unknown> = {};
        const droppedMinimal: DroppedField[] = [...droppedTranscript];
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (typeof value !== 'string' || byteLength(value) <= 255) {
                minimal[key] = value;
                continue;
            }
            droppedMinimal.push({ key, value });
            if (key === summaryKey) {
                minimal[key] = shrink(value);
            }
        }

        return [
            { label: 'все поля', fields, dropped: [] },
            {
                label: 'без транскрипта',
                fields: withoutTranscript,
                dropped: droppedTranscript,
            },
            {
                label: 'приоритетные тексты <700 байт, остальное — в таймлайн',
                fields: prioritized,
                dropped: droppedPrioritized,
            },
            {
                label: 'минимум: числа/enum + краткое резюме',
                fields: minimal,
                dropped: droppedMinimal,
            },
        ];
    }

    /**
     * Не поместившееся в поля — полным текстом в таймлайн элемента
     * (порядок владельца 10.08.2026: резюме GigaChat → рекомендации →
     * остальное). Транскрипт не постится: он уже в таймлайне диалогом и в
     * БД. Разборы разделов (*_ANALYSIS/_ADVICE) не постятся: intake пишет
     * их в таймлайн отдельными комментами всегда. Fail-open.
     */
    private async postDroppedToTimeline(
        itemId: number,
        dropped: DroppedField[],
    ): Promise<void> {
        if (!dropped.length) return;
        // Не постим: транскрипт (уже в таймлайне диалогом и в БД) и разборы
        // разделов GREETING_ANALYSIS/…_ADVICE (intake постит их всегда).
        const sectionKeys = new Set(
            CALL_REPORT_SECTION_CODES.flatMap(section => [
                this.ufName(`${section}_ANALYSIS`),
                this.ufName(`${section}_ADVICE`),
            ]),
        );
        const transcriptKeys = new Set(
            [1, 2, 3, 4].map(index => this.ufName(`TRANSCRIPT_${index}`)),
        );
        const skip = (key: string): boolean =>
            transcriptKeys.has(key) || sectionKeys.has(key);
        const order = [
            'RESUME_GIGACHAT',
            'RECOMENDATION_GIGACHAT',
            'SUMMARY',
            'SCORE_EXPLANATION',
            'RECOMMENDATIONS',
            'EMPLOYEE_RECOMMENDATIONS',
            'SPEECH_ANALYSIS',
        ].map(code => this.ufName(code));
        const rank = (key: string): number => {
            const index = order.indexOf(key);
            return index === -1 ? order.length : index;
        };
        const postable = dropped
            .filter(field => !skip(field.key))
            .sort((a, b) => rank(a.key) - rank(b.key));

        for (const field of postable) {
            const title = this.fieldTitleByKey(field.key);
            const parts = this.splitForComment(field.value);
            for (let i = 0; i < parts.length; i++) {
                const partLabel =
                    parts.length > 1 ? ` (часть ${i + 1}/${parts.length})` : '';
                await this.bitrix.timeline
                    .addTimelineComment({
                        ENTITY_ID: itemId,
                        ENTITY_TYPE: `DYNAMIC_${this.smartInfo.entityTypeId}`,
                        COMMENT: `📎 [b]${title}[/b]${partLabel} — полностью (в поле элемента не поместилось):\n\n${parts[i]}`,
                        AUTHOR_ID: '1',
                    })
                    .catch((error: Error) =>
                        this.logger.warn(
                            `Полный текст «${title}» не запощен в таймлайн #${itemId}: ${error.message}`,
                        ),
                    );
            }
        }
        this.logger.log(
            `Элемент #${itemId}: ${postable.length} полей ушли полным текстом в таймлайн (row size лимит)`,
        );
    }

    /** Русское название поля по его UF-ключу (для заголовка коммента). */
    private fieldTitleByKey(key: string): string {
        const code = Object.keys(this.smartInfo.ufKeyByCode ?? {}).find(
            fieldCode => this.ufName(fieldCode) === key,
        );
        const byConfig = CALL_REPORT_SMART_FIELDS.find(
            field => this.ufName(field.code) === key || field.code === code,
        );
        return byConfig?.name ?? code ?? key;
    }

    /** Длинный текст → части для комментов таймлайна. */
    private splitForComment(value: string, partSize = 8000): string[] {
        if (value.length <= partSize) return [value];
        const parts: string[] = [];
        for (let i = 0; i < value.length; i += partSize) {
            parts.push(value.slice(i, i + partSize));
        }
        return parts;
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
