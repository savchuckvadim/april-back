import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { INN_MANUAL_ENTITIES, InnManualEntity } from '@lib/portal-lib/pbx-inn';

/** ИНН, введённый руками в шапке «Звонков». */
export class SetInnRequestDto {
    @ApiProperty({
        description: 'Домен портала Битрикс.',
        type: String,
        example: 'garantservisvoronezh.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'ИНН: 10 знаков у юрлица, 12 у ИП и физлица. Проверяется ' +
            'контрольной суммой.',
        type: String,
        example: '7707083893',
    })
    @IsString()
    @IsNotEmpty()
    inn: string;

    @ApiPropertyOptional({
        description:
            'Сделка, открытая во фрейме. Открытая сделка получает ИНН как при ' +
            '«Выбрать» во вкладке «ИНН»: сделка, пул, компания, пустые заявки ' +
            'и запись в ленте. Закрытая не меняется.',
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
            'ИНН поверх прежнего, пул объединением.',
        type: Number,
        example: 180875,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    companyId?: number;

    @ApiPropertyOptional({
        description:
            'Заявка (лид), открытая во фрейме. Пишется, когда нет ни открытой ' +
            'сделки, ни компании.',
        type: Number,
        example: 348487,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    leadId?: number;

    @ApiPropertyOptional({
        description:
            'Id сотрудника Битрикса, который указал ИНН, — для записи в ленте ' +
            'сделки «кто выбрал».',
        type: Number,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;
}

/** Куда лёг ИНН из шапки. */
export class InnSetResponseDto {
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
            'Что записать не удалось (компания, заявка, лента) — основная ' +
            'запись при этом состоялась.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
