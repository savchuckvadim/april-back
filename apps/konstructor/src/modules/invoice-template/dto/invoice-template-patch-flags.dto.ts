import { ApiProperty } from '@nestjs/swagger';
import { IsBooleanFlag } from '@lib/portal-lib/konstructor/document-template';

/**
 * Тела точечных PATCH-ручек для флагов шаблона счёта.
 *
 * `@IsBooleanFlag()` вместо `@Type(() => Boolean)`: последний вызывает
 * конструктор `Boolean(value)`, то есть проверку на truthy, и для непустой
 * строки всегда даёт `true` — а из multipart и query булевы значения
 * приходят именно строками. Из-за этого `PATCH /:id/active` с
 * `is_active='false'` ВКЛЮЧАЛ шаблон, и выключить его было нельзя.
 * Подробный разбор — в докблоке самого декоратора.
 */
export class InvoiceTemplateActiveDto {
    @ApiProperty({
        description:
            'Активен ли шаблон. Неактивные не участвуют в подборе при ' +
            'генерации счёта, но остаются видны в админке.',
        example: true,
    })
    @IsBooleanFlag()
    is_active: boolean;
}

export class InvoiceTemplateDefaultDto {
    @ApiProperty({
        description:
            'Шаблон по умолчанию в своей области (видимость + портал + ' +
            'поставщик). При установке флаг снимается у остальных шаблонов ' +
            'этой же области.',
        example: true,
    })
    @IsBooleanFlag()
    is_default: boolean;
}
