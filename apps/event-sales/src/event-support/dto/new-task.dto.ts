import {
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

/**
 * Инициализация контекста «новая задача»: сделки для связи,
 * когда у компании ещё нет открытых задач событий.
 * Замена legacy PHP `POST full/newTask/init`.
 */
export class NewTaskInitRequestDto {
    @ApiProperty({
        description: 'Идентификатор текущего пользователя Bitrix.',
        type: Number,
        example: 81,
    })
    @IsNumeric()
    userId: number;

    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Текущая компания Bitrix (`IBXCompany`). `null`, если компания ' +
            'не определена из placement.',
        type: Object,
        nullable: true,
    })
    @IsOptional()
    @IsObject()
    company?: IBXCompany | null;

    @ApiProperty({
        description:
            'Источник инициализации (из какого контекста открыт виджет).',
        type: String,
        example: 'company',
    })
    @IsString()
    from: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор базовой сделки, если инициализация идёт от сделки.',
        type: Number,
        nullable: true,
        example: null,
    })
    @IsOptional()
    baseDealId?: number | string | null;
}

export class NewTaskDealsDto {
    @ApiPropertyOptional({
        description:
            'Все презентационные сделки компании (`IBXDeal[]`). ' +
            '`null`, если сделок нет.',
        type: Object,
        isArray: true,
        nullable: true,
    })
    @IsOptional()
    allPresentationDeals?: IBXDeal[] | null;
}

export class NewTaskInitResponseDto {
    @ApiProperty({
        description: 'Сделки, собранные для инициализации новой задачи.',
        type: NewTaskDealsDto,
    })
    @ValidateNested()
    @Type(() => NewTaskDealsDto)
    deals: NewTaskDealsDto;
}
