import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import {
    KNOWLEDGE_DOMAIN_PATTERN,
    KNOWLEDGE_KIND_PATTERN,
} from '../domain/types/knowledge.type';

/** Адрес конкретного документа базы знаний: (domain?, kind, fileName). */
export class KnowledgeDocumentQueryDto {
    @ApiProperty({
        description:
            'Тип (kind) — имя подпапки базы знаний, из которой берётся документ. ' +
            'general — общие материалы, иначе конкретный тип звонка/операции.',
        example: 'presentation',
        type: String,
    })
    @IsString()
    @Matches(KNOWLEDGE_KIND_PATTERN, {
        message:
            'kind должен быть slug: латинские буквы, цифры и дефис, начиная с буквы.',
    })
    kind: string;

    @ApiProperty({
        description:
            'Имя файла документа внутри kind-папки (как вернул список документов).',
        example: 'skript-prezentacii.docx',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    fileName: string;

    @ApiPropertyOptional({
        description:
            'Домен портала: с ним берётся клиентская база ' +
            'storage/app/ai-rag/knowledge/{domain}/, без него — общая.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(KNOWLEDGE_DOMAIN_PATTERN, {
        message: 'domain должен содержать только буквы, цифры, точки и дефис.',
    })
    domain?: string;
}
