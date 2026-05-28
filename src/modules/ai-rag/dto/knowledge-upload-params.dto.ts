import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { KNOWLEDGE_KIND_PATTERN } from '../domain/types/knowledge.type';

export class KnowledgeUploadParamsDto {
    @ApiProperty({
        description:
            'Тип эндпоинта-получателя документа (general — общие для всех типов, ' +
            'или конкретный, например resume / recomendation). Используется как имя ' +
            'подпапки в storage/app/ai-rag/knowledge/.',
        example: 'resume',
        type: String,
    })
    @IsString()
    @Matches(KNOWLEDGE_KIND_PATTERN, {
        message:
            'kind должен быть slug: латинские буквы, цифры и дефис, начиная с буквы.',
    })
    kind: string;
}
