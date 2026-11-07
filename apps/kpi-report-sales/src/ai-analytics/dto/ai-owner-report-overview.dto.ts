import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * «Общая картина» отчёта собственнику: исходы, виды разговоров, недели.
 * Вынесено из ai-owner-report-text.dto.ts по лимиту файла; реэкспорт оттуда.
 */

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

    @ApiProperty({
        description:
            'Разговоров без размеченного исхода (разбор до новой версии); в доли исходов не входят.',
        type: Number,
        example: 0,
    })
    unmarked: number;
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
