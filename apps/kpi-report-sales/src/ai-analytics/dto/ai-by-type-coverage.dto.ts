import { ApiProperty } from '@nestjs/swagger';

/**
 * Покрытие среза by-type разборами: сколько звонков в оценке и почему
 * остальные не вошли. Нужно пустому состоянию матриц «AI: типы звонков» и
 * «AI: разделы», чтобы назвать причину, не дожидаясь секции обзора.
 * Считается по сотрудникам обзора (фильтр отчёта ∩ список разбора);
 * периметр запрашивающего числа не режет — как итоги.
 */
export class AiByTypeCoverageDto {
    @ApiProperty({
        description:
            'Дата сравнимости периода (YYYY-MM-DD): разборы старой версии ' +
            'разбора (набор версий раньше этой даты) в оценки не входят. ' +
            'Пусто — версий нет.',
        type: String,
        example: '2026-09-25',
    })
    comparableFrom: string;

    @ApiProperty({
        description:
            'Разборов в оценке: есть разбор, известны сотрудник и тип, звонок ' +
            'не короче порога и не раньше даты сравнимости.',
        type: Number,
        example: 42,
    })
    analyzedCalls: number;

    @ApiProperty({
        description:
            'Звонков, разобранных старой версией разбора (до даты ' +
            'сравнимости периода): в оценки не входят.',
        type: Number,
        example: 118,
    })
    excludedBeforeComparable: number;

    @ApiProperty({
        description:
            'Разобранных звонков короче порога длительности своего типа ' +
            '(порог портала, по умолчанию 300 с): в оценки не входят.',
        type: Number,
        example: 35,
    })
    excludedShort: number;

    @ApiProperty({
        description:
            'Разобранных звонков, которым AI не определил тип: в оценки не ' +
            'входят.',
        type: Number,
        example: 4,
    })
    excludedNoType: number;
}
