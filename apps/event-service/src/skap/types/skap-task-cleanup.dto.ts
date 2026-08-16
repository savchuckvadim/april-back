import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Min,
} from 'class-validator';
import {
    SkapTaskConfirmResult,
    SkapTaskPreview,
    SkapTaskScanResult,
} from '../use-cases/skap-task-cleanup.use-case';

/** Фаза 1: поиск задач импорта СКАП (ничего не удаляет). */
export class SkapTaskScanDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, на котором ищем задачи.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Подстрока заголовка для поиска. По умолчанию «СКАП» — все ' +
            'задачи импорта начинаются с неё.',
        example: 'СКАП',
        type: String,
    })
    @IsOptional()
    @IsString()
    titlePrefix?: string;

    @ApiPropertyOptional({
        description:
            'Постановщик задач (bitrix-id пользователя вебхука — им ' +
            'создаются все задачи приложения). По умолчанию 187 — ' +
            'вебхук-пользователь gsr; для другого портала укажите явно. ' +
            'Страховка от случайного совпадения с ручными задачами.',
        example: 187,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    createdBy?: number;
}

/** Фаза 2: подтверждение удаления или сброс найденного. */
export class SkapTaskOperationDto {
    @ApiProperty({
        description: 'operationId, полученный от scan (живёт 1 час).',
        example: '3b2e6a52-6a19-4c85-9f1e-2d4b7c8a9e10',
        type: String,
    })
    @IsUUID()
    operationId: string;
}

/** Превью найденной задачи. */
export class SkapTaskPreviewDto implements SkapTaskPreview {
    @ApiProperty({ description: 'Id задачи.', example: 1234, type: Number })
    id: number;

    @ApiProperty({
        description: 'Заголовок задачи.',
        example: 'СКАП: проверьте созданные контакты (30 шт)',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Ответственный по задаче.',
        example: 42,
        type: Number,
        nullable: true,
    })
    responsibleId: number | null;

    @ApiProperty({
        description: 'Дата создания задачи.',
        example: '2026-08-11T09:00:00+03:00',
        type: String,
        nullable: true,
    })
    createdDate: string | null;
}

/** Итог scan: сколько нашли и токен операции. */
export class SkapTaskScanResponseDto implements SkapTaskScanResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Токен операции: передать в confirm (удалить найденное) или ' +
            'discard (забыть). Живёт 1 час.',
        example: '3b2e6a52-6a19-4c85-9f1e-2d4b7c8a9e10',
        type: String,
    })
    operationId: string;

    @ApiProperty({
        description: 'Сколько всего задач найдено по фильтру.',
        example: 12,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description:
            'Найденные задачи (до 500) — просмотреть заголовки перед решением.',
        type: [SkapTaskPreviewDto],
    })
    preview: SkapTaskPreviewDto[];
}

/** Итог confirm: сколько удалено из зафиксированного списка. */
export class SkapTaskConfirmResponseDto implements SkapTaskConfirmResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Токен подтверждённой операции.',
        example: '3b2e6a52-6a19-4c85-9f1e-2d4b7c8a9e10',
        type: String,
    })
    operationId: string;

    @ApiProperty({
        description: 'Сколько задач было зафиксировано при scan.',
        example: 12,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description: 'Сколько задач удалено.',
        example: 12,
        type: Number,
    })
    deleted: number;

    @ApiProperty({
        description: 'Сколько задач не удалось удалить (детали в логах).',
        example: 0,
        type: Number,
    })
    failed: number;
}

/** Итог discard. */
export class SkapTaskDiscardResponseDto {
    @ApiProperty({
        description:
            'true — операция сброшена; false — токен не найден (уже истёк ' +
            'или был подтверждён/сброшен ранее).',
        example: true,
        type: Boolean,
    })
    discarded: boolean;
}
