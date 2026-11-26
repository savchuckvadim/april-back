import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    Min,
    ValidateNested,
} from 'class-validator';

/**
 * Документ в продолжение презентации: блок из запроса переходит в событие
 * потока продаж без изменений.
 */
export class SalesDocumentPresentationDto {
    @ApiPropertyOptional({
        type: Number,
        example: 1234,
        description:
            'Сделка презентации, которую выбрал менеджер. Пусто: поток продаж берёт последнюю презентацию основной сделки',
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    dealId?: number;
}

/** Значение поля из исходного тела запроса, без неявного приведения типов. */
const rawValue = ({
    obj,
    key,
}: {
    obj: Record<string, unknown>;
    key: string;
}): unknown => obj[key];

/**
 * Признак `salesFlow` для DTO документов: КП, договор, запуск поставки.
 * Единственный выключатель постановки события в поток продаж: легаси-фронт
 * сообщает о документах старым хуком, поэтому без признака бэк ничего не
 * ставит. Значение читается из тела как есть: строка «false» не превращается
 * в true и не проходит проверку.
 */
export const SalesFlowProperty = (): PropertyDecorator =>
    applyDecorators(
        ApiPropertyOptional({
            type: Boolean,
            example: true,
            description:
                'Сообщить о документе в поток продаж: стадия основной сделки, KPI и список «История». Новый фронт передаёт true для отдела продаж. Без поля или с false документ формируется как раньше и в поток продаж ничего не уходит. Сбой постановки события документ не отменяет',
        }),
        IsOptional(),
        Transform(rawValue),
        IsBoolean(),
    );

/**
 * Блок `presentation` для DTO КП. Передан (даже пустой объект): КП и счёт
 * считаются документами «после презентации». Действует вместе с `salesFlow: true`.
 */
export const SalesPresentationProperty = (): PropertyDecorator =>
    applyDecorators(
        ApiPropertyOptional({
            type: SalesDocumentPresentationDto,
            description:
                'Документ в продолжение презентации. Блок передан: поток продаж считает документ «после презентации» и пишет счётчики и товарные строки ещё и в сделку презентации. Пустой объект: поток продаж сам берёт последнюю презентацию основной сделки. Действует вместе с salesFlow: true',
        }),
        IsOptional(),
        ValidateNested(),
        Type(() => SalesDocumentPresentationDto),
    );
