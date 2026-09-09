import { ApiProperty } from '@nestjs/swagger';

/**
 * Подпись стиля: КАК человек работает. Оба полюса оси нейтральны,
 * рейтинга по осям нет — подпись всегда идёт с опорой в числах и объёмом.
 */
export class AiStyleTagDto {
    @ApiProperty({
        description: 'Код подписи (справочник стиля библиотеки).',
        type: String,
        example: 'inquiry_high',
    })
    code: string;

    @ApiProperty({
        description: 'Подпись для человека.',
        type: String,
        example: 'Больше выясняет, чем презентует',
    })
    title: string;

    @ApiProperty({
        description: 'Опора подписи в числах.',
        type: String,
        example: 'выявление выше презентации на 1,2 балла в 62 разборах',
    })
    basis: string;

    @ApiProperty({
        description: 'Разборов, на которых держится подпись.',
        type: Number,
        example: 62,
    })
    n: number;
}

/**
 * Профиль стиля менеджера из снапшота `ai-analytics-style` (месячное
 * окно): не более трёх подписей, вектор отклонений по осям в единицах
 * разброса коллег и доверие к профилю.
 *
 * Профиль отдаётся только при доверии выше «none»: меньше `style_min_calls`
 * (40) разборов или меньше пяти коллег в норме — строка получает `null`,
 * «данных пока мало» честнее любой подписи.
 */
export class AiStyleProfileDto {
    @ApiProperty({
        description: 'Подписи стиля, не более трёх.',
        type: [AiStyleTagDto],
    })
    tags: AiStyleTagDto[];

    @ApiProperty({
        description:
            'Ось → усаженное отклонение от нормы коллег в единицах σ ' +
            '(отрицательное — противоположный полюс оси).',
        type: Object,
        example: { inquiry: 0.42 },
    })
    vector: Record<string, number>;

    @ApiProperty({
        description:
            'Доверие к профилю: ok — данных достаточно, low — мало для ' +
            'выводов (профиль показывается с оговоркой).',
        type: String,
        example: 'ok',
    })
    confidence: string;

    @ApiProperty({
        description: 'Сравнимых разборов менеджера в окне профиля.',
        type: Number,
        example: 62,
    })
    calls: number;
}
