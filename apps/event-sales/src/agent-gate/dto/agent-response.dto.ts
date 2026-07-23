import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Звонок, ожидающий глубокого анализа агентом. */
export class AgentPendingCallDto {
    @ApiProperty({
        description: 'ID транскрипции в БД — адрес звонка в Agent API.',
        example: '42',
        type: String,
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'ID активности-звонка в CRM.',
        example: '781614',
        type: String,
    })
    activityId: string;

    @ApiPropertyOptional({
        description: 'ID звонка в телефонии (voximplant CALL_ID).',
        example: 'ext_abc123',
        type: String,
    })
    callId?: string;

    @ApiPropertyOptional({
        description: 'Время начала звонка (ISO).',
        example: '2026-07-21T10:15:00.000Z',
        type: String,
    })
    callStartedAt?: string;

    @ApiPropertyOptional({
        description: 'Длительность звонка в секундах.',
        example: 720,
        type: Number,
    })
    durationSec?: number;

    @ApiProperty({
        description: 'ID сделки, которой принадлежит звонок.',
        example: '12345',
        type: String,
    })
    dealId: string;

    @ApiPropertyOptional({
        description:
            'Каким транскрибатором получен текст (yandex / bitrix-vibecode).',
        example: 'yandex',
        type: String,
    })
    provider?: string;

    @ApiProperty({
        description: 'Длина транскрипта в символах.',
        example: 12480,
        type: Number,
    })
    textLength: number;

    @ApiProperty({
        description:
            'Есть ли уже анализ агента по этому звонку (true — звонок обработан).',
        example: false,
        type: Boolean,
    })
    hasAgentAnalysis: boolean;

    @ApiPropertyOptional({
        description:
            'Тип звонка от дешёвого классификатора конвейера (cold / call / ' +
            'presentation / decision / payment / other). Список отсортирован по ' +
            '(domain, callType) — обрабатывая подряд, агент переиспользует кэш ' +
            'промпта методологии одного типа.',
        example: 'cold',
        type: String,
    })
    callType?: string;
}

/** AI-результат первичного анализа (GigaChat RAG и др.) из таблицы ais. */
export class AgentAiResultDto {
    @ApiProperty({
        description: 'ID записи в ais.',
        example: '17',
        type: String,
    })
    id: string;

    @ApiProperty({
        description:
            'Тип анализа: call-resume / call-recomendation / call-analysis / agent-analysis.',
        example: 'call-resume',
        type: String,
    })
    type: string;

    @ApiProperty({
        description:
            'Провайдер анализа (gigachat / bitrix-vibecode / имя агента).',
        example: 'gigachat',
        type: String,
    })
    provider: string;

    @ApiProperty({
        description: 'Текстовый результат анализа.',
        example: 'Проведена презентация...',
        type: String,
    })
    result: string;
}

/** Полный пакет данных по звонку для глубокого анализа агентом. */
/**
 * Профиль типа звонка — управляющий параметр анализа (приоры релевантности
 * разделов, речевые нормы, kind знаний с инструкцией анализа этого типа).
 * Источник правды — CALL_REPORT_TYPE_PROFILES в конфиге смарта.
 */
export class AgentCallTypeProfileDto {
    @ApiProperty({
        description: 'Что главное в звонке этого типа (шпаргалка аналитику).',
        example: 'Выход на ЛПР: проход секретаря, зацепка.',
        type: String,
    })
    focus: string;

    @ApiProperty({
        description:
            'Приоры релевантности разделов 0-100 (GREETING/NEEDS/PRESENTATION/' +
            'OBJECTIONS/PRICE/CLOSING/REFUSAL). Ориентир: отклоняясь, агент ' +
            'обязан объяснить это в analysis раздела.',
        type: Object,
        example: { GREETING: 100, PRICE: 10 },
    })
    sectionRelevance: Record<string, number>;

    @ApiPropertyOptional({
        description:
            'Норма доли речи менеджера, % — для этого типа звонка. null — не нормируется.',
        type: Object,
        nullable: true,
        example: { min: 40, max: 60 },
    })
    talkRatioNorm: { min: number; max: number } | null;

    @ApiPropertyOptional({
        description:
            'Норма числа вопросов менеджера для этого типа. null — не нормируется.',
        type: Object,
        nullable: true,
        example: { min: 11, max: 14 },
    })
    questionsNorm: { min: number; max: number } | null;

