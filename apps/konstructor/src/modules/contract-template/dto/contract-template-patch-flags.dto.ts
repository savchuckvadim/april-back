import { ApiProperty } from '@nestjs/swagger';
import { IsBooleanFlag } from './contract-template.boolean.transform';

/**
 * Тела точечных PATCH-ручек для флагов.
 *
 * Отдельные DTO, а не `UpdateContractTemplateDto`, потому что здесь флаг
 * ОБЯЗАТЕЛЕН: в общем update отсутствие поля означает «не менять», и
 * `PATCH /:id/active` с пустым телом молча не сделал бы ничего. У шаблонов
 * счёта такие DTO есть, но без описаний и примеров — без них поле не
 * попадает в OpenAPI внятно, и Orval-клиент админки генерирует ручку
 * наугад.
 */
export class ContractTemplateActiveDto {
    @ApiProperty({
        description:
            'Активен ли шаблон. Неактивные шаблоны не участвуют в подборе ' +
            'при генерации договора, но остаются видны в админке.',
        example: true,
    })
    @IsBooleanFlag()
    is_active: boolean;
}

export class ContractTemplateDefaultDto {
    @ApiProperty({
        description:
            'Шаблон по умолчанию в своей области: портал + поставщик + ' +
            'ТИП ДОГОВОРА. При установке флага он снимается у остальных ' +
            'шаблонов этой же области — но только того же типа договора.',
        example: true,
    })
    @IsBooleanFlag()
    is_default: boolean;
}
