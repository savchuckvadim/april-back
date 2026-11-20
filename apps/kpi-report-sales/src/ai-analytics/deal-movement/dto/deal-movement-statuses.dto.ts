import { ApiProperty } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_STATUSES,
    type DealMovementStatus,
} from '@lib/sales-ai-analytics';

/**
 * Статусы движения сделок в ответе витрины (п. 1 постановки §7): сколько
 * сделок и на какую сумму в каждом статусе — по отделу и по менеджерам на
 * последнюю ночь и по ночам периода. Только ответ: тело запроса не несёт.
 */

/** Статус: сколько сделок и на какую сумму. */
export class DealMovementStatusCellDto {
    @ApiProperty({
        description:
            'Код статуса: moving — «Движется», stuck — «Без продвижения», ' +
            'abandoned — «Без внимания», rolled_back — «Вернулась назад», ' +
            'at_risk — «Под риском». Порядок ячеек — порядок важности правил.',
        enum: DEAL_MOVEMENT_STATUSES,
        example: 'stuck',
    })
    status: DealMovementStatus;

    @ApiProperty({
        description: 'Подпись статуса для человека.',
        type: String,
        example: 'Без продвижения',
    })
    title: string;

    @ApiProperty({
        description: 'Сколько открытых сделок «ОП Основная» в статусе.',
        type: Number,
        example: 42,
    })
    count: number;

    @ApiProperty({
        description:
            'Сумма этих сделок (сделка без суммы — 0). null — ночь посчитана ' +
            'до 20.11.2026: тогда сумм в снимке не было.',
        type: Number,
        nullable: true,
        example: 3_150_000,
    })
    amountSum: number | null;
}

/** Менеджер на последнюю ночь: статусы его сделок. */
export class DealMovementManagerStatusesDto {
    @ApiProperty({
        description: 'Bitrix-id ответственного за сделки.',
        type: String,
        example: '447',
    })
    managerId: string;

    @ApiProperty({
        description:
            'Имя «Фамилия Имя» по структуре отдела продаж; null — сотрудника ' +
            'нет в структуре (уволен, другой отдел) — показывайте «#id».',
        type: String,
        nullable: true,
        example: 'Иванова Анна',
    })
    managerName: string | null;

    @ApiProperty({
        description: 'Статусы — все пять, в постоянном порядке.',
        type: [DealMovementStatusCellDto],
    })
    cells: DealMovementStatusCellDto[];

    @ApiProperty({
        description: 'Всего открытых сделок менеджера, оценённых ночью.',
        type: Number,
        example: 120,
    })
    total: number;

    @ApiProperty({
        description:
            'Проблемных сделок (все статусы, кроме «Движется») — по нему ' +
            'менеджеры отсортированы, по убыванию.',
        type: Number,
        example: 37,
    })
    problemCount: number;

    @ApiProperty({
        description: 'Сумма проблемных сделок.',
        type: Number,
        example: 2_400_000,
    })
    problemAmountSum: number;
}

/** Менеджер в одной ночи динамики. */
export class DealMovementNightManagerDto {
    @ApiProperty({
        description: 'Bitrix-id ответственного.',
        type: String,
        example: '447',
    })
    managerId: string;

    @ApiProperty({
        description: 'Статусы — все пять, в постоянном порядке.',
        type: [DealMovementStatusCellDto],
    })
    cells: DealMovementStatusCellDto[];
}

/** Одна ночь динамики за период. */
export class DealMovementNightDto {
    @ApiProperty({
        description: 'День портала ночного счёта (YYYY-MM-DD).',
        type: String,
        example: '2026-11-19',
    })
    day: string;

    @ApiProperty({
        description:
            'Форма снимка: 1 — посчитан до 20.11.2026 (без сумм и без ' +
            'разреза по менеджерам), 2 — полный.',
        type: Number,
        example: 2,
    })
    form: number;

    @ApiProperty({
        description:
            'Итог по отделу (видимому пользователю). null — ночь формы 1, а ' +
            'пользователь видит не всех менеджеров или выбран фильтр: итог ' +
            'без разреза посчитать нельзя.',
        type: [DealMovementStatusCellDto],
        nullable: true,
    })
    department: DealMovementStatusCellDto[] | null;

    @ApiProperty({
        description:
            'Менеджеры ночи (видимые пользователю, с открытыми сделками); ' +
            'у ночей формы 1 — пусто.',
        type: [DealMovementNightManagerDto],
    })
    managers: DealMovementNightManagerDto[];
}

/** Блок статусов: последняя ночь периода и динамика по ночам. */
export class DealMovementStatusesDto {
    @ApiProperty({
        description:
            'Последняя ночь периода, по которой есть счёт (YYYY-MM-DD); null — ' +
            'счёта за период нет (см. notes).',
        type: String,
        nullable: true,
        example: '2026-11-20',
    })
    day: string | null;

    @ApiProperty({
        description:
            'Когда посчитана последняя ночь (ISO 8601); null — счёта нет.',
        type: String,
        nullable: true,
        example: '2026-11-19T23:41:00.000Z',
    })
    generatedAt: string | null;

    @ApiProperty({
        description:
            'Итог по отделу на последнюю ночь — все пять статусов; без счёта ' +
            'или итога — нули с amountSum = null.',
        type: [DealMovementStatusCellDto],
    })
    department: DealMovementStatusCellDto[];

    @ApiProperty({
        description:
            'Менеджеры на последнюю ночь (видимые пользователю): больше ' +
            'проблемных сделок — выше.',
        type: [DealMovementManagerStatusesDto],
    })
    managers: DealMovementManagerStatusesDto[];

    @ApiProperty({
        description: 'Динамика: ночи периода по порядку (ночей без счёта нет).',
        type: [DealMovementNightDto],
    })
    nights: DealMovementNightDto[];

    @ApiProperty({
        description:
            'Пояснения для человека: счёта нет, часть ночей без сумм и т. п.',
        type: [String],
        example: [
            'Часть ночей посчитана до 20.11.2026: по ним нет сумм и разреза по менеджерам',
        ],
    })
    notes: string[];
}
