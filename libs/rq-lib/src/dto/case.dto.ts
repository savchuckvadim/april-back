import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

/** Какое поле реквизита склоняем: ФИО склоняется иначе, чем должность. */
export enum RqCaseKind {
    PERSON = 'person',
    WORD = 'word',
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
}

export class RqCaseResponseDto {
    @ApiProperty({
        description: 'Значение в родительном падеже',
        example: 'Генерального директора',
    })
    case: string;
}
