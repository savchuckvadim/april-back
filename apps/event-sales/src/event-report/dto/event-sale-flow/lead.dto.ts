import { IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IBXLead } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';

export class LeadDto implements IBXLead {
    @ApiProperty({
        description: 'Идентификатор лида Bitrix.',
        type: Number,
        example: 4096,
    })
    @IsNumber()
    ID: number;

    @ApiProperty({
        description: 'Название лида.',
        type: String,
        example: 'Заявка с сайта',
    })
    @IsString()
    TITLE: string;

    @ApiPropertyOptional({
        description: 'Ссылка на квест/опрос, из которого пришёл лид.',
        type: String,
        example: 'https://quest.example.com/abc',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_QUEST_URL: string;

    @ApiPropertyOptional({
        description: 'Идентификатор источника лида.',
        type: String,
        example: 'WEB',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_SOURCE_ID: string;

    @ApiPropertyOptional({
        description: 'Описание источника лида.',
        type: String,
        example: 'Форма обратной связи',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_SOURCE_DESCRIPTION: string;

    @ApiPropertyOptional({
        description: 'Название источника лида.',
        type: String,
        example: 'Сайт',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_SOURCE_NAME: string;

    @ApiPropertyOptional({
        description: 'Тип источника лида.',
        type: String,
        example: 'online',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_SOURCE_TYPE: string;

    @ApiPropertyOptional({
        description: 'Идентификатор типа источника лида.',
        type: String,
        example: '12',
    })
    @IsString()
    @IsOptional()
    UF_CRM_LEAD_SOURCE_TYPE_ID: string;

    [key: string]: string | number;
}
