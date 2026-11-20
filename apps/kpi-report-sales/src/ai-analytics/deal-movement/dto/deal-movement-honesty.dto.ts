import { ApiProperty } from '@nestjs/swagger';

/**
 * Честность оценок продвижения в витрине «Движение сделок» (п. 4
 * постановки §7): доля звонков с продвижением 4–5, после которых стадия
 * сделки не сдвинулась вперёд за N дней. Только ответ.
 */

/** Честность оценок продвижения по набору звонков. */
export class DealMovementHonestyDto {
    @ApiProperty({
        description: 'Звонков периода с продвижением 4–5.',
        type: Number,
        example: 40,
    })
    highProgress: number;

    @ApiProperty({
        description:
            'Из них проверено: известен итог — стадия сдвинулась вперёд или ' +
            'нет за N дней (checkDays). Знаменатель доли.',
        type: Number,
        example: 30,
    })
    checked: number;

    @ApiProperty({
        description: 'Проверено и стадия НЕ сдвинулась вперёд за N дней.',
        type: Number,
        example: 9,
    })
    still: number;

    @ApiProperty({
        description: 'Проверено и стадия сдвинулась вперёд за N дней.',
        type: Number,
        example: 21,
    })
    moved: number;

    @ApiProperty({
        description: 'Ещё ждут проверки: N дней после звонка не прошли.',
        type: Number,
        example: 6,
    })
    pending: number;

    @ApiProperty({
        description:
            'Не проверены: звонок не сцеплен с открытой сделкой «ОП ' +
            'Основная», сделка закрылась до проверки или ночного счёта не было.',
        type: Number,
        example: 4,
    })
    unchecked: number;

    @ApiProperty({
        description:
            'Доля «стадия не сдвинулась» среди проверенных, % (одна цифра ' +
            'после запятой) — метрика честности: чем выше, тем чаще модель ' +
            'завышает продвижение. null — проверенных нет.',
        type: Number,
        nullable: true,
        example: 30,
    })
    stillPct: number | null;

    @ApiProperty({
        description:
            'Проверенных меньше 10 — доля ненадёжна (число всё равно есть).',
        type: Boolean,
        example: false,
    })
    fewCalls: boolean;

    @ApiProperty({
        description:
            'Пометка для человека («мало звонков»); null — без пометки.',
        type: String,
        nullable: true,
        example: null,
    })
    note: string | null;
}

/** Честность менеджера. */
export class DealMovementManagerHonestyDto extends DealMovementHonestyDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера звонков.',
        type: String,
        example: '447',
    })
    managerId: string;

    @ApiProperty({
        description: 'Имя «Фамилия Имя»; null — нет в структуре.',
        type: String,
        nullable: true,
        example: 'Иванова Анна',
    })
    managerName: string | null;
}

/** Блок честности: правило, отдел и менеджеры. */
export class DealMovementHonestyBlockDto {
    @ApiProperty({
        description:
            'За сколько дней после звонка стадия должна сдвинуться вперёд ' +
            '(настройка портала «после согласия по звонку», по умолчанию 12).',
        type: Number,
        example: 12,
    })
    checkDays: number;

    @ApiProperty({
        description: 'С какого продвижения звонок проверяется (4 из 5).',
        type: Number,
        example: 4,
    })
    progressMin: number;

    @ApiProperty({
        description: 'Отдел — все видимые звонки периода.',
        type: DealMovementHonestyDto,
    })
    department: DealMovementHonestyDto;

    @ApiProperty({
        description: 'Менеджеры со звонками 4–5 — больше звонков выше.',
        type: [DealMovementManagerHonestyDto],
    })
    managers: DealMovementManagerHonestyDto[];
}
