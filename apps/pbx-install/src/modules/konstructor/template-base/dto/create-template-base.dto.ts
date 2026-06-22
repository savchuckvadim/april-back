import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { CreateTemplateBaseData } from '@lib/portal-lib/konstructor';

/**
 * Тело запроса на создание шаблона конструктора (`templates`).
 */
export class CreateTemplateBaseDto implements CreateTemplateBaseData {
    @ApiProperty({
        description: 'Название шаблона',
        example: 'КП на поставку',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description:
            'Символьный код шаблона. Используется как идентификатор шаблона ' +
            'в рамках портала, должен быть уникален.',
        example: 'offer_supply',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description:
            'Тип шаблона. Определяет назначение (например offer/contract).',
        example: 'offer',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    type: string;

    @ApiPropertyOptional({
        description: 'Ссылка на исходный документ-шаблон.',
        example: 'https://docs.example.com/template',
        type: String,
    })
    @IsOptional()
    @IsString()
    link?: string;

    @ApiProperty({
        description: 'ID портала-владельца, к которому привязан шаблон.',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    portalId: number;
}
