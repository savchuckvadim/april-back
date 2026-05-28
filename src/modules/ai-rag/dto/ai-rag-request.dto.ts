import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { LLM_MODELS, LlmModel } from '../domain/types/llm-model.type';

export class AiRagRequestDto {
    @ApiProperty({
        description:
            'Текст транскрибированного звонка, по которому надо построить ' +
            'резюме или рекомендации.',
        example:
            'Алло, здравствуйте, это компания Гарант, я хотел бы обсудить...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    query: string;

    @ApiProperty({
        description:
            'Идентификатор LLM-провайдера, которым будет обработан запрос.',
        example: 'gigachat',
        type: String,
        enum: LLM_MODELS,
    })
    @IsString()
    @IsIn(LLM_MODELS as unknown as string[])
    model: LlmModel;

    @ApiPropertyOptional({
        description:
            'Домен портала (b24-инстанс). Зарезервировано для будущей ' +
            'per-portal базы знаний; в MVP игнорируется.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Флаг использования настроек портала (промпт + список ' +
            'материалов). Зарезервировано; в MVP игнорируется.',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    usePortalSettings?: boolean;
}
