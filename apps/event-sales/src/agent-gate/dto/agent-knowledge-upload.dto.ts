import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import { KNOWLEDGE_DOMAIN_PATTERN } from '@lib/ai-rag';

/**
 * Текстовый документ от агента в базу знаний (накопительные материалы:
 * профили менеджеров, выжимки, библиотеки ответов).
 */
export class AgentKnowledgeUploadDto {
    @ApiProperty({
        description:
            'Имя файла с расширением .md / .txt / .json (перезапись существующего допустима).',
        example: 'ivanov-ii.md',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[\w\-.]+\.(md|txt|json)$/i, {
        message:
            'fileName: латиница/цифры/дефис/подчёркивание и расширение .md|.txt|.json',
    })
    fileName: string;

    @ApiProperty({
        description: 'Содержимое документа (текст).',
        example: '# Иванов И.И.\nСлабое место: связка свойство-выгода...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(500_000)
    content: string;

    @ApiPropertyOptional({
        description:
            'Домен портала (клиентская база). Для ключа с доменной изоляцией — ' +
            'ОБЯЗАТЕЛЕН и должен входить в разрешённые; писать в общую базу ' +
            'может только ключ без ограничений.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(KNOWLEDGE_DOMAIN_PATTERN, {
        message: 'domain должен содержать только буквы, цифры, точки и дефис.',
    })
    domain?: string;
}
