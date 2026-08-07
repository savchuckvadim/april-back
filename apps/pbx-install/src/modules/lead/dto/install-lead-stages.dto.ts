import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayNotEmpty,
    IsArray,
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { PbxEntityGroupEnum } from '../../shared/entity/field/parse-entity-field.service';

/** Runtime-набор действий синка — для @IsIn и Swagger enum. */
export const LEAD_STAGE_SYNC_ACTIONS = [
    'created',
    'updated',
    'skipped',
] as const;
export type LeadStageSyncAction = (typeof LEAD_STAGE_SYNC_ACTIONS)[number];

/** Тело установки стадий лида в Bitrix (аддитивно, только installMode='create'). */
export class InstallLeadStagesDto {
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
        description: 'Группа отделов, чей шаблон стадий устанавливается.',
        example: PbxEntityGroupEnum.SALES,
        enum: PbxEntityGroupEnum,
    })
    @IsEnum(PbxEntityGroupEnum)
    group!: PbxEntityGroupEnum;

    @ApiPropertyOptional({
        description:
            'Сузить установку до конкретных кодов шаблона. Без параметра ' +
            'устанавливаются все стадии шаблона с installMode=create.',
        example: ['lead_taken_in_work', 'lead_company_work'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsString({ each: true })
    codes?: string[];
}

/** Итог синка одной стадии. */
export class InstallLeadStageItemResultDto {
    @ApiProperty({
        description: 'Код стадии шаблона.',
        example: 'lead_taken_in_work',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'STATUS_ID статуса в Bitrix.',
        example: 'PBX_TAKEN_IN_WORK',
        type: String,
    })
    @IsString()
    bitrixStatusId!: string;

    @ApiProperty({
        description:
            'Что сделано: created — статус создан, updated — обновлён, ' +
            'skipped — уже совпадает с шаблоном.',
        example: 'created',
        type: String,
        enum: LEAD_STAGE_SYNC_ACTIONS,
    })
    @IsString()
    @IsIn(LEAD_STAGE_SYNC_ACTIONS as unknown as string[])
    action!: LeadStageSyncAction;

    @ApiProperty({
        description:
            'Итоговый SORT в Bitrix (мог быть вжат под финальные статусы).',
        example: 22,
        type: Number,
    })
    @IsInt()
    sort!: number;
}

/** Ответ установки стадий лида. */
export class InstallLeadStagesResponseDto {
    @ApiProperty({
        description: 'Идентификатор лида-якоря в PortalDB.',
        example: 12,
        type: Number,
    })
    @IsInt()
    leadId!: number;

    @ApiProperty({
        description: 'Идентификатор категории-якоря стадий в PortalDB.',
        example: 34,
        type: Number,
    })
    @IsInt()
    categoryId!: number;

    @ApiProperty({
        description:
            'Результат синка по каждой устанавливаемой стадии шаблона. ' +
            'Чужие статусы портала не удаляются никогда.',
        type: [InstallLeadStageItemResultDto],
    })
    @IsArray()
    items!: InstallLeadStageItemResultDto[];
}
