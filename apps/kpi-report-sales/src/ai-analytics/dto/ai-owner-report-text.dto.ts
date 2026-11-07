import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Текст отчёта собственнику в ответе ручки `ai-analytics/owner-report`:
 * готовые русские фразы по разделам, числа уже отформатированы. Фронт и
 * PDF раскладывают структуру, ничего не считая.
 */

export class AiOwnerReportTileDto {
    @ApiProperty({
        description: 'Код плитки.',
        type: String,
        example: 'cold_advanced',
    })
    code: string;

    @ApiProperty({
        description: 'Число крупно.',
        type: String,
        example: '11 %',
    })
    value: string;

    @ApiProperty({
        description: 'Подпись под числом.',
        type: String,
        example: 'холодных звонков дошли до показа, доступа или предложения',
    })
    label: string;

    @ApiPropertyOptional({
        description: 'Сравнение с прошлым периодом; null — сравнения нет.',
        type: String,
        nullable: true,
        example: 'меньше на 5 пунктов',
    })
    compare: string | null;
}

export class AiOwnerReportOutcomeRowDto {
    @ApiProperty({
        description: 'Исход разговора.',
        type: String,
        example: 'Отложено без даты',
    })
    label: string;

    @ApiProperty({
        description: 'Разговоров с таким исходом.',
        type: Number,
        example: 120,
    })
    calls: number;

    @ApiProperty({
        description: 'Доля от разобранных.',
        type: String,
        example: '38 %',
    })
    pct: string;
}

export class AiOwnerReportTypeGroupRowDto {
    @ApiProperty({
        description: 'Группа типов разговоров.',
        type: String,
        example: 'Холодный первый контакт',
    })
    label: string;

    @ApiProperty({
        description: 'Разговоров в группе.',
        type: Number,
        example: 137,
    })
    calls: number;

    @ApiProperty({
        description: 'Продвинуты: «15 из 137 (11 %)».',
        type: String,
    })
    advanced: string;

    @ApiProperty({
        description: 'Перезвон с датой.',
        type: Number,
        example: 17,
    })
    callbackDated: number;

    @ApiProperty({
        description: 'Отложено без даты.',
        type: Number,
        example: 64,
    })
    postponed: number;

    @ApiProperty({ description: 'Отказ.', type: Number, example: 36 })
    refused: number;

    @ApiProperty({
        description: 'Без содержательного контакта.',
        type: Number,
        example: 5,
    })
    noContact: number;
}

export class AiOwnerReportWeekRowDto {
    @ApiProperty({
        description: 'Неделя словами.',
        type: String,
        example: '5–11 октября 2026',
    })
    label: string;

    @ApiProperty({
        description: 'Разговоров за неделю.',
        type: Number,
        example: 65,
    })
    calls: number;

    @ApiProperty({ description: 'Холодных.', type: Number, example: 25 })
    cold: number;

    @ApiProperty({
        description: 'Холодные → продвижение.',
        type: String,
        example: '4 из 25 (16 %)',
    })
    coldAdvanced: string;

    @ApiProperty({
        description: 'Разговоров с решающим.',
        type: Number,
        example: 31,
    })
    contacted: number;

    @ApiProperty({
        description: 'С решающим → продвижение.',
        type: String,
        example: '15 из 31 (48 %)',
    })
    contactedAdvanced: string;

    @ApiPropertyOptional({
        description: 'Пометка: неполная неделя, дни без звонков; null — нет.',
        type: String,
        nullable: true,
    })
    note: string | null;
}

export class AiOwnerReportOverviewDto {
    @ApiProperty({
        type: [AiOwnerReportOutcomeRowDto],
        description: 'Исходы разговоров.',
    })
    outcomes: AiOwnerReportOutcomeRowDto[];

    @ApiProperty({
        type: [AiOwnerReportTypeGroupRowDto],
        description: 'По группам типов.',
    })
    typeGroups: AiOwnerReportTypeGroupRowDto[];

    @ApiProperty({
        type: [AiOwnerReportWeekRowDto],
        description: 'Динамика по неделям.',
    })
    weeks: AiOwnerReportWeekRowDto[];

    @ApiProperty({ type: [String], description: 'Пометки под таблицами.' })
    notes: string[];
}

export class AiOwnerReportLeakDto {
    @ApiProperty({
        description: 'Код утечки.',
        type: String,
        example: 'postponed_no_date',
    })
    code: string;

    @ApiProperty({ description: 'Название.', type: String })
    title: string;

    @ApiProperty({ description: 'Масштаб словами.', type: String })
    scale: string;

    @ApiPropertyOptional({
        description: 'Деньги словами; null — не считаются.',
        type: String,
        nullable: true,
    })
    money: string | null;

    @ApiProperty({
        description: 'Природа: процесс, навык или оба.',
        type: String,
    })
    nature: string;

    @ApiProperty({ description: 'Что сделать.', type: String })
    action: string;

    @ApiProperty({ description: 'Абзац утечки.', type: String })
    text: string;

    @ApiProperty({
        description: 'Кто написал абзац.',
        enum: ['template', 'model'],
        example: 'model',
    })
    source: 'template' | 'model';

    @ApiProperty({
        type: [String],
        description: 'Ссылки на карточки разборов-примеров.',
    })
    exampleLinks: string[];
}

export class AiOwnerReportSignDto {
    @ApiProperty({
        description: 'Код признака.',
        type: String,
        example: 'stage_control',
    })
    code: string;

    @ApiProperty({ description: 'Название признака.', type: String })
    title: string;

    @ApiProperty({
        description: 'Вердикт: Есть / Частично / Нет / Не проверялось.',
        type: String,
    })
    verdict: string;

    @ApiProperty({ description: 'Что видно в разговорах.', type: String })
    detail: string;
}

