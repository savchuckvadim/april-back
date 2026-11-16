import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayNotEmpty,
    ArrayUnique,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator';
import { PORTAL_PARTS, PortalPartName } from '../mappers/portal-scope.util';

/** Запрос частей портала: только то, что нужно экрану. */
export class FrontPortalPartsRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс24',
        example: 'mycompany.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain!: string;

    @ApiProperty({
        description:
            'Какие части портала отдать. Имена совпадают с ключами полной модели (POST front/portal).',
        enum: PORTAL_PARTS,
        enumName: 'PortalPartName',
        isArray: true,
        example: ['bitrixDeal', 'company'],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsIn(PORTAL_PARTS, { each: true })
    parts!: PortalPartName[];

    @ApiPropertyOptional({
        description:
            'Только смарты этих типов (колонка type); действует при запрошенной части smarts. Не задано — все смарты.',
        type: [String],
        example: ['complect_variant'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    smartTypes?: string[];

    @ApiPropertyOptional({
        description:
            'Части, от которых нужны только строки сущностей (тип, код, bitrixId, entityTypeId): их поля и воронки не читаются и приходят пустыми. Например, от смарта фронту обычно нужен один entityTypeId.',
        enum: PORTAL_PARTS,
        enumName: 'PortalPartName',
        isArray: true,
        example: ['smarts'],
    })
    @IsOptional()
    @IsArray()
    @IsIn(PORTAL_PARTS, { each: true })
    withoutFields?: PortalPartName[];
}