    @ApiProperty({
        description:
            'Kind базы знаний с инструкцией/скриптом анализа ИМЕННО этого типа — ' +
            'агент забирает её через GET /agent/knowledge/all?kind=<knowledgeKind>. ' +
            'Инструкция подменяется загрузкой документа, без деплоя.',
        example: 'call-analysis-cold',
        type: String,
    })
    knowledgeKind: string;
}

export class AgentCallPackageDto {
    @ApiProperty({
        description: 'Метаданные звонка.',
        type: AgentPendingCallDto,
    })
    call: AgentPendingCallDto;

    @ApiProperty({
        description: 'Полный текст транскрипта звонка.',
        example: 'Менеджер: Добрый день!...',
        type: String,
    })
    transcript: string;

    @ApiProperty({
        description:
            'Результаты первичных AI-анализов по звонку (GigaChat resume/recomendation и др.).',
        type: [AgentAiResultDto],
    })
    aiResults: AgentAiResultDto[];

    @ApiPropertyOptional({
        description:
            'Сделка из Bitrix (сырые поля crm.deal). null — если не удалось получить.',
        type: Object,
        nullable: true,
    })
    deal?: Record<string, unknown> | null;

    @ApiPropertyOptional({
        description:
            'Компания сделки из Bitrix (сырые поля crm.company). null — если нет/не удалось.',
        type: Object,
        nullable: true,
    })
    company?: Record<string, unknown> | null;

    @ApiPropertyOptional({
        description:
            'Контакт сделки из Bitrix (сырые поля crm.contact). null — если нет/не удалось.',
        type: Object,
        nullable: true,
    })
    contact?: Record<string, unknown> | null;

    @ApiProperty({
        description:
            'Кандидаты записей отчётов менеджера из списка sales_history по той же ' +
            'сделке (окно ±N дней вокруг звонка). Семантическое сопоставление — задача агента.',
        type: [Object],
    })
    historyCandidates: Record<string, unknown>[];

    @ApiProperty({
        description:
            'Кандидаты записей из списка ОП KPI в том же окне дат — для привязки kpiItem.',
        type: [Object],
    })
    kpiCandidates: Record<string, unknown>[];

    @ApiProperty({
        description:
            'Активные сделки компании по воронкам ОП: salesBase (основная), ' +
            'salesPresentation (презентации), salesXo (ХО) — кандидаты для relatedDeals.',
        type: Object,
    })
    dealCandidates: {
        salesBase: Record<string, unknown>[];
        salesPresentation: Record<string, unknown>[];
        salesXo: Record<string, unknown>[];
    };

    @ApiProperty({
        description:
            'Словарь pbx-полей компании портала (code → UF-имя + enum-элементы) — ' +
            'для расшифровки сырых UF_CRM_* значений компании (статусы op_*).',
        type: [Object],
    })
    companyFields: Record<string, unknown>[];

    @ApiPropertyOptional({
        description:
            'Результат дешёвого классификатора конвейера (callType, ' +
            'interlocutorRole, confidence, reason). Подсказка агенту: при ' +
            'высокой confidence принять тип; при низкой / несогласии — ' +
            'классифицировать самостоятельно и объяснить расхождение.',
        type: Object,
        nullable: true,
        example: {
            callType: 'cold',
            interlocutorRole: 'secretary',
            confidence: 0.85,
            reason: 'Менеджер проходит секретаря',
        },
    })
    classification?: Record<string, unknown> | null;

    @ApiPropertyOptional({
        description:
            'Профиль классифицированного типа звонка (приоры релевантности ' +
            'разделов, речевые нормы, kind знаний). null — звонок не классифицирован.',
        type: AgentCallTypeProfileDto,
        nullable: true,
    })
    typeProfile?: AgentCallTypeProfileDto | null;

    @ApiProperty({
        description:
            'Профили всех типов звонков (по кодам CALL_TYPE смарта) — если ' +
            'агент выбирает иной тип, анализ ведётся по профилю выбранного типа.',
        type: Object,
    })
    typeProfiles: Record<string, AgentCallTypeProfileDto>;
}

/** Ответ на push-back анализа агента. */
export class AgentAnalysisResponseDto {
    @ApiProperty({
        description: 'ID созданной записи анализа в ais.',
        example: '18',
        type: String,
    })
    aiId: string;

    @ApiPropertyOptional({
        description:
            'ID созданного элемента смарт-процесса «AI-анализ звонков». ' +
            'null — смарт не установлен на портале (анализ сохранён только в БД).',
        example: 7,
        type: Number,
        nullable: true,
    })
    smartItemId?: number | null;

    @ApiProperty({
        description: 'Установлен ли смарт-процесс на портале.',
        example: true,
        type: Boolean,
    })
    smartInstalled: boolean;
}
