import { ApiProperty } from '@nestjs/swagger';
import { InstallCallReportSmartResult } from '@lib/call-lib';

/** Результат установки смарта «AI-анализ звонков» (aicall_report). */
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
}
