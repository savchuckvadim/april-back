import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * «Воронка и конверсии» и «Презентации» отчёта собственнику (замечания
 * владельца 09.11.2026 по образцу OrbitAI). Вынесено из
 * ai-owner-report-text.dto.ts по лимиту файла; реэкспорт оттуда.
 */

export class AiOwnerReportFunnelRowDto {
    @ApiProperty({
        description: 'Код ступени: cold, presentation, followup.',
        type: String,
        example: 'followup',
    })
    code: string;

    @ApiProperty({
        description: 'Ступень словами.',
        type: String,
        example: 'После показа и КП: доработка, решение, оплата',
    })
    label: string;

    @ApiProperty({
        description: 'Разговоров ступени.',
        type: Number,
        example: 46,
    })
    calls: number;

    @ApiProperty({
        description: 'Шаг вперёд: «5 из 46 (11 %)».',
        type: String,
    })
    advanced: string;

    @ApiProperty({
        description:
            'Без решения (перезвон с датой и отложено): «41 из 46 (89 %)».',
        type: String,
    })
    undecided: string;

    @ApiProperty({ description: 'Отказ: «3 из 46 (7 %)».', type: String })
    refused: string;

    @ApiProperty({
        description: 'Без контакта: «0 из 46 (0 %)».',
        type: String,
    })
    noContact: string;

    @ApiProperty({
        description: 'Согласие на счёт: «1 из 46 (2 %)».',
        type: String,
    })
    invoiceAgreed: string;
}

export class AiOwnerReportFunnelDto {
    @ApiProperty({
        type: [AiOwnerReportFunnelRowDto],
        description: 'Ступени: холодный вход → показ → после показа и КП.',
    })
    rows: AiOwnerReportFunnelRowDto[];

    @ApiPropertyOptional({
        description: 'Цепочка конверсий словами; null — ступени пусты.',
        type: String,
        nullable: true,
    })
    chain: string | null;

    @ApiPropertyOptional({
        description:
            'Что происходит после показа и КП: сколько ушло в «подумаем», сколько согласий на счёт; null — таких разговоров нет.',
        type: String,
        nullable: true,
    })
    afterOffer: string | null;

    @ApiProperty({
        description: 'Согласие на счёт по всем разговорам периода.',
        type: String,
    })
    invoice: string;
}

export class AiOwnerReportCrmFunnelRowDto {
    @ApiProperty({
        description: 'Ступень по CRM.',
        type: String,
        example: 'Счета',
    })
    label: string;

    @ApiProperty({ description: 'За период.', type: Number, example: 12 })
    value: number;

    @ApiPropertyOptional({
        description: 'За прошлый период; null — сравнения нет.',
        type: Number,
        nullable: true,
        example: 9,
    })
    previous: number | null;
}

export class AiOwnerReportCrmFunnelDto {
    @ApiProperty({
        type: [AiOwnerReportCrmFunnelRowDto],
        description: 'Показы → счета → договоры по данным CRM.',
    })
    rows: AiOwnerReportCrmFunnelRowDto[];

    @ApiProperty({
        description: 'Отношения ступеней словами.',
        type: String,
        example:
            'Счета к показам — 50 %, договоры к счетам — 50 %, договоры к показам — 25 %.',
    })
    conversions: string;

    @ApiProperty({
        description:
            'Оговорка: отношения событий за период, не путь одного клиента.',
        type: String,
    })
    note: string;
}

export class AiOwnerReportKeyValueDto {
    @ApiProperty({
        description: 'Показатель.',
        type: String,
        example: 'Показ под задачи клиента',
    })
    label: string;

    @ApiProperty({
        description: 'Значение словами.',
        type: String,
        example: '12 из 47 (26 %)',
    })
    value: string;
}

export class AiOwnerReportPresentationsDto {
    @ApiProperty({
        description: 'Вводная: сколько показов и шаг вперёд после них.',
        type: String,
    })
    intro: string;

    @ApiProperty({
        type: [AiOwnerReportKeyValueDto],
        description:
            'Что видно в показах: задачи, показ под задачи, закрытие, шаг с датой, возражения.',
    })
    rows: AiOwnerReportKeyValueDto[];

    @ApiPropertyOptional({
        description:
            'Показ под задачи клиента против шаблонного; null — сравнить не с чем.',
        type: String,
        nullable: true,
    })
    comparison: string | null;

    @ApiProperty({
        type: [AiOwnerReportKeyValueDto],
        description: 'Средние оценки разделов разбора по показам (1–10).',
    })
    sections: AiOwnerReportKeyValueDto[];

    @ApiPropertyOptional({
        description:
            'У кого показ двигает клиента чаще и реже всего; null — сравнить не с кем.',
        type: String,
        nullable: true,
    })
    people: string | null;
}
