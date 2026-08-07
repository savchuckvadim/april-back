import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsBoolean,
    IsOptional,
    IsString,
    Matches,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/**
 * Максимум жертв за один запрос: mergeBatch ~2 с на вызов, больше 10 —
 * гарантированный выход за operating-лимиты портала.
 */
export const MERGE_DUPLICATES_MAX_REFS = 10;

/** Формат ссылки на сущность: `LEAD_42`, `DEAL_10`, `CONTACT_5`, `COMPANY_7`. */
export const MERGE_ENTITY_REF_PATTERN = /^(LEAD|DEAL|CONTACT|COMPANY)_\d+$/;

/** Тело кнопки руководителя «смержить дубли». */
export class MergeDuplicatesRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description:
            'Ссылки на объединяемые сущности в формате `ТИП_ID` ' +
            '(LEAD_42, DEAL_10, CONTACT_5, COMPANY_7). Однотипные сущности ' +
            'сливаются через crm.entity.mergeBatch в самую старую ' +
            '(по DATE_CREATE), разнотипные — перепривязываются.',
        example: ['COMPANY_431', 'COMPANY_8821'],
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(2)
    @ArrayMaxSize(MERGE_DUPLICATES_MAX_REFS)
    @IsString({ each: true })
    @Matches(MERGE_ENTITY_REF_PATTERN, {
        each: true,
        message:
            'каждая ссылка должна иметь формат ТИП_ID, например COMPANY_431',
    })
    entityRefs: string[];

    @ApiPropertyOptional({
        description:
            'Режим проверки без записи. ПО УМОЛЧАНИЮ TRUE: объединение ' +
            'разрушающее (сущности-жертвы удаляются безвозвратно), поэтому ' +
            'реальный merge требует явного dryRun=false с planHash из ' +
            'dry-run-ответа.',
        example: true,
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'Хэш плана из dry-run-ответа. Обязателен при dryRun=false: ' +
            'несовпадение (портал изменился с момента просмотра плана) ' +
            'вернёт 409 Conflict.',
        example: 'a1b2c3d4e5f6',
        type: String,
    })
    @IsOptional()
    @IsString()
    planHash?: string;
}

/** Элемент пачки — внутренний контракт. */
export interface IMergeDuplicatesItem {
    entityRefs: string[];
    dryRun: boolean;
    planHash?: string;
}
