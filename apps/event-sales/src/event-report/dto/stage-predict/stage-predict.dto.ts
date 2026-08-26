import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
} from '../../types/report-types';

/**
 * Предикт смены стадии основной воронки (sales_base) ДО отправки отчёта.
 *
 * Лестница стадий живёт только на бэке (getSalesBaseTargetStageCode);
 * фронтовый дубль уже расходился с реальностью. Предикт — UX-хинт: по нему
 * фронт решает, какие стадийные чек-листы («Клиент на решении», «Продажа»)
 * показать перед отправкой. Реальный прогон пересчитает стадию сам.
 */
export class StagePredictContextDto {
    @ApiPropertyOptional({ description: 'Компания контекста.', type: Number })
    @IsOptional()
    @IsNumber()
    companyId?: number;

    @ApiPropertyOptional({
        description: 'Сделка плейсмента — в приоритете при выборе базовой.',
        type: Number,
    })
    @IsOptional()
    @IsNumber()
    dealId?: number;

    @ApiPropertyOptional({ description: 'Лид контекста.', type: Number })
    @IsOptional()
    @IsNumber()
    leadId?: number;

    @ApiPropertyOptional({
        description:
            'Ответственный отчёта (текущий юзер фрейма). Правило владельца ' +
            '(25.08): чужие открытые сделки автоматически не подхватываются — ' +
            'предикт, как и реальный flow, ищет базовую только среди сделок ' +
            'этого сотрудника (сделка плейсмента вне правила). Не передан — ' +
            'фильтр не применяется (легаси-фронт).',
        type: Number,
    })
    @IsOptional()
    @IsNumber()
    responsibleId?: number;
}

export class StagePredictRequestDto {
    @ApiProperty({ description: 'Домен портала Bitrix.', type: String })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Контекст владельца (company/deal/lead).',
        type: StagePredictContextDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => StagePredictContextDto)
    context: StagePredictContextDto;

    @ApiPropertyOptional({
        description: 'Код типа ПЛАНИРУЕМОГО события (warm/hot/moneyAwait/…).',
        type: String,
    })
    @IsOptional()
    @IsString()
    planEventType?: string;

    @ApiPropertyOptional({
        description: 'Код типа ОТЧЁТНОГО события (тип текущего дела).',
        type: String,
    })
    @IsOptional()
    @IsString()
    reportEventType?: string;

    @ApiPropertyOptional({
        description: 'Результативность отчёта.',
        enum: EnumEventItemResultType,
    })
    @IsOptional()
    @IsEnum(EnumEventItemResultType)
    resultStatus?: EnumEventItemResultType;

    @ApiProperty({
        description:
            'Статус работы. «Не ЦА» фронт шлёт как fail + isNotCa=true — ' +
            'тем же алфавитом, что и flow.',
        enum: EnumWorkStatusCode,
    })
    @IsEnum(EnumWorkStatusCode)
    workStatusCode: EnumWorkStatusCode;

    @ApiPropertyOptional({
        description: 'Клиент нецелевой: отказ уводит в стадию «Не ЦА».',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isNotCa?: boolean;

    @ApiPropertyOptional({
        description: 'Отмечена незапланированная презентация.',
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    isUnplannedPresentation?: boolean;
}

export class StagePredictResponseDto {
    @ApiProperty({
        description: 'Базовая сделка, которую двинет отправка; null — нет.',
        type: Number,
        nullable: true,
    })
    baseDealId: number | null;

    @ApiProperty({
        description:
            'Код текущей стадии базовой сделки (sales_*); null — сделки нет.',
        type: String,
        nullable: true,
    })
    currentStageCode: string | null;

    @ApiProperty({
        description:
            'Код целевой стадии (sales_*); null — воронка не настроена или ' +
            'контекст lead-only (сделки не двигаются).',
        type: String,
        nullable: true,
    })
    targetStageCode: string | null;

    @ApiProperty({
        description: 'STAGE_ID целевой стадии в нотации Bitrix (C{n}:XXX).',
        type: String,
        nullable: true,
    })
    targetStageBitrixId: string | null;

    @ApiProperty({
        description: 'Отправка сменит стадию (или создаст сделку в целевой).',
        type: Boolean,
    })
    willChange: boolean;
}
