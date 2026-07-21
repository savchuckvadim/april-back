import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/** Установка смарта «AI-анализ звонков» на портал (прокси в event-sales). */
export class InstallAicallDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, на который ставится смарт.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

/** Результат установки смарта «AI-анализ звонков». */
export class InstallAicallResponseDto {
    @ApiProperty({
        description: 'entityTypeId смарта на портале.',
        example: 128,
        type: Number,
    })
    entityTypeId: number;

    @ApiProperty({
        description: 'true — тип создан этим вызовом, false — уже существовал.',
        example: false,
        type: Boolean,
    })
    created: boolean;

    @ApiProperty({
        description: 'UF-имена добавленных полей.',
        example: ['UF_CRM_128_NEXT_STEP_SET'],
        type: [String],
    })
    fieldsAdded: string[];

    @ApiProperty({
        description: 'UF-имена уже существовавших полей.',
        example: ['UF_CRM_128_SUMMARY'],
        type: [String],
    })
    fieldsExisting: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые не удалось создать.',
        example: [],
        type: [String],
    })
    fieldsFailed: string[];
}
