import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';

import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_COACHING_CODES,
    CALL_REPORT_COMPETITOR_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_LINK_STATUS_CODES,
    CALL_REPORT_OBJECTION_CODES,
    CALL_REPORT_REFUSAL_CODES,
    CALL_REPORT_RISK_FLAG_CODES,
    CALL_REPORT_SECTION_CODES,
    CALL_REPORT_SENTIMENT_CODES,
    CallReportCoachingCode,
    CallReportCompetitorCode,
    CallReportInterlocutorCode,
    CallReportLinkStatusCode,
    CallReportObjectionCode,
    CallReportRefusalCode,
    CallReportRiskFlagCode,
    CallReportSectionCode,
    CallReportSentimentCode,
} from '@lib/call-lib';

/** Типы звонков — единый источник: конфиг смарта call-report. */
export const AGENT_CALL_TYPES = CALL_REPORT_CALL_TYPE_CODES;

export type AgentCallType = (typeof AGENT_CALL_TYPES)[number];

/** Разбор одного формализованного раздела разговора. */
export class AgentSectionAnalysisDto {
    @ApiProperty({
        description:
            'Код раздела: GREETING (приветствие), NEEDS (выявление потребностей), ' +
            'PRESENTATION (презентация под потребности), OBJECTIONS (работа с ' +
            'возражениями), PRICE (работа по цене), CLOSING (закрытие разговора), ' +
            'REFUSAL (поведение при отказах).',
        enum: CALL_REPORT_SECTION_CODES,
        example: 'OBJECTIONS',
    })
    @IsString()
    @IsIn(CALL_REPORT_SECTION_CODES as unknown as string[])
    section: CallReportSectionCode;

