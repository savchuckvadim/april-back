import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Версии разбора — вынесены из общего файла контракта агента (лимит файла);
 * имена и декораторы прежние, реэкспорт через барель.
 */

/**
 * Версии разбора (план AI-аналитики ОП, §5.4): по ним витрина решает,
 * какие разборы сравнимы между собой (comparableFrom). Внутренний конвейер
 * заполняет их сам (call-report-versions.const.ts), внешний агент может
 * прислать свои.
 */
export class AgentAnalysisVersionsDto {
    @ApiProperty({
        description: 'Версия промпта разбора (фокус-вызовы + синтез).',
        example: 'focus-v2.1-2026-09-05',
        type: String,
    })
    @IsString()
    prompt: string;

    @ApiProperty({
        description: 'Версия рубрики: состав разделов и шкала оценок.',
        example: 'sections-7-v1',
        type: String,
    })
    @IsString()
    rubric: string;

    @ApiProperty({
        description:
            'Хэш реестра типов звонков домена (короткий sha1 отсортированных ' +
            'кодов) либо builtin, если реестр был недоступен.',
        example: '3f2a9c1b0d7e',
        type: String,
    })
    @IsString()
    registry: string;

    @ApiProperty({
        description: 'Дата правила атрибуции менеджера звонка (YYYY-MM-DD).',
        example: '2026-08-24',
        type: String,
    })
    @IsString()
    attribution: string;

    @ApiProperty({
        description: 'Дата версии классификатора типов звонков (YYYY-MM-DD).',
        example: '2026-09-05',
        type: String,
    })
    @IsString()
    classifier: string;
}
