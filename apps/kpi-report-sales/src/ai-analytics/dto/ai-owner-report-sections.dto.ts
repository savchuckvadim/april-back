import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Разделы текста отчёта собственнику: управляемость, возражения, сбои,
 * метрики контроля, сотрудники. Вынесено из ai-owner-report-text.dto.ts по
 * лимиту файла; реэкспорт оттуда же — импорты потребителей не меняются.
 */

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
