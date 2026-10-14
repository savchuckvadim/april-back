import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    ValidateNested,
} from 'class-validator';
import { BXUserDto } from '../../shared/dto/bx-user.dto';
import {
    KPI_DIGEST_PERIOD_KINDS,
    KpiDigestPeriodKind,
} from '../constants/digest.const';

/**
 * Фильтры дневного дайджеста. Период задаётся одной датой: партиция дня
 * собирается по ВСЕМУ порталу, departament лишь отбирает строки ответа
 * и задаёт ключ дедупликации job'а.
 */
export class KpiDigestFiltersDto {
    @ApiProperty({
        description:
            'Вид периода. Пока поддерживается только day; остальные виды ' +
            'появятся без смены контракта.',
        enum: KPI_DIGEST_PERIOD_KINDS,
        example: 'day',
    })
    @IsIn(KPI_DIGEST_PERIOD_KINDS)
    kind: KpiDigestPeriodKind;

    @ApiProperty({
        description: 'День дайджеста в формате YYYY-MM-DD (дата портала).',
        type: String,
        example: '2026-10-14',
    })
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date: ожидается YYYY-MM-DD',
    })
    date: string;

    @ApiProperty({
        description:
            'Сотрудники, по которым нужны строки дайджеста (имена берутся ' +
            'отсюда). Сводка «по всем» считается по всему порталу.',
        type: [BXUserDto],
    })
    @ValidateNested({ each: true })
    @Type(() => BXUserDto)
    @IsArray()
    departament: BXUserDto[];
}

export class KpiDigestRequestDto {
    @ApiProperty({
        description:
            'Домен портала Битрикс24, по которому PBXService выдаёт инстанс API.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Фильтры дайджеста: вид периода, дата, сотрудники.',
        type: KpiDigestFiltersDto,
    })
    @ValidateNested()
    @Type(() => KpiDigestFiltersDto)
    filters: KpiDigestFiltersDto;

    @ApiPropertyOptional({
        description:
            'ID WebSocket-соединения — на него адресно придут события ' +
            'kpi-report:digest:done / :error. Без socketId работает поллинг ' +
            '(повторный POST до status ready).',
        type: String,
        example: 'H4tbA2vBQ1e6bBv-AAAB',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description:
            'Пересчитать день, игнорируя партиции и конверт в кэше; свежий ' +
            'результат перезапишет кэш. Рычаг повтора после status error.',
        type: Boolean,
        default: false,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

/** Сброс кэша дайджеста по домену (все дни или один день). */
export class KpiDigestCacheResetRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, чей кэш нужно сбросить.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Сбросить только партиции этого дня (YYYY-MM-DD); без даты — ' +
            'весь кэш дайджеста домена.',
        type: String,
        example: '2026-10-14',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {
        message: 'date: ожидается YYYY-MM-DD',
    })
    date?: string;
}

export class KpiDigestCacheResetResponseDto {
    @ApiProperty({ description: 'Удалено строк в БД app_cache.', example: 3 })
    deletedDb: number;

    @ApiProperty({ description: 'Удалено ключей в Redis.', example: 3 })
    deletedRedis: number;
}
