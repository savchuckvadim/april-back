import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { INN_MANUAL_ENTITIES, InnManualEntity } from '@lib/portal-lib/pbx-inn';

/** Текущие реквизиты клиента сменились: записать ИНН и пополнить пул. */
export class KonstructorInnSetDto {
    @ApiProperty({
        description: 'Домен портала Битрикс.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ИНН: 10 знаков у юрлица, 12 у ИП и физлица. Проверяется ' +
            'контрольной суммой, пробелы и дефисы отбрасываются.',
        type: String,
        example: '7707083893',
    })
    @IsString()
    @IsNotEmpty()
    inn: string;

    @ApiPropertyOptional({
        description:
            'Сделка, из которой открыт конструктор. Открытая сделка получает ' +
            'ИНН в поле «ИНН» (`op_inn`) и в пул вариантов (`op_inn_pool`), ' +
            'следом компания и пустые заявки; в ленте сделки остаётся запись ' +
            '«выбран вручную». Закрытая сделка не меняется.',
        type: Number,
        example: 105819,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    dealId?: number;

    @ApiPropertyOptional({
        description:
            'Компания клиента. Пишется, когда открытой сделки нет: текущий ' +
            'ИНН поверх прежнего, пул объединением без дублей.',
        type: Number,
        example: 180875,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Заявка (лид). Пишется, когда нет ни открытой сделки, ни ' +
            'компании.',
        type: Number,
        example: 348487,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description:
            'Id сотрудника Битрикса, который указал ИНН: по нему бэк берёт ' +
            'имя для записи в ленте сделки «кто выбрал».',
        type: Number,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;
}

/** Куда лёг ИНН. */
export class KonstructorInnSetResponseDto {
    @ApiProperty({
        description: 'Записанный ИНН (только цифры).',
        type: String,
        example: '7707083893',
    })
    inn: string;

    @ApiProperty({
        description:
            'Куда записан: `deal` — сделка (и вслед за ней компания и пустые ' +
            'заявки), `company` — только компания, `lead` — только заявка.',
        enum: INN_MANUAL_ENTITIES,
        example: 'deal',
    })
    entity: InnManualEntity;

    @ApiProperty({
        description:
            'Что записать не удалось (компания, заявка, лента): основная ' +
            'запись при этом состоялась.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
