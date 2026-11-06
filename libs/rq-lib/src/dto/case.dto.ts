import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** Какое поле реквизита склоняем: ФИО склоняется иначе, чем должность. */
export enum RqCaseKind {
    PERSON = 'person',
    WORD = 'word',
}

/** Падеж: родительный — реквизиты и договор («в лице»), дательный — адресат КП («Кому»). */
export enum RqGrammaticalCase {
    GENITIVE = 'genitive',
    DATIVE = 'dative',
}

export class RqCaseRequestDto {
    @ApiProperty({
        description: 'Значение в именительном падеже',
        example: 'Генеральный директор',
    })
    @IsString()
    value: string;

    @ApiProperty({
        description:
            'person — ФИО (фамилия имя отчество), word — должность/основание. По умолчанию word',
        enum: RqCaseKind,
        required: false,
    })
    @IsOptional()
    @IsEnum(RqCaseKind)
    kind?: RqCaseKind;

    @ApiProperty({
        description:
            'Падеж: genitive (по умолчанию) — «Генерального директора», dative — «Генеральному директору»',
        enum: RqGrammaticalCase,
        enumName: 'RqGrammaticalCase',
        required: false,
    })
    @IsOptional()
    @IsEnum(RqGrammaticalCase)
    grammaticalCase?: RqGrammaticalCase;
}

export class RqCaseResponseDto {
    @ApiProperty({
        description: 'Значение в запрошенном падеже (по умолчанию родительном)',
        example: 'Генерального директора',
    })
    case: string;
}
