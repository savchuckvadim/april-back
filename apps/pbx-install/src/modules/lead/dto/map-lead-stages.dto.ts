import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayNotEmpty,
    IsArray,
    IsEnum,
    IsNotEmpty,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';

/** Одна пара сопоставления: шаблонная стадия → статус лида в Bitrix (один-к-одному). */
export class MapLeadStageItemDto {
    @ApiProperty({
        description: 'Код шаблонной стадии лида (из шаблона стадий в коде).',
        example: 'lead_in_work',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    templateStageCode!: string;

    @ApiProperty({
        description:
            'STATUS_ID реального статуса лида в Bitrix, выбранного как зеркало шаблонной стадии.',
        example: 'IN_PROCESS',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    bitrixStatusId!: string;
}

/** Тело запроса сопоставления стадий лида (template ↔ Bitrix). */
export class MapLeadStagesDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала. Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain!: string;

    @ApiProperty({
        description: 'Группа отдела (определяет набор шаблонных стадий).',
        enum: PbxEntityGroupEnum,
        example: PbxEntityGroupEnum.SALES,
    })
    @IsEnum(PbxEntityGroupEnum)
    group!: PbxEntityGroupEnum;

    @ApiProperty({
        description:
            'Сопоставления стадий один-к-одному. Каждый templateStageCode и каждый ' +
            'bitrixStatusId должны встречаться не более одного раза.',
        type: [MapLeadStageItemDto],
    })
    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => MapLeadStageItemDto)
    mappings!: MapLeadStageItemDto[];
}
