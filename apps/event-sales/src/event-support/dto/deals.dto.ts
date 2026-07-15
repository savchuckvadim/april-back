import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IBXDeal } from '@/modules/bitrix';

/**
 * Запрос сделок компании по текущей задаче.
 * Замена legacy PHP `POST full/deals`.
 */
export class CompanyDealsRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Текущая задача события (front-модель `EventTask`): используется ' +
            'для поиска связанных сделок по crm-привязкам задачи.',
        type: Object,
    })
    @IsObject()
    currentTask: Record<string, unknown>;
}

export class CompanyDealsResponseDto {
    @ApiPropertyOptional({
        description:
            'Все презентационные сделки, найденные по задаче (`IBXDeal[]`). ' +
            '`null`, если сделок нет. Структура элементов соответствует сделке Bitrix.',
        type: Object,
        isArray: true,
        nullable: true,
    })
    @IsOptional()
    allPresentationDeals?: IBXDeal[] | null;
}