    @ApiProperty({
        description:
            'Коэффициент актуальности раздела для ЭТОГО типа звонка, 0–100. ' +
            '0 — раздел не применим (например «Работа по цене» в холодном звонке): ' +
            'оценка не ставится и раздел не влияет на итог.',
        example: 100,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsInt()
    @Min(0)
    @Max(100)
    relevance: number;

    @ApiPropertyOptional({
        description:
            'Оценка работы менеджера в разделе, 1–10. Обязательна при relevance > 0.',
        example: 6,
        type: Number,
        minimum: 1,
        maximum: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    score?: number;

    @ApiPropertyOptional({
        description:
            'Разбор раздела: что происходило, что сделано хорошо/плохо и ПОЧЕМУ ' +
            '(причинные цепочки: возражение ← слабое выявление потребностей ← слабый контакт).',
        example:
            'Возражение «дорого» возникло из-за того, что потребности не были выявлены...',
        type: String,
    })
    @IsOptional()
    @IsString()
    analysis?: string;

    @ApiPropertyOptional({
        description:
            'Рекомендации по разделу: как можно/нужно было ответить, какие есть ' +
            'альтернативные варианты, что и как потренировать.',
        example:
            'Ответить: «Понимаю. А чем пользуетесь сейчас?..» Потренировать: 3 варианта ответа на «дорого».',
        type: String,
    })
    @IsOptional()
    @IsString()
    advice?: string;

    @ApiPropertyOptional({
        description:
            '«Как было»: что реально происходило в этом разделе разговора — ' +
            'фактическое поведение менеджера, при возможности с цитатой. ' +
            'Идёт первой строкой записи раздела в таймлайне смарт-элемента.',
        example:
            'Менеджер поздоровался по скрипту, но не представил компанию и сразу перешёл к делу.',
        type: String,
    })
    @IsOptional()
    @IsString()
    asWas?: string;

    @ApiPropertyOptional({
        description:
            '«Что в таком подходе не самое хорошее»: конкретные слабые места ' +
            'подхода менеджера в этом разделе и их последствия.',
        example:
            'Без представления компании собеседник не понимает контекст — растёт недоверие.',
        type: String,
    })
    @IsOptional()
    @IsString()
    weaknesses?: string;

    @ApiPropertyOptional({
        description:
            '«Как можно было по-другому»: 1–3 альтернативных варианта ' +
            'поведения/фраз (каждый элемент массива — отдельный вариант, ' +
            'в таймлайне выводятся нумерованным списком).',
        example: [
            '«Добрый день, компания Гарант, меня зовут…» — полное представление.',
            'Начать с уточнения, удобно ли говорить.',
            'Сослаться на предыдущий контакт/заявку.',
        ],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    alternatives?: string[];
}

/** Привязка к сделкам воронок (если агент установил связь по смыслу). */
export class AgentRelatedDealsDto {
    @ApiPropertyOptional({
        description: 'ID основной сделки ОП (воронка sales_base).',
        example: 12345,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    mainDealId?: number;

    @ApiPropertyOptional({
        description: 'ID сделки ОП Презентации (воронка sales_presentation).',
        example: 12346,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    presentationDealId?: number;

    @ApiPropertyOptional({
        description: 'ID сделки ХО (воронка sales_xo).',
        example: 12347,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    xoDealId?: number;
}

/** Следующий шаг по итогам звонка (валиден при наличии что/кто/когда). */
export class AgentNextStepDto {
    @ApiProperty({
        description:
            'Назначен ли конкретный следующий шаг. Валидный шаг содержит ' +
            '«что/кто/когда»; «клиент подумает» — НЕ следующий шаг.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    set: boolean;

    @ApiPropertyOptional({
        description: 'Формулировка шага: что именно, кто делает, как свяжемся.',
        example:
            'Презентация по Zoom, проводит менеджер, клиент подключает главбуха',
        type: String,
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description: 'Дата следующего шага (YYYY-MM-DD), если названа.',
        example: '2026-07-24',
        type: String,
    })
    @IsOptional()
    @IsString()
    date?: string;
}

/** Привязка к элементу списка отчётности (KPI / История). */
export class AgentListItemLinkDto {
    @ApiProperty({
        description: 'ID элемента списка Bitrix.',
        example: '10231',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    itemId: string;

    @ApiProperty({
        description:
            'Уверенность привязки: confirmed — точно эта запись, suspected — похоже, но не точно.',
        enum: CALL_REPORT_LINK_STATUS_CODES,
        example: 'confirmed',
    })
    @IsString()
    @IsIn(CALL_REPORT_LINK_STATUS_CODES as unknown as string[])
    status: CallReportLinkStatusCode;
}

/** Статусы результата события — коды event-sales flow (report.resultStatus). */
export const AGENT_FLOW_RESULT_STATUSES = [
    'result',
    'noresult',
    'expired',
] as const;

export type AgentFlowResultStatus = (typeof AGENT_FLOW_RESULT_STATUSES)[number];

/** Причины недозвона — коды event-sales flow (report.noresultReason). */
export const AGENT_FLOW_NORESULT_REASONS = [
    'secretar',
    'nopickup',
    'nonumber',
    'busy',
    'noresult_notime',
    'nocontact',
    'giveup',
    'bay',
    'wrong',
    'auto',
] as const;

export type AgentFlowNoresultReason =
    (typeof AGENT_FLOW_NORESULT_REASONS)[number];

/** Типы планируемого события — коды event-sales flow (plan.type). */
export const AGENT_FLOW_PLAN_TYPES = [
    'cold',
    'warm',
    'presentation',
    'hot',
    'moneyAwait',
    'supply',
] as const;

export type AgentFlowPlanType = (typeof AGENT_FLOW_PLAN_TYPES)[number];

/** Черновик отчёта о звонке в кодах event-sales flow. */
export class AgentFlowReportDraftDto {
    @ApiProperty({
        description:
            'Статус результата звонка: result — контакт состоялся и есть результат, ' +
            'noresult — пообщаться не удалось, expired — контакт был, договорились перенести.',
        enum: AGENT_FLOW_RESULT_STATUSES,
        example: 'result',
    })
    @IsString()
    @IsIn(AGENT_FLOW_RESULT_STATUSES as unknown as string[])
    resultStatus: AgentFlowResultStatus;

    @ApiPropertyOptional({
        description:
            'Причина недозвона (только при resultStatus=noresult): secretar / nopickup / ' +
            'busy / auto и т.д. — коды справочника event-sales.',
        enum: AGENT_FLOW_NORESULT_REASONS,
        example: 'secretar',
    })
    @IsOptional()
    @IsString()
    @IsIn(AGENT_FLOW_NORESULT_REASONS as unknown as string[])
    noresultReasonCode?: AgentFlowNoresultReason;
}

/** Черновик плана следующего события в кодах event-sales flow. */
export class AgentFlowPlanDraftDto {
    @ApiProperty({
        description: 'Запланирован ли следующий контакт по итогам звонка.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isPlanned: boolean;

    @ApiPropertyOptional({
        description:
            'Тип планируемого события (при isPlanned=true): warm — обычный повторный ' +
            'звонок, presentation — презентация, hot — клиент принимает решение и т.д.',
        enum: AGENT_FLOW_PLAN_TYPES,
        example: 'presentation',
    })
    @IsOptional()
    @IsString()
    @IsIn(AGENT_FLOW_PLAN_TYPES as unknown as string[])
    typeCode?: AgentFlowPlanType;

    @ApiPropertyOptional({
        description: 'Краткое название планируемого события.',
        example: 'Провести презентацию Гарант Универсал',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Дата следующего контакта в формате YYYY-MM-DD.',
        example: '2026-07-24',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadlineDate?: string;
}

/**
 * Черновик события для будущей автоотправки в POST /event-sales/flow.
 * Сейчас НИКУДА не отправляется — копится в БД (ais.report_result) для
 * анализа качества; переходное состояние — отправка по утверждению менеджера.
 */
export class AgentFlowDraftDto {
    @ApiProperty({
        description: 'Черновик отчёта о звонке (report-часть flow).',
        type: AgentFlowReportDraftDto,
    })
    @ValidateNested()
    @Type(() => AgentFlowReportDraftDto)
    report: AgentFlowReportDraftDto;

    @ApiProperty({
        description: 'Черновик плана следующего события (plan-часть flow).',
        type: AgentFlowPlanDraftDto,
    })
    @ValidateNested()
    @Type(() => AgentFlowPlanDraftDto)
    plan: AgentFlowPlanDraftDto;
}

/** Возражение клиента и как менеджер его отработал. */
export class AgentObjectionDto {
    @ApiProperty({
        description: 'Формулировка возражения клиента из разговора.',
        example: 'Дорого, у нас уже есть КонсультантПлюс',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    objection: string;

    @ApiPropertyOptional({
        description: 'Как менеджер отработал возражение (если отработал).',
        example: 'Предложил сравнение тарифов и демо-доступ',
        type: String,
    })
    @IsOptional()
    @IsString()
    handling?: string;

    @ApiPropertyOptional({
        description: 'Оценка агента: возражение отработано успешно.',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    handled?: boolean;

    @ApiPropertyOptional({
        description:
            'Категория возражения по закрытому справочнику (для трендов).',
        enum: CALL_REPORT_OBJECTION_CODES,
        example: 'price',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_OBJECTION_CODES as unknown as string[])
    category?: CallReportObjectionCode;

    @ApiPropertyOptional({
        description:
            'Цитата-доказательство из транскрипта (дословная фраза клиента).',
        example: 'Да у нас Консультант стоит, зачем нам второй',
        type: String,
    })
    @IsOptional()
    @IsString()
    quote?: string;

    @ApiPropertyOptional({
        description:
            'Исход после ответа менеджера: разговор продолжился конструктивно / ' +
            'клиент согласился / разговор свернулся. Замыкает петлю ' +
            '«ответ → исход» для библиотеки лучших ответов.',
        enum: ['continued', 'converted', 'disengaged'],
        example: 'continued',
    })
    @IsOptional()
    @IsString()
    @IsIn(['continued', 'converted', 'disengaged'])
    outcome?: 'continued' | 'converted' | 'disengaged';
}

/**
 * Результат глубокого анализа звонка внешним агентом (OpenClaw/claude-code).
 * Принимается в POST /agent/calls/:transcriptionId/analysis; на его основе
 * создаётся элемент смарт-процесса «AI-анализ звонков».
 */
export class AgentCallAnalysisDto {
    @ApiProperty({
        description:
            'Тип звонка, определённый агентом. Должен совпадать с кодами ' +
            'enum-поля CALL_TYPE смарт-процесса.',
        enum: AGENT_CALL_TYPES,
        example: 'presentation',
    })
    @IsString()
    @IsIn(AGENT_CALL_TYPES as unknown as string[])
    callType: AgentCallType;

    @ApiPropertyOptional({
        description:
            'Итоговый статус звонка: результативный или нет (был контакт и продвижение).',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    productive?: boolean;

    @ApiPropertyOptional({
        description:
            'С кем в итоге говорили: ЛПР / пользователь / секретарь / другое. ' +
            'Для холодных звонков «вышел на ЛПР» — мера успеха.',
        enum: CALL_REPORT_INTERLOCUTOR_CODES,
        example: 'lpr',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_INTERLOCUTOR_CODES as unknown as string[])
    interlocutorRole?: CallReportInterlocutorCode;

    @ApiPropertyOptional({
        description: 'Общий тон клиента в разговоре.',
        enum: CALL_REPORT_SENTIMENT_CODES,
        example: 'neutral',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_SENTIMENT_CODES as unknown as string[])
    sentiment?: CallReportSentimentCode;

    @ApiPropertyOptional({
        description:
            'Следующий шаг по итогам звонка — ключевой предиктор сделки.',
        type: AgentNextStepDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentNextStepDto)
    nextStep?: AgentNextStepDto;

    @ApiPropertyOptional({
        description: 'Обсуждалась ли цена в разговоре.',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    priceDiscussed?: boolean;

    @ApiPropertyOptional({
        description:
            'Упомянутые конкуренты по закрытому справочнику (для win-loss трендов).',
        enum: CALL_REPORT_COMPETITOR_CODES,
        isArray: true,
        example: ['consultant'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_COMPETITOR_CODES as unknown as string[], { each: true })
    competitors?: CallReportCompetitorCode[];

    @ApiPropertyOptional({
        description:
            'Категории всех возражений звонка по закрытому справочнику ' +
            '(дублирует objections[].category для фильтров смарта).',
        enum: CALL_REPORT_OBJECTION_CODES,
        isArray: true,
        example: ['price', 'need'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_OBJECTION_CODES as unknown as string[], { each: true })
    objectionCategories?: CallReportObjectionCode[];

    @ApiPropertyOptional({
        description:
            'Риск-флаги для немедленного внимания руководителя: обещание, ' +
            'конфликт, нарушение регламента, сильный негатив клиента.',
        enum: CALL_REPORT_RISK_FLAG_CODES,
        isArray: true,
        example: [],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_RISK_FLAG_CODES as unknown as string[], { each: true })
    riskFlags?: CallReportRiskFlagCode[];

    @ApiPropertyOptional({
        description:
            'Категория отказа при провале: рыночная (цена/конкурент/нет решения) ' +
            'или исполнительская (квалификация/исполнение).',
        enum: CALL_REPORT_REFUSAL_CODES,
        example: 'execution_issue',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_REFUSAL_CODES as unknown as string[])
    refusalCategory?: CallReportRefusalCode;

    @ApiPropertyOptional({
        description:
            'Доля речи менеджера в %, по словам транскрипта (норма 40-60, >65 — флаг).',
        example: 52,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    talkRatioPct?: number;

    @ApiPropertyOptional({
        description: 'Число содержательных вопросов менеджера за звонок.',
        example: 9,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    questionsCount?: number;

    @ApiProperty({
        description: 'Итоговое резюме звонка от агента (своими скиллами).',
        example: 'Проведена презентация системы Гарант для ЛПР...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    summary: string;

    @ApiProperty({
        description: 'Выявлены ли потребности клиента в разговоре.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    needsFound: boolean;

    @ApiPropertyOptional({
        description: 'Список выявленных потребностей клиента.',
        example: ['Судебная практика по 44-ФЗ', 'Проверка контрагентов'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    needs?: string[];

    @ApiProperty({
        description: 'Была ли проведена презентация продукта.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    presentationDone: boolean;

    @ApiPropertyOptional({
        description: 'Какие продукты предлагались в разговоре.',
        example: ['Гарант Универсал', 'Гарант Консалтинг'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    productsOffered?: string[];

    @ApiPropertyOptional({
        description:
            'Возражения клиента и их отработка (с разбором, как к возражению пришли).',
        type: [AgentObjectionDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentObjectionDto)
    objections?: AgentObjectionDto[];

    @ApiPropertyOptional({
        description:
            'Разбор по формализованным разделам разговора (приветствие, потребности, ' +
            'презентация, возражения, цена, закрытие, отказы): актуальность + оценка + ' +
            'разбор + рекомендации по каждому.',
        type: [AgentSectionAnalysisDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentSectionAnalysisDto)
    sections?: AgentSectionAnalysisDto[];

    @ApiPropertyOptional({
        description:
            'Анализ речи менеджера: структура спича, «свойство-связка-выгода» в ' +
            'презентации, темп, слова-паразиты, заученность.',
        example:
            'Презентация без связок «что это даёт вам»: перечислялись функции без выгод...',
        type: String,
    })
    @IsOptional()
    @IsString()
    speechAnalysis?: string;

    @ApiPropertyOptional({
        description: 'Рекомендации менеджеру по итогам звонка.',
        example: [
            'Отправить сравнение с КонсультантПлюс',
            'Позвонить в четверг',
        ],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    recommendations?: string[];

    @ApiPropertyOptional({
        description:
            'Итоговая оценка качества работы менеджера в звонке (1–10), в контексте ' +
            'этапа продаж: учитываются только актуальные для типа звонка разделы.',
        example: 7,
        type: Number,
        minimum: 1,
        maximum: 10,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    score?: number;

    @ApiPropertyOptional({
        description:
            'Взвешенная оценка 0-100: Σ(score×relevance)/Σrelevance × 10 по разделам ' +
            'с relevance>0 — агрегируемая метрика для трендов (не штрафует за ' +
            'неактуальные разделы).',
        example: 62,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    weightedScore?: number;

    @ApiPropertyOptional({
        description:
            'Соответствие скрипту типа звонка, % (по материалам базы знаний).',
        example: 70,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    scriptCompliance?: number;

    @ApiPropertyOptional({
        description:
            'Приоритет разбора звонка руководителем: urgent (риск-флаги/провал) / ' +
            'planned / none — формирует coaching-очередь РОПа.',
        enum: CALL_REPORT_COACHING_CODES,
        example: 'planned',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_COACHING_CODES as unknown as string[])
    coachingPriority?: CallReportCoachingCode;

    @ApiPropertyOptional({
        description:
            'Объяснение итоговой оценки: из чего сложилась, что перевесило.',
        example:
            'Хороший контакт и потребности (8), но презентация без выгод (4) и нет следующего шага...',
        type: String,
    })
    @IsOptional()
    @IsString()
    scoreExplanation?: string;

    @ApiPropertyOptional({
        description:
            'Рекомендации сотруднику (накопительные, для развития): что и как ' +
            'потренировать, на что обращать внимание в следующих звонках.',
        example:
            'Потренировать связку свойство-выгода на 3 продуктах; записать себе 5 вопросов для выявления потребностей.',
        type: String,
    })
    @IsOptional()
    @IsString()
    employeeRecommendations?: string;

    @ApiPropertyOptional({
        description:
            'Привязка к сделкам воронок компании (кандидаты приходят в пакете звонка).',
        type: AgentRelatedDealsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentRelatedDealsDto)
    relatedDeals?: AgentRelatedDealsDto;

    @ApiPropertyOptional({
        description:
            'Привязка к элементу списка ОП KPI (если удалось установить по содержанию).',
        type: AgentListItemLinkDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentListItemLinkDto)
    kpiItem?: AgentListItemLinkDto;

    @ApiPropertyOptional({
        description:
            'Привязка к элементу списка ОП История (если удалось установить по содержанию).',
        type: AgentListItemLinkDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentListItemLinkDto)
    historyItem?: AgentListItemLinkDto;

    @ApiPropertyOptional({
        description:
            'ID прочих связанных по смыслу записей отчётов менеджера из списка ' +
            'sales_history (кандидаты приходят в пакете звонка).',
        example: ['10231', '10234'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    relatedReportIds?: string[];

    @ApiPropertyOptional({
        description:
            'Версия скилла агента, которым сделан анализ (для отслеживания ' +
            'самообучения скилла).',
        example: 'call-analyst-v3',
        type: String,
    })
    @IsOptional()
    @IsString()
    agentVersion?: string;

    @ApiPropertyOptional({
        description:
            'Черновик события в кодах event-sales flow (report + plan) — «как агент ' +
            'заполнил бы отчёт менеджера». Сохраняется в ais.report_result для будущей ' +
            'автоотправки в /event-sales/flow; сейчас в endpoint НЕ отправляется.',
        type: AgentFlowDraftDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentFlowDraftDto)
    flow?: AgentFlowDraftDto;

    @ApiPropertyOptional({
        description:
            'Произвольные дополнительные данные анализа (сохраняются в ais.user_result как есть).',
        example: { scriptCompliance: 80 },
        type: Object,
    })
    @IsOptional()
    @IsObject()
    extra?: Record<string, unknown>;
}
