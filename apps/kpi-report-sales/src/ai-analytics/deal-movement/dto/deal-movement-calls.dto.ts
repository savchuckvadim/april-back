import { ApiProperty } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_CELL_FLAGS,
    DEAL_MOVEMENT_PROGRESS_LEVELS,
    DEAL_MOVEMENT_SCORE_BANDS,
    type DealMovementCellFlag,
    type DealMovementScoreBand,
} from '../deal-movement-vitrina.const';

/**
 * Звонки в витрине «Движение сделок» (пп. 3–4 постановки §7): матрица
 * «качество звонка × продвижение сделки» и честность оценок продвижения.
 * Только ответ.
 */

/** Полоса оценки звонка. */
export class DealMovementScoreBandDto {
    @ApiProperty({
        description: 'Код полосы: low — низкая, mid — средняя, high — высокая.',
        enum: DEAL_MOVEMENT_SCORE_BANDS,
        example: 'low',
    })
    code: DealMovementScoreBand;

    @ApiProperty({
        description: 'Подпись полосы для человека.',
        type: String,
        example: 'Низкая оценка (1–4)',
    })
    title: string;

    @ApiProperty({
        description: 'Оценка звонка от (включительно), шкала 1–10.',
        type: Number,
        example: 1,
    })
    min: number;

    @ApiProperty({
        description:
            'Оценка звонка до (включительно; оценка с одной цифрой после ' +
            'запятой — 4,9 ещё низкая).',
        type: Number,
        example: 4.9,
    })
    max: number;
}

/** Клетка матрицы: полоса оценки × продвижение. */
export class DealMovementMatrixCellDto {
    @ApiProperty({
        description: 'Полоса оценки звонка.',
        enum: DEAL_MOVEMENT_SCORE_BANDS,
        example: 'low',
    })
    scoreBand: DealMovementScoreBand;

    @ApiProperty({
        description: 'Продвижение сделки по звонку, 1–5 (шкала методики).',
        enum: DEAL_MOVEMENT_PROGRESS_LEVELS,
        type: Number,
        example: 4,
    })
    progress: number;

    @ApiProperty({
        description: 'Разобранных звонков в клетке.',
        type: Number,
        example: 6,
    })
    count: number;

    @ApiProperty({
        description:
            'Пометка клетки: buy_anyway — низкая оценка при продвижении 4–5 ' +
            '(«клиент купил бы и без менеджера»); null — без пометки.',
        enum: DEAL_MOVEMENT_CELL_FLAGS,
        nullable: true,
        example: 'buy_anyway',
    })
    flag: DealMovementCellFlag | null;

    @ApiProperty({
        description: 'Подпись пометки для человека; null — без пометки.',
        type: String,
        nullable: true,
        example: 'клиент купил бы и без менеджера',
    })
    flagTitle: string | null;
}

/** Матрица по набору звонков (отдел или менеджер). */
export class DealMovementMatrixDto {
    @ApiProperty({
        description: 'Звонков с оценкой и продвижением — сумма всех клеток.',
        type: Number,
        example: 54,
    })
    n: number;

    @ApiProperty({
        description:
            'Все 15 клеток: полосы low, mid, high × продвижение 1–5, по ' +
            'порядку (сначала низкая полоса, внутри — продвижение по ' +
            'возрастанию). Пустые клетки — с нулём.',
        type: [DealMovementMatrixCellDto],
    })
    cells: DealMovementMatrixCellDto[];

    @ApiProperty({
        description: 'Звонков «клиент купил бы и без менеджера».',
        type: Number,
        example: 3,
    })
    buyAnyway: number;

    @ApiProperty({
        description:
            'Звонков меньше 8 — выводы ненадёжны (число всё равно показываем).',
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

/** Матрица менеджера. */
export class DealMovementManagerMatrixDto extends DealMovementMatrixDto {
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

/** Блок матрицы: полосы, отдел и менеджеры. */
export class DealMovementMatrixBlockDto {
    @ApiProperty({
        description: 'Полосы оценки звонка по порядку — строки матрицы.',
        type: [DealMovementScoreBandDto],
    })
    bands: DealMovementScoreBandDto[];

    @ApiProperty({
        description: 'Уровни продвижения — столбцы матрицы.',
        type: [Number],
        example: [1, 2, 3, 4, 5],
    })
    progressLevels: number[];

    @ApiProperty({
        description:
            'Звонков с продвижением, но без оценки — в матрицу не попали.',
        type: Number,
        example: 2,
    })
    noScore: number;

    @ApiProperty({
        description: 'Отдел — все видимые звонки периода.',
        type: DealMovementMatrixDto,
    })
    department: DealMovementMatrixDto;

    @ApiProperty({
        description: 'Менеджеры со звонками — больше звонков выше.',
        type: [DealMovementManagerMatrixDto],
    })
    managers: DealMovementManagerMatrixDto[];
}

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