export class AiOwnerReportManagementDto {
    @ApiProperty({
        type: [AiOwnerReportSignDto],
        description: 'Признаки управления.',
    })
    rows: AiOwnerReportSignDto[];

    @ApiProperty({
        description: 'Общий вердикт.',
        type: String,
        example: 'Управляется частично',
    })
    verdict: string;

    @ApiProperty({ description: 'Пояснение вердикта.', type: String })
    verdictText: string;
}

export class AiOwnerReportObjectionRowDto {
    @ApiProperty({ description: 'Тема возражения.', type: String })
    label: string;

    @ApiProperty({ description: 'Разговоров с темой.', type: Number })
    calls: number;

    @ApiProperty({ description: 'Отработано, %.', type: String })
    handled: string;

    @ApiProperty({ description: 'Продвинуты после, %.', type: String })
    advancedAfter: string;
}

export class AiOwnerReportObjectionsDto {
    @ApiProperty({ description: 'Вводная фраза.', type: String })
    intro: string;

    @ApiProperty({
        type: [AiOwnerReportObjectionRowDto],
        description: 'Темы возражений.',
    })
    rows: AiOwnerReportObjectionRowDto[];

    @ApiPropertyOptional({
        description: 'Что чаще всего останавливает холодный вход.',
        type: String,
        nullable: true,
    })
    coldTop: string | null;
}

export class AiOwnerReportIssueRowDto {
    @ApiProperty({ description: 'Вид сбоя.', type: String })
    label: string;

    @ApiProperty({ description: 'Разговоров со сбоем.', type: Number })
    calls: number;

    @ApiProperty({
        type: [String],
        description: 'Ссылки на карточки разборов-примеров.',
    })
    exampleLinks: string[];
}

export class AiOwnerReportIssuesDto {
    @ApiProperty({ description: 'Вводная фраза.', type: String })
    intro: string;

    @ApiProperty({
        type: [AiOwnerReportIssueRowDto],
        description: 'Сбои по видам.',
    })
    rows: AiOwnerReportIssueRowDto[];
}

export class AiOwnerReportMetricDto {
    @ApiProperty({ description: 'Код метрики.', type: String })
    code: string;

    @ApiProperty({ description: 'Название.', type: String })
    title: string;

    @ApiProperty({ description: 'Значение за период.', type: String })
    value: string;

    @ApiPropertyOptional({
        description: 'За последнюю полную неделю; null — нет.',
        type: String,
        nullable: true,
    })
    lastWeek: string | null;

    @ApiProperty({ description: 'Почему критична.', type: String })
    why: string;

    @ApiProperty({ description: 'Что будет, если игнорировать.', type: String })
    ifIgnored: string;
}

export class AiOwnerReportManagerDto {
    @ApiProperty({
        description: 'Bitrix-id сотрудника.',
        type: String,
        example: '447',
    })
    managerId: string;

    @ApiProperty({ description: 'Имя.', type: String, example: 'Надежда' })
    name: string;

    @ApiProperty({ description: 'Заголовок карточки.', type: String })
    headline: string;

    @ApiProperty({
        description:
            'Ячейки таблицы по кодам колонок (см. MANAGER_COLUMN_LABELS).',
        type: 'object',
        additionalProperties: { type: 'string' },
    })
    cells: Record<string, string>;

    @ApiProperty({ type: [String], description: 'Сильные стороны.' })
    strengths: string[];

    @ApiProperty({ type: [String], description: 'Риски.' })
    risks: string[];

    @ApiProperty({ description: 'Вывод для собственника.', type: String })
    conclusion: string;

    @ApiProperty({
        description: 'Кто написал карточку.',
        enum: ['template', 'model'],
    })
    source: 'template' | 'model';
}

export class AiOwnerReportTextDto {
    @ApiProperty({ description: 'Заголовок отчёта.', type: String })
    title: string;

    @ApiProperty({
        description: 'Период словами.',
        type: String,
        example: '1–31 октября 2026',
    })
    periodLabel: string;

    @ApiProperty({ type: [AiOwnerReportTileDto], description: 'Плитки шапки.' })
    tiles: AiOwnerReportTileDto[];

    @ApiProperty({
        type: [String],
        description: 'Резюме для собственника, абзацы.',
    })
    summary: string[];

    @ApiProperty({
        description: 'Кто написал резюме.',
        enum: ['template', 'model'],
    })
    summarySource: 'template' | 'model';

    @ApiProperty({
        type: AiOwnerReportOverviewDto,
        description: 'Общая картина.',
    })
    overview: AiOwnerReportOverviewDto;

    @ApiProperty({
        type: [AiOwnerReportLeakDto],
        description: 'Где теряем продажи.',
    })
    leaks: AiOwnerReportLeakDto[];

    @ApiProperty({
        type: AiOwnerReportManagementDto,
        description: 'Как управляется отдел.',
    })
    management: AiOwnerReportManagementDto;

    @ApiProperty({
        type: AiOwnerReportObjectionsDto,
        description: 'Возражения.',
    })
    objections: AiOwnerReportObjectionsDto;

    @ApiProperty({
        type: AiOwnerReportIssuesDto,
        description: 'Сбои не по вине разговора.',
    })
    issues: AiOwnerReportIssuesDto;

    @ApiProperty({
        type: [AiOwnerReportMetricDto],
        description: 'Метрики для контроля.',
    })
    controlMetrics: AiOwnerReportMetricDto[];

    @ApiProperty({
        type: [AiOwnerReportManagerDto],
        description: 'Сотрудники.',
    })
    managers: AiOwnerReportManagerDto[];

    @ApiProperty({ type: [String], description: 'Методология и ограничения.' })
    methodology: string[];
}
