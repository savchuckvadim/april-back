import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    InstallCallReportSmartResult,
    InstallFieldFailureDto,
} from '@lib/call-lib';

/** Результат установки смарта «AI-анализ звонков» (aicall_sales). */
export class InstallAicallSmartResponseDto
    implements InstallCallReportSmartResult
{
    @ApiProperty({
        description: 'entityTypeId смарт-процесса на портале.',
        example: 128,
        type: Number,
    })
    entityTypeId: number;

    @ApiProperty({
        description:
            'true — тип создан этим вызовом; false — уже существовал (идемпотентный повтор).',
        example: false,
        type: Boolean,
    })
    created: boolean;

    @ApiProperty({
        description: 'UF-имена полей, добавленных этим вызовом.',
        example: ['UF_CRM_128_NEXT_STEP_SET'],
        type: [String],
    })
    fieldsAdded: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые уже существовали.',
        example: ['UF_CRM_128_SUMMARY'],
        type: [String],
    })
    fieldsExisting: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые не удалось создать (см. логи).',
        example: [],
        type: [String],
    })
    fieldsFailed: string[];

    @ApiProperty({
        description:
            'Существующие поля-перечисления, которым долиты недостающие ' +
            'значения справочника (например, новый риск-флаг): ' +
            '«UF-имя поля: коды значений».',
        example: ['UF_CRM_128_RISK_FLAGS: door_closed'],
        type: [String],
    })
    enumItemsAdded: string[];

    @ApiPropertyOptional({
        description:
            'true — портал достиг лимита пользовательских полей Битрикс24: ' +
            'часть полей не создана, остальные после первого отказа не пробовались.',
        example: false,
        type: Boolean,
    })
    fieldLimitReached?: boolean;

    @ApiPropertyOptional({
        description: 'Причина по каждому несозданному полю — словами.',
        type: [InstallFieldFailureDto],
    })
    fieldsFailedDetails?: InstallFieldFailureDto[];
}
