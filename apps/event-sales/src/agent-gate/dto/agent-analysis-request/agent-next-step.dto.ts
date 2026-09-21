import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Следующий шаг по итогам звонка — вынесен из общего файла контракта агента
 * (лимит файла); имена и декораторы прежние, реэкспорт через барель.
 */

/** Следующий шаг по итогам звонка (валиден при наличии что/кто/когда). */
export class AgentNextStepDto {
    @ApiProperty({
        description:
            'Назначен ли конкретный следующий шаг. Валидный шаг содержит ' +
            '«что/кто/когда»; «клиент подумает» — НЕ следующий шаг.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    set: boolean;

    @ApiPropertyOptional({
        description: 'Формулировка шага: что именно, кто делает, как свяжемся.',
        example:
            'Презентация по Zoom, проводит менеджер, клиент подключает главбуха',
        type: String,
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description: 'Дата следующего шага (YYYY-MM-DD), если названа.',
        example: '2026-07-24',
        type: String,
    })
    @IsOptional()
    @IsString()
    date?: string;
}
