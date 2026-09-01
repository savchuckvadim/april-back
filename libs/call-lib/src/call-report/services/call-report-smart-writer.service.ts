import { Logger } from '@nestjs/common';
import { BitrixService, BitrixOwnerTypeId } from '@lib/bitrix';
import { buildCrmRefValue } from '@lib/bitrix/domain/crm/utils/crm-ref-format.util';
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
    /** Специальность собеседника (бухгалтер/юрист/кадровик/…). */
    specialist?: string;
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
    /**
     * Диалог уже постится в таймлайн вызывающей стороной (intake с
     * размеченным dialog) — writer тогда НЕ дублирует транскрипт в
     * таймлайн при выбросе TRANSCRIPT_N из полей.
     */
    transcriptInTimeline?: boolean;
    /** Полный транскрипт — будет разложен кусками по TRANSCRIPT_N. */
    transcript?: string;
    summary?: string;
    resumeGigachat?: string;
    recomendationGigachat?: string;
    needsFound?: boolean;
    needs?: string;
    presentationDone?: boolean;
    /** «Хвост» пройден после демонстрации (только презентация/решение). */
    hvostDone?: boolean;
    /** 5К закрыто: клиент/компания/коллеги/конкурент/критерии. */
    fiveKDone?: boolean;
    /** Разбор хвоста от AI — в поле пишется ужатым (<700 байт). */
    hvostAnalysis?: string;
    /** Разбор 5К от AI — в поле пишется ужатым. */
    fiveKAnalysis?: string;
    /** Отчёт менеджера по хвосту из сделки-презентации (пишет сверка). */
    hvostManager?: string;
    /** Отчёт менеджера по 5К из сделки-презентации (пишет сверка). */
    fiveKManager?: string;
    /**
     * Гранулярный «Хвост» — зеркало анкеты менеджера (op_xvost_*): пять
     * блоков по теме. Состав переписан 01.09.2026: было три галочки и две
     * даты, стало пять смысловых блоков, и пункты обязаны совпадать с
     * анкетой — иначе сверка «менеджер против AI» идёт по разным шкалам.
     */
    hvostSteps?: {
        desire?: boolean | null;
        offered?: boolean | null;
        priceReaction?: boolean | null;
        decisionProcess?: boolean | null;
        decisionWay?: boolean | null;
    };
    /**
     * Гранулярные «5К» — зеркало анкеты менеджера (op_5k_*): пять блоков по
     * теме вместо прежних девяти вопросов.
     */
    fiveKItems?: {
        client?: boolean | null;
        company?: boolean | null;
        colleagues?: boolean | null;
        competitor?: boolean | null;
        criteria?: boolean | null;
    };
    /**
     * Проверка по регламенту (Фаза 3 rag-driven-analysis-plan.md):
     * считает штуки, а не «в целом хорошо» — сколько нарушений, сколько
     * пропущено пунктов скрипта, сколько неверных утверждений о продукте.
     */
    complianceDone?: boolean;
    complianceSeverity?: string;
    complianceViolations?: number;
    scriptMissed?: number;
    productFactErrors?: number;
    complianceSummary?: string;
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
                await this.updateItem(existingId, xmlId, input);
                this.logger.log(
                    `Элемент смарта уже существует: #${existingId} (${xmlId}) — обновил поля, дубль не создаю`,
                );
                return existingId;
            }
        }

        const fields = this.buildFields(input, { isCreate: true });
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
        this.verifyLinks(fields, response, input, itemId);
        await this.postDroppedToTimeline(itemId, dropped, input, {
            isCreate: true,
        });
        this.logger.log(
            `Создан элемент смарта #${itemId} (activity ${input.activityId})`,
        );
        return itemId;
    }

    /**
     * Обновление ТОЛЬКО существующего элемента по активности; null —
     * элемента нет, ничего не создаётся. Для дописывающих проходов
     * (ночной ревизор): создание элемента без разбора запрещено —
     * прод-инцидент 16.08.2026: ревизор плодил почти пустые карточки
     * «только рекомендации по сделке» для звонков без смарт-элемента.
     */
    async updateExisting(
        input: CallReportSmartItemInput,
    ): Promise<number | null> {
        if (!input.activityId) return null;
        const xmlId = `aicall_${input.activityId}`;
        const existingId = await this.findIdByXmlId(xmlId);
        if (!existingId) return null;
        await this.updateItem(existingId, xmlId, input);
        return existingId;
    }

    /** Частичный update существующего элемента (общий путь upsert-веток). */
    private async updateItem(
        existingId: number,
        xmlId: string,
        input: CallReportSmartItemInput,
    ): Promise<void> {
        try {
            const sent = this.buildFields(input) as Record<string, unknown>;
            const { response, dropped } = await this.writeWithDegradation(
                sent,
                fields =>
                    this.bitrix.item.update(
                        existingId,
                        this.smartInfo.entityTypeId as never,
                        fields as Partial<IBXItem>,
                    ),
            );
            this.verifyLinks(sent, response, input, existingId);
            await this.postDroppedToTimeline(existingId, dropped, input, {
                isCreate: false,
            });
        } catch (error) {
            // Не фатально: транскрипт и ais уже в БД, разбор дольётся
            // повторным прогоном. { telegram: true } — алерт, иначе пустые
            // поля ищут неделями.
            this.logger.error(
                `Элемент #${existingId} не обновлён (${xmlId}): ${(error as Error).message}`,
                { telegram: true, itemId: existingId },
            );
        }
    }

    /**
     * Контроль факта сохранения связей (прод-урок 26.08.2026: «ни одной
     * привязанной сделки», а в логах всё зелёное).
     *
     * Bitrix на crm.item.add/update отвечает HTTP 200 и МОЛЧА отбрасывает
     * поля, которых у типа нет: нет relations.parent — нет parentId{N};
     * isClientEnabled='N' — нет companyId/contactId; crm-поле без settings
     * (привязки к DEAL) не сохраняет ['D_123']. Ошибки «неизвестное поле»
     * у метода не существует, тело запроса логируется только при отказе —
     * поэтому дроп связей был неотличим от «на портале нечего привязывать».
     *
     * Сверяем отправленное с эхом созданного/обновлённого элемента:
     * - связь отправляли, а в эхе её нет → дефект портала/установки (алерт);
     * - связей не было в input вовсе → нечего привязывать (warn, не алерт).
     * Сравнение мягкое: Битрикс возвращает id строкой, crm-поля — массивом.
     */
    private verifyLinks(
        sent: Record<string, unknown>,
        response: unknown,
        input: CallReportSmartItemInput,
        itemId: number,
    ): void {
        const echo = (
            response as { result?: { item?: Record<string, unknown> } } | null
        )?.result?.item;
        const linkKeys = [
            `parentId${BitrixOwnerTypeId.DEAL}`,
            `parentId${BitrixOwnerTypeId.LEAD}`,
            'companyId',
            'contactId',
            this.ufName('DEAL_MAIN'),
        ];
        const sentLinks = linkKeys.filter(key => sent[key] !== undefined);

        if (!sentLinks.length) {
            // Нечего привязывать: у звонка нет CRM-владельца/клиента.
            this.logger.warn(
                `Элемент #${itemId} (activity ${input.activityId}): связи НЕ отправлялись — ` +
                    `в разборе нет ни сделки, ни лида, ни компании/контакта`,
            );
            return;
        }
        // Эхо элемента доступно не во всех ответах библиотеки — без него
        // проверять нечего (молчим, чтобы не сыпать ложными алертами).
        if (!echo) return;

        // Связи — это id и ссылки вида 'D_555'; объектов тут не бывает,
        // но на всякий случай приводим их к JSON, а не к [object Object].
        const scalar = (value: unknown): string => {
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value as string | number | boolean);
        };
        const normalize = (value: unknown): string =>
            Array.isArray(value) ? value.map(scalar).join(',') : scalar(value);
        const lost = sentLinks.filter(
            key => normalize(echo[key]) !== normalize(sent[key]),
        );
        if (!lost.length) return;

        this.logger.error(
            `Элемент #${itemId} (activity ${input.activityId}): Битрикс НЕ СОХРАНИЛ связи ` +
                `[${lost.join(', ')}] — отправлено ${lost
                    .map(key => `${key}=${normalize(sent[key])}`)
                    .join(', ')}, в ответе ${lost
                    .map(key => `${key}=${normalize(echo[key]) || '—'}`)
                    .join(', ')}. ` +
                `Причина обычно в настройках смарта: нет relations.parent (сделка/лид), ` +
                `isClientEnabled='N' (компания/контакт) или crm-поле без привязки к DEAL — ` +
                `лечится переустановкой смарта (POST /call-report/install-smart)`,
            { telegram: true, itemId },
        );
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
     * элемента, см. postDroppedToTimeline; транскрипт при выбросе уходит
     * в таймлайн ЦЕЛИКОМ кусками — клиент платит за транскрибацию и
     * обязан видеть весь текст):
     *   1) все поля как есть;
     *   2) без TRANSCRIPT_N (−4 длинных поля; полный текст — в таймлайн);
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
     * Сколько байт строки элемента отдаём под ВСЕ тексты разом.
     * InnoDB даёт ~8126 байт на строку; часть съедают числа, enum'ы,
     * связи и служебные колонки — под тексты остаётся ~6.5к с запасом.
     */
    private static readonly ROW_TEXT_BUDGET_BYTES = 6500;

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
        const shrinkTo = (value: string, limitBytes: number): string => {
            let result = value;
            while (byteLength(result) > limitBytes - 2 && result.length > 1) {
                result = result.slice(
                    0,
                    Math.max(
                        1,
                        Math.floor(
                            (result.length * (limitBytes - 2)) /
                                byteLength(result),
                        ),
                    ),
                );
            }
            return `${result}…`;
        };
        const shrink = (value: string): string =>
            shrinkTo(value, CallReportSmartWriterService.LONG_FIELD_BYTES);
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

        // БЮДЖЕТНОЕ УЖАТИЕ (прод-урок 27.08.2026: «оценка есть, а разбора
        // нет»). Раньше следующим шагом после транскрипта длинные
        // НЕприоритетные тексты выбрасывались целиком — и в карточке
        // пустели именно разборы разделов и 5К, самое ценное для РОПа.
        // Теперь тексты не выбрасываются, а ужимаются под общий бюджет
        // строки: каждому текстовому полю достаётся равная доля, полные
        // версии по-прежнему уходят в таймлайн (и в недельный Excel).
        // Несколько запросов подряд эту физику не обходят: лимит — на
        // ШИРИНУ СТРОКИ таблицы, а не на размер одного запроса.
        const budgeted: Record<string, unknown> = {};
        const droppedBudgeted: DroppedField[] = [...droppedTranscript];
        const textEntries = Object.entries(withoutTranscript).filter(
            ([, value]) => typeof value === 'string' && byteLength(value) > 120,
        );
        const perFieldBudget = textEntries.length
            ? Math.min(
                  CallReportSmartWriterService.LONG_FIELD_BYTES,
                  Math.max(
                      200,
                      Math.floor(
                          CallReportSmartWriterService.ROW_TEXT_BUDGET_BYTES /
                              textEntries.length,
                      ),
                  ),
              )
            : CallReportSmartWriterService.LONG_FIELD_BYTES;
        for (const [key, value] of Object.entries(withoutTranscript)) {
            if (
                typeof value !== 'string' ||
                byteLength(value) <= perFieldBudget
            ) {
                budgeted[key] = value;
                continue;
            }
            droppedBudgeted.push({ key, value });
            budgeted[key] = shrinkTo(value, perFieldBudget);
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
                label: 'все тексты ужаты под бюджет строки',
                fields: budgeted,
                dropped: droppedBudgeted,
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
     * остальное). ТРАНСКРИПТ ГАРАНТИРОВАН (решение владельца 16.08.2026:
     * «за транскрибацию платим, клиент обязан видеть весь текст»):
     * выброшенные TRANSCRIPT_N склеиваются и постятся в таймлайн ЦЕЛИКОМ
     * кусками — кроме случая, когда вызывающая сторона уже постит диалог
     * (input.transcriptInTimeline). Разборы разделов (*_ANALYSIS/_ADVICE)
     * не постятся: intake пишет их в таймлайн отдельными комментами
     * всегда. Fail-open.
     */
    private async postDroppedToTimeline(
        itemId: number,
        dropped: DroppedField[],
        input: CallReportSmartItemInput,
        options: { isCreate: boolean },
    ): Promise<void> {
        if (!dropped.length) return;
        // Разборы разделов GREETING_ANALYSIS/…_ADVICE не постим — intake
        // постит их отдельными комментами всегда.
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

        // Транскрипт первым (окажется НИЖЕ остальных записей таймлайна).
        // ТОЛЬКО при создании элемента: на update транскрипт либо уже в
        // полях (лёг при создании и частичный update его не затирает),
        // либо уже запощен создателем — повторный пост был бы дублем
        // (кейс «каркас создал → intake обновил», оба с деградацией).
        const droppedTranscript = dropped.filter(field =>
            transcriptKeys.has(field.key),
        );
        if (
            droppedTranscript.length &&
            options.isCreate &&
            !input.transcriptInTimeline
        ) {
            await this.postFullTranscript(itemId, droppedTranscript);
        }
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

    /**
     * Полный транскрипт в таймлайн элемента: выброшенные TRANSCRIPT_N
     * склеиваются в исходный текст (нарезались подряд кусками по 40к) и
     * постятся частями. Части постятся в ОБРАТНОМ порядке — таймлайн
     * показывает новое сверху, так часть 1 оказывается первой при чтении
     * сверху вниз. Fail-open на каждую часть.
     */
    private async postFullTranscript(
        itemId: number,
        droppedTranscript: DroppedField[],
    ): Promise<void> {
        const fullText = [...droppedTranscript]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(field => field.value)
            .join('');
        if (!fullText.trim()) return;
        const parts = this.splitForComment(fullText);
        for (let i = parts.length - 1; i >= 0; i--) {
            const partLabel =
                parts.length > 1 ? ` — часть ${i + 1} из ${parts.length}` : '';
            await this.bitrix.timeline
                .addTimelineComment({
                    ENTITY_ID: itemId,
                    ENTITY_TYPE: `DYNAMIC_${this.smartInfo.entityTypeId}`,
                    COMMENT: `📜 [b]Транскрипт звонка[/b]${partLabel}:\n\n${parts[i]}`,
                    AUTHOR_ID: '1',
                })
                .catch((error: Error) =>
                    this.logger.warn(
                        `Транскрипт (часть ${i + 1}) не запощен в таймлайн #${itemId}: ${error.message}`,
                    ),
                );
        }
        this.logger.log(
            `Элемент #${itemId}: полный транскрипт ушёл в таймлайн ${parts.length} частями (в поля не поместился)`,
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
    /** Название из паспорта звонка; null — паспорта в этом проходе нет. */
    private buildTitle(input: CallReportSmartItemInput): string | null {
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
        // Ни даты, ни длительности — паспорта звонка в этом проходе нет:
        // название не строим (решение о fallback принимает buildFields).
        if (!date && !minutes) return null;
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

    private buildFields(
        input: CallReportSmartItemInput,
        options?: { isCreate?: boolean },
    ): Partial<IBXItem> {
        const fields: Record<string, unknown> = {};
        // Название строится из паспорта звонка (дата/длительность), который
        // есть только у каркаса. Дописывающие проходы (ревизор, сверка
        // презентаций) паспорт не передают — им название трогать НЕЛЬЗЯ,
        // иначе карточка обезличивается («AI-анализ звонков: звонок #101»).
        const title = this.buildTitle(input);
        if (title) fields.title = title;
        else if (options?.isCreate) {
            fields.title = `${CALL_REPORT_SMART_TITLE}: звонок #${input.activityId}`;
        }

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
        this.setEnumUf(fields, 'SPECIALIST', input.specialist);
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
        this.setBoolUf(fields, 'HVOST_DONE', input.hvostDone);
        this.setBoolUf(fields, 'FIVE_K_DONE', input.fiveKDone);
        // Гранулярные пункты хвоста/5К (null «не применимо» поле не трогает).
        const steps = input.hvostSteps;
        this.setBoolUf(fields, 'HVOST_DESIRE', steps?.desire ?? undefined);
        this.setBoolUf(fields, 'HVOST_OFFERED', steps?.offered ?? undefined);
        this.setBoolUf(
            fields,
            'HVOST_PRICE_REACTION',
            steps?.priceReaction ?? undefined,
        );
        this.setBoolUf(
            fields,
            'HVOST_DECISION_PROCESS',
            steps?.decisionProcess ?? undefined,
        );
        this.setBoolUf(
            fields,
            'HVOST_DECISION_WAY',
            steps?.decisionWay ?? undefined,
        );
        const fiveK = input.fiveKItems;
        this.setBoolUf(fields, 'FIVE_K_CLIENT', fiveK?.client ?? undefined);
        this.setBoolUf(fields, 'FIVE_K_COMPANY', fiveK?.company ?? undefined);
        this.setBoolUf(
            fields,
            'FIVE_K_COLLEAGUES',
            fiveK?.colleagues ?? undefined,
        );
        this.setBoolUf(
            fields,
            'FIVE_K_COMPETITOR',
            fiveK?.competitor ?? undefined,
        );
        this.setBoolUf(fields, 'FIVE_K_CRITERIA', fiveK?.criteria ?? undefined);
        // Краткие версии в полях (ужаты до <700 байт — row size), полные
        // тексты AI-разбора живут в таймлайне элемента.
        this.setShortTextUf(fields, 'HVOST_ANALYSIS', input.hvostAnalysis);
        this.setShortTextUf(fields, 'FIVE_K_ANALYSIS', input.fiveKAnalysis);
        this.setShortTextUf(fields, 'HVOST_MANAGER', input.hvostManager);
        this.setShortTextUf(fields, 'FIVE_K_MANAGER', input.fiveKManager);
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
        // Проверка по регламенту: числа — в поля (по ним фильтруют и
        // считают), полный разбор нарушений — в таймлайн элемента.
        this.setBoolUf(fields, 'COMPLIANCE_DONE', input.complianceDone);
        this.setEnumUf(fields, 'COMPLIANCE_SEVERITY', input.complianceSeverity);
        this.setUf(fields, 'COMPLIANCE_VIOLATIONS', input.complianceViolations);
        this.setUf(fields, 'SCRIPT_MISSED', input.scriptMissed);
        this.setUf(fields, 'PRODUCT_FACT_ERRORS', input.productFactErrors);
        this.setShortTextUf(
            fields,
            'COMPLIANCE_SUMMARY',
            input.complianceSummary,
        );

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
        fields[this.ufName(code)] = this.coerceScalar(code, value);
    }

    /**
     * Защита от «Array» и «[object Object]» в текстовых полях карточки.
     *
     * Битрикс — PHP: массив, попавший в строковое поле, сохраняется как
     * литерал «Array» (боевой кейс 27.08.2026: «Предложенные продукты:
     * Array»). Из LLM значения иногда приезжают структурой там, где
     * ожидалась строка, поэтому приводим к тексту в единственной точке
     * записи и громко логируем, чтобы чинить источник.
     */
    private coerceScalar(
        code: string,
        value: string | number | undefined,
    ): string | number | undefined {
        if (typeof value === 'string' || typeof value === 'number') {
            return value;
        }
        const raw: unknown = value;
        if (Array.isArray(raw)) {
            const text = raw
                .map(item =>
                    typeof item === 'object' && item !== null
                        ? JSON.stringify(item)
                        : String(item as string | number | boolean),
                )
                .filter(Boolean)
                .join('\n');
            this.logger.warn(
                `Поле ${code}: пришёл массив вместо строки — склеил по ` +
                    `строкам (иначе Битрикс сохранил бы «Array»)`,
            );
            return text || undefined;
        }
        if (raw !== null && typeof raw === 'object') {
            this.logger.warn(
                `Поле ${code}: пришёл объект вместо строки — записываю JSON`,
            );
            return JSON.stringify(raw);
        }
        return undefined;
    }

    private setBoolUf(
        fields: Record<string, unknown>,
        code: string,
        value: boolean | undefined,
    ): void {
        if (value === undefined) return;
        fields[this.ufName(code)] = value ? 1 : 0;
    }

    /**
     * Короткое текстовое поле: значение всегда ужимается до порога
     * «длинного» поля (<700 байт) — такие поля не платят 768-байтовый
     * префикс row size и безопасны в любом количестве. Полные тексты
     * вызывающий публикует в таймлайн сам.
     */
    private setShortTextUf(
        fields: Record<string, unknown>,
        code: string,
        value: string | undefined,
    ): void {
        const trimmed = value?.trim();
        if (!trimmed) return;
        this.setUf(fields, code, this.shrinkToShortField(trimmed));
    }

    /** Ужать строку до лимита короткого поля по БАЙТАМ (граница символов). */
    private shrinkToShortField(value: string): string {
        const limit = CallReportSmartWriterService.LONG_FIELD_BYTES - 2;
        if (Buffer.byteLength(value, 'utf8') <= limit) return value;
        let result = value;
        while (Buffer.byteLength(result, 'utf8') > limit) {
            result = result.slice(
                0,
                Math.floor(
                    (result.length * limit) / Buffer.byteLength(result, 'utf8'),
                ),
            );
        }
        return `${result}…`;
    }

    /**
     * crm-поле со ссылкой на сделку.
     *
     * ФОРМАТ ЗАДАЁТ САМ БИТРИКС (прод-инцидент 27.08.2026: «нашли сделку
     * ОП Презентации, а поле пустое»): если поле привязано к ОДНОМУ типу
     * сущности (наши DEAL_MAIN/DEAL_PRESENTATION/DEAL_XO — только DEAL),
     * хранится ГОЛЫЙ id — `1024`; значение `D_1024` такое поле молча
     * отбрасывает. Префикс нужен только полям с несколькими типами.
     * Привязки берём из того же реестра, по которому установщик создаёт
     * поля, — формат и настройка поля не могут разъехаться.
     */
    private setCrmDealUf(
        fields: Record<string, unknown>,
        code: string,
        dealId: number | undefined,
    ): void {
        if (!dealId) return;
        const definition = CALL_REPORT_SMART_FIELDS.find(
            field => field.code === code,
        );
        const allowedTypes = definition?.crmEntities ?? [];
        const value = buildCrmRefValue(allowedTypes, 'DEAL', dealId);
        // МНОЖЕСТВЕННОСТЬ ТОЖЕ ЗАДАЁТ ПОЛЕ (прод-алерт 28.08.2026):
        // наши crm-поля одиночные (multiple='N'), а массив в такое поле
        // PHP-Битрикс приводит к строке и сохраняет литерал «Array» —
        // ровно это возвращалось в эхе элемента.
        fields[this.ufName(code)] = definition?.isMultiple ? [value] : value;
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
