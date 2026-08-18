import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Фаза 1: dry-run поиск потерянных «СС Состоялся» (ничего не пишет). */
export class SsRestoreScanDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Нижняя граница закрытия задач (ISO-дата). По умолчанию 2026-05-01.',
        example: '2026-05-01',
        type: String,
    })
    @IsOptional()
    @IsString()
    from?: string;

    @ApiPropertyOptional({
        description: 'Верхняя граница закрытия задач (ISO-дата).',
        example: '2026-08-31',
        type: String,
    })
    @IsOptional()
    @IsString()
    to?: string;

    @ApiPropertyOptional({
        description:
            'ID рабочих групп СС (их может быть несколько). По умолчанию — ' +
            'из PortalModel (gsr → 9, april → 34, dev → 17); в перспективе — ' +
            'из app-settings.',
        example: [9],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @Type(() => Number)
    @IsInt({ each: true })
    groupIds?: number[];

    @ApiPropertyOptional({
        description:
            'Ограничить число сканируемых задач (для пробных прогонов).',
        example: 20,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number;
}

/** Фаза 2: запись выбранных кандидатов. */
export class SsRestoreApplyDto {
    @ApiProperty({
        description: 'operationId, полученный от scan (живёт 1 час).',
        example: '3b2e6a52-6a19-4c85-9f1e-2d4b7c8a9e10',
        type: String,
    })
    @IsUUID()
    operationId: string;

    @ApiPropertyOptional({
        description:
            'ID задач для восстановления (из кандидатов scan). ' +
            'Без списка — все кандидаты сессии.',
        example: [328341],
        type: [Number],
    })
    @IsOptional()
    @IsArray()
    @Type(() => Number)
    @IsInt({ each: true })
    taskIds?: number[];

    @ApiPropertyOptional({
        description:
            'Верхний срез пачки (небольшими партиями по согласованию).',
        example: 10,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    limit?: number;
}

/** Сброс сессии scan. */
export class SsRestoreOperationDto {
    @ApiProperty({
        description: 'operationId, полученный от scan.',
        example: '3b2e6a52-6a19-4c85-9f1e-2d4b7c8a9e10',
        type: String,
    })
    @IsUUID()
    operationId: string;
}

/** Кандидат на восстановление (превью «после»). */
export class SsRestoreCandidateDto {
    @ApiProperty({ example: 328341 }) taskId: number;
    @ApiProperty({ example: '(7473677) Зафиксирован факт отказа… (5103)' })
    title: string;
    @ApiProperty({ example: '2026-05-12T09:15:00+03:00' }) closedDate: string;
    @ApiProperty({ example: 127 }) responsibleId: number;
    @ApiProperty({ example: 98511, nullable: true }) companyId: number | null;
    @ApiProperty({ example: 172003, nullable: true }) dealId: number | null;
    @ApiProperty({ example: 55123, nullable: true }) contactId: number | null;
    @ApiProperty({ description: 'Коммент менеджера из задачи' })
    comment: string;
    @ApiProperty({
        description: 'ID найденной «Создан»-строки в ОРК-истории',
        nullable: true,
        example: 1375047,
    })
    createdRowId: number | null;
    @ApiProperty({
        description: 'Дата будущего элемента (dd.MM.yyyy HH:mm:ss)',
        example: '12.05.2026 09:15:00',
    })
    elementDate: string;
}

export class SsRestoreSkippedDto {
    @ApiProperty({ example: 328000 }) taskId: number;
    @ApiProperty({ example: 'already_done' }) reason: string;
}

export class SsRestoreScanResponseDto {
    @ApiProperty({ example: 'gsr.bitrix24.ru' }) domain: string;
    @ApiProperty() operationId: string;
    @ApiProperty({ description: 'Всего закрытых задач СС в периоде' })
    totalTasks: number;
    @ApiProperty({ type: [SsRestoreCandidateDto] })
    candidates: SsRestoreCandidateDto[];
    @ApiProperty({ type: [SsRestoreSkippedDto] })
    skipped: SsRestoreSkippedDto[];
}

export class SsRestoreAppliedDto {
    @ApiProperty({ example: 328341 }) taskId: number;
    @ApiProperty({ description: 'ID созданного элемента', example: 1390001 })
    elementId: number | string;
}

export class SsRestoreFailedDto {
    @ApiProperty({ example: 328341 }) taskId: number;
    @ApiProperty({ example: 'ERROR_ELEMENT_FIELD_VALUE: …' }) error: string;
}

export class SsRestoreApplyResponseDto {
    @ApiProperty({ example: 'gsr.bitrix24.ru' }) domain: string;
    @ApiProperty({ type: [SsRestoreAppliedDto] })
    applied: SsRestoreAppliedDto[];
    @ApiProperty({ type: [SsRestoreFailedDto] }) failed: SsRestoreFailedDto[];
    @ApiProperty({
        description: 'Уже существовали (детерминированный ELEMENT_CODE)',
        type: [Number],
    })
    skippedAlreadyExists: number[];
    @ApiProperty({ description: 'Кандидатов осталось в сессии' })
    remaining: number;
}

export class SsRestoreDiscardResponseDto {
    @ApiProperty() discarded: boolean;
}
