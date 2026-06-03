import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { KNOWLEDGE_DOMAIN_PATTERN } from '../domain/types/knowledge.type';

export class KnowledgeUploadBodyDto {
    @ApiPropertyOptional({
        description:
            'Домен портала. Если задан — документ сохраняется в клиентскую базу ' +
            '(storage/app/ai-rag/knowledge/{domain}/{kind}/). Без домена — в общую базу.',
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
