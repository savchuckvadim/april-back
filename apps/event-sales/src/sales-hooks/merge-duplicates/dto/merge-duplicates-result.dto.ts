import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString } from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Группа однотипных сущностей в плане merge. */
export class MergeGroupDto {
    @ApiProperty({
        description: 'Тип сущностей группы (LEAD/DEAL/CONTACT/COMPANY).',
        example: 'COMPANY',
        type: String,
    })
    entityType: string;

    @ApiProperty({
        description:
            'Survivor — самая старая сущность: в неё сливаются остальные.',
        example: 431,
        type: Number,
    })
    survivorId: number;

    @ApiProperty({
        description: 'Жертвы: их данные переносятся, сами они УДАЛЯЮТСЯ.',
        example: [8821],
        type: [Number],
    })
    victimIds: number[];
}

/** Итог выполнения группы (только при dryRun=false). */
export class MergeGroupResultDto extends MergeGroupDto {
    @ApiProperty({
        description:
            'SUCCESS — объединено; CONFLICT — требуется штатный интерфейс ' +
            'дублей Битрикса; PARTIAL — часть порций прошла; ERROR — ошибка.',
        example: 'SUCCESS',
        type: String,
    })
    status: string;

    @ApiProperty({
        description: 'Идентификаторы реально удалённых сущностей.',
        example: [8821],
        type: [Number],
    })
    mergedIds: number[];

    @ApiPropertyOptional({
        description: 'Текст ошибки/конфликта.',
        type: String,
        nullable: true,
    })
    error?: string | null;
}

/** Результат операции merge (план при dryRun, итоги — при выполнении). */
export class MergeDuplicatesResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description:
            'Режим запуска: true — только план, ни одной записи в Битрикс.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    dryRun: boolean;

    @ApiProperty({
        description:
            'Подпись плана. Выполнение (dryRun=false) требует передать её ' +
            'в planHash — несовпадение значит, что портал изменился.',
        example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        type: String,
    })
    @IsString()
    planHash: string;

    @ApiProperty({
        description: 'Группы объединения (план или итоги выполнения).',
        type: [MergeGroupResultDto],
    })
    @IsArray()
    groups: MergeGroupResultDto[];

    @ApiProperty({
        description:
            'Перепривязки «сделка → компания-survivor» (выяснилась компания).',
        example: [{ dealId: 1024, companyId: 431 }],
        type: [Object],
    })
    @IsArray()
    relink: { dealId: number; companyId: number }[];

    @ApiProperty({
        description:
            'Отброшенные участники с причинами (чужие воронки и т.п.).',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    skipped: string[];

    @ApiProperty({
        description: 'Предупреждения выполнения.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];

    @ApiProperty({
        description: 'Краткое пояснение итога.',
        example:
            'План merge: 1 группа, 1 перепривязка. Выполните с dryRun=false и planHash.',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция merge с типизированным результатом. */
export class MergeDuplicatesOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: MergeDuplicatesResultDto,
        nullable: true,
    })
    declare result: MergeDuplicatesResultDto | null;
}
