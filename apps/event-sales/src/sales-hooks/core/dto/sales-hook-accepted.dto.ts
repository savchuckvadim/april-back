import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString } from 'class-validator';
import {
    EnumSalesHookCode,
    SALES_HOOK_CODE_VALUES,
} from '../constants/sales-hook-code.enum';

/**
 * Ответ вебхука робота: факт приёма, не результат. Обработка произойдёт
 * после окна тишины silence-буфера — робот Битрикса ответа не читает.
 */
export class SalesHookAcceptedDto {
    @ApiProperty({
        description:
            'Хук принят в silence-буфер. Обработка выполнится после ' +
            'окна тишины, когда burst событий закончится.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    accepted: boolean;

    @ApiProperty({
        description: 'Код хука, принявшего событие.',
        example: 'lead-to-work',
        type: String,
        enum: SALES_HOOK_CODE_VALUES,
    })
    @IsString()
    @IsIn(SALES_HOOK_CODE_VALUES as unknown as string[])
    hook: EnumSalesHookCode;

    @ApiProperty({
        description: 'Домен портала Bitrix, приславшего событие.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description:
            'Ключ silence-канала, в который попало событие (для отладки).',
        example: 'SALES_HOOK_lead-to-work_example_bitrix24_ru_42',
        type: String,
    })
    @IsString()
    keyPrefix: string;
}
