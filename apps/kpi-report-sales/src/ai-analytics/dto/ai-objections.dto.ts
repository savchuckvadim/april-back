import { ApiProperty } from '@nestjs/swagger';
import { MetricDto } from './metric.dto';

/** Исходы возражений категории; other — неизвестный исход или его нет. */
export class AiObjectionOutcomesDto {
    @ApiProperty({
        description: 'Разговор продолжился.',
        type: Number,
        example: 5,
    })
    continued: number;

    @ApiProperty({
        description: 'Клиент согласился / перешёл дальше.',
        type: Number,
        example: 2,
    })
    converted: number;

    @ApiProperty({
        description: 'Клиент вышел из диалога.',
        type: Number,
        example: 1,
    })
    disengaged: number;

    @ApiProperty({
        description: 'Исход не определён разбором.',
        type: Number,
        example: 1,
    })
    other: number;
}

/** Категория возражений менеджера или отдела за период. */
export class AiObjectionCategoryDto {
    @ApiProperty({
        description:
            'Категория из справочника агента (price, timing, need, …); ' +
            'unknown — без категории.',
        type: String,
        example: 'price',
    })
    category: string;

    @ApiProperty({
        description: 'Возражений категории.',
        type: Number,
        example: 9,
    })
    n: number;

    @ApiProperty({
        description: 'Звонков, в которых встретилась категория.',
        type: Number,
        example: 7,
    })
    calls: number;

    @ApiProperty({
        description:
            'Доля отработанных возражений, % (Уилсон 90 %; только среди ' +
            'возражений с известным handled).',
        type: MetricDto,
    })
    handledRatePct: MetricDto;

    @ApiProperty({
        description: 'Исходы возражений категории.',
        type: AiObjectionOutcomesDto,
    })
    outcomes: AiObjectionOutcomesDto;
}

export class AiObjectionsManagerDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description: 'Возражений менеджера всего.',
        type: Number,
        example: 21,
    })
    n: number;

    @ApiProperty({
        description: 'Категории в порядке справочника, unknown последней.',
        type: [AiObjectionCategoryDto],
    })
    byCategory: AiObjectionCategoryDto[];
}

/** Сквозной срез возражений по всем типам звонков (ТЗ FR-30, уровень E0). */
export class AiObjectionsDto {
    @ApiProperty({
        description: 'Менеджеры периметра запрашивающего по managerId.',
        type: [AiObjectionsManagerDto],
    })
    byManager: AiObjectionsManagerDto[];

    @ApiProperty({
        description: 'Итоги по всем менеджерам домена.',
        type: [AiObjectionCategoryDto],
    })
    totals: AiObjectionCategoryDto[];

    @ApiProperty({
        description: 'Возражений всего.',
        type: Number,
        example: 84,
    })
    n: number;
}
