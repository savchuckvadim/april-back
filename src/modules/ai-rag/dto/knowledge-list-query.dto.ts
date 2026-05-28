import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import {
    KNOWLEDGE_DOMAIN_PATTERN,
    KNOWLEDGE_KIND_PATTERN,
} from '../domain/types/knowledge.type';

export class KnowledgeListQueryDto {
    @ApiPropertyOptional({
        description:
            'Тип эндпоинта (general / resume / recomendation / ...). По умолчанию general.',
        example: 'resume',
        type: String,
    })
    @IsOptional()
    @IsString()
    @Matches(KNOWLEDGE_KIND_PATTERN, {
        message:
            'kind должен быть slug: латинские буквы, цифры и дефис, начиная с буквы.',
    })
    kind?: string;

    @ApiPropertyOptional({
        description:
            'Домен портала. Если папка такого домена существует — будет показана ' +
            'клиентская база; иначе вернётся общая.',
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
