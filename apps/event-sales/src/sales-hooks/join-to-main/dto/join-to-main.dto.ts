import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** К чему присоединяем: к конкретной основной сделке либо к компании клиента. */
export const JOIN_TO_MAIN_TARGET_TYPES = ['deal', 'company'] as const;
export type JoinToMainTargetType = (typeof JOIN_TO_MAIN_TARGET_TYPES)[number];

/**
 * Query-параметры вебхука робота «присоединить к основной». Параметры в
 * query (тело занято BxWebHookDto с auth портала) — как у остальных хуков.
 * Нужен `dealId` и ровно одна цель: `mainDealId` либо `companyId`.
 */
export class JoinToMainWebhookQueryDto {
    @ApiProperty({
        description:
            'Сделка-дубль (обычно новая сделка из заявки), которую ' +
            'присоединяем к работе клиента.',
        example: 87955,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiPropertyOptional({
        description:
            'Основная сделка клиента, в которую переходит работа. Либо ' +
            'она, либо companyId.',
        example: 42423,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    mainDealId?: number;

    @ApiPropertyOptional({
        description:
            'Компания клиента: основной считается её самая старая открытая ' +
            'сделка ОП. Открытой нет — сделка-дубль остаётся основной и ' +
            'получает эту компанию.',
        example: 91429,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Закрыть сделку-дубль стадией «Дубль» после присоединения. ' +
            'N — оставить открытой. По умолчанию Y.',
        example: 'Y',
        type: String,
        enum: ['Y', 'N'],
        default: 'Y',
    })
    @IsOptional()
    @IsString()
    @IsIn(['Y', 'N'])
    closeAsDuplicate?: 'Y' | 'N';
}

/** Тело кнопки фрейма «Присоединить сюда» (только руководитель). */
export class JoinToMainRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description: 'Сделка-дубль, которую присоединяем.',
        example: 87955,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiProperty({
        description:
            'Тип цели: deal — конкретная основная сделка, company — ' +
            'компания клиента (основная = её самая старая открытая сделка ОП).',
        example: 'deal',
        type: String,
        enum: JOIN_TO_MAIN_TARGET_TYPES,
    })
    @IsString()
    @IsIn(JOIN_TO_MAIN_TARGET_TYPES as unknown as string[])
    targetType: JoinToMainTargetType;

    @ApiProperty({
        description: 'Идентификатор цели (сделки или компании).',
        example: 42423,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    targetId: number;

    @ApiPropertyOptional({
        description: 'Закрыть сделку-дубль стадией «Дубль». По умолчанию true.',
        example: true,
        type: Boolean,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    closeAsDuplicate?: boolean;
}

/** Элемент пачки — внутренний контракт между транспортом и use-case. */
export interface IJoinToMainItem {
    dealId: number;
    targetType: JoinToMainTargetType;
    targetId: number;
    closeAsDuplicate: boolean;
}

/** Сборка элемента с дефолтами. */
export function buildJoinToMainItem(input: {
    dealId: number;
    targetType: JoinToMainTargetType;
    targetId: number;
    closeAsDuplicate?: boolean;
}): IJoinToMainItem {
    return {
        dealId: input.dealId,
        targetType: input.targetType,
        targetId: input.targetId,
        closeAsDuplicate: input.closeAsDuplicate ?? true,
    };
}
