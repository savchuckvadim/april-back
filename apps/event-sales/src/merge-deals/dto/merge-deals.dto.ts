import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Статус выполнения операции объединения сделок.
 * `ok` — операция выполнена, `not_implemented` — модуль пока заглушка
 * и реального объединения в Битрикс не произошло.
 */
export type MergeDealsStatus = 'ok' | 'not_implemented';

/**
 * Runtime-набор статусов: используется одновременно в `@IsIn(...)` для
 * валидации и в `enum: ...` для Swagger, чтобы список не расходился.
 */
export const MERGE_DEALS_STATUS_VALUES = [
    'ok',
    'not_implemented',
] as const satisfies readonly MergeDealsStatus[];

/**
 * Тело запроса на объединение сделок: целевая сделка, в которую сливаются
 * данные, и список сделок-источников, которые после слияния будут закрыты.
 */
export class MergeDealsRequestDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix, на котором находятся сделки. По нему ' +
            'PBXService отдаёт инстанс Bitrix с ключами доступа портала.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ID целевой сделки Bitrix, в которую переносятся данные ' +
            'сделок-источников. Эта сделка остаётся активной после слияния.',
        example: 1024,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    targetDealId: number;

    @ApiProperty({
        description:
            'ID сделок-источников Bitrix, данные которых переносятся ' +
            'в целевую сделку. После слияния они помечаются как дубли.',
        example: [1025, 1026],
        type: [Number],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsInt({ each: true })
    @Min(1, { each: true })
    sourceDealIds: number[];

    @ApiPropertyOptional({
        description:
            'Режим проверки без записи: если `true`, слияние только ' +
            'рассчитывается, изменения в Битрикс не отправляются.',
        example: true,
        type: Boolean,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;
}

/**
 * Ответ на запрос объединения сделок. Пока модуль — заглушка, поэтому
 * возвращается эхо входных данных и статус `not_implemented`.
 */
export class MergeDealsResponseDto {
    @ApiProperty({
        description:
            'Статус операции. Пока модуль реализован как заглушка, ' +
            'всегда возвращается `not_implemented` — сделки в Битрикс ' +
            'не изменяются.',
        example: 'not_implemented',
        type: String,
        enum: MERGE_DEALS_STATUS_VALUES,
    })
    @IsString()
    @IsIn(MERGE_DEALS_STATUS_VALUES as unknown as string[])
    status: MergeDealsStatus;

    @ApiProperty({
        description: 'Домен портала Bitrix из запроса (эхо входных данных).',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'ID целевой сделки из запроса (эхо входных данных).',
        example: 1024,
        type: Number,
    })
    @IsInt()
    targetDealId: number;

    @ApiProperty({
        description:
            'ID сделок-источников из запроса (эхо входных данных). ' +
            'Ни одна из них не была изменена.',
        example: [1025, 1026],
        type: [Number],
    })
    @IsArray()
    @IsInt({ each: true })
    sourceDealIds: number[];

    @ApiProperty({
        description:
            'Пояснение для клиента: что именно произошло с запросом. ' +
            'Для заглушки — сообщение о том, что логика ещё не подключена.',
        example: 'Модуль merge-deals пока заглушка: сделки не объединялись.',
        type: String,
    })
    @IsString()
    message: string;
}

/**
 * Ответ smoke-эндпоинта: подтверждает, что модуль поднят и доступен.
 */
export class MergeDealsHealthResponseDto {
    @ApiProperty({
        description:
            'Статус модуля. `ok` — модуль зарегистрирован в приложении ' +
            'и его маршруты обслуживаются.',
        example: 'ok',
        type: String,
        enum: MERGE_DEALS_STATUS_VALUES,
    })
    @IsString()
    @IsIn(MERGE_DEALS_STATUS_VALUES as unknown as string[])
    status: MergeDealsStatus;

    @ApiProperty({
        description: 'Имя модуля — для идентификации в логах и мониторинге.',
        example: 'merge-deals',
        type: String,
    })
    @IsString()
    module: string;

    @ApiProperty({
        description:
            'Признак готовности доменной логики. `false` — модуль ' +
            'подключён как заглушка, объединение сделок ещё не реализовано.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;
}
