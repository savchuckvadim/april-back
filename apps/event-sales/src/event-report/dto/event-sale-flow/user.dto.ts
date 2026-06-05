import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IBXUser } from 'src/modules/bitrix/domain/interfaces/bitrix.interface';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

export class MinimalUserDto {
    @ApiProperty({
        description:
            'Идентификатор пользователя Bitrix. Минимальная форма пользователя — ' +
            'передаётся, когда нужен только ID (ответственный, автор плана).',
        type: Number,
        example: 81,
    })
    @IsNumeric()
    ID: number;
}

export class FullUserDto implements IBXUser {
    @ApiProperty({
        description: 'Идентификатор пользователя Bitrix.',
        type: Number,
        example: 81,
    })
    @IsNumeric()
    ID: number;

    @ApiProperty({
        description: 'Признак активности пользователя в портале.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    ACTIVE: boolean;

    @ApiProperty({
        description: 'Дата регистрации пользователя в портале (ISO 8601).',
        type: String,
        example: '2017-12-29T12:15:42+03:00',
    })
    @IsString()
    DATE_REGISTER: string;

    @ApiPropertyOptional({
        description: 'Email пользователя.',
        type: String,
        example: 'user@example.com',
    })
    @IsString()
    @IsOptional()
    EMAIL?: string;

    @ApiPropertyOptional({
        description:
            'Признак того, что пользователь сейчас онлайн (`Y` / `N`).',
        type: String,
        example: 'Y',
    })
    @IsString()
    @IsOptional()
    IS_ONLINE?: string;

    @ApiPropertyOptional({
        description: 'Дата последней активности пользователя (ISO 8601).',
        type: String,
        example: '2017-12-29T19:44:28+03:00',
    })
    @IsString()
    @IsOptional()
    LAST_ACTIVITY_DATE?: string;

    @ApiPropertyOptional({
        description: 'Дата последнего входа пользователя (ISO 8601).',
        type: String,
        example: '2017-12-29T19:44:28+03:00',
    })
    @IsString()
    @IsOptional()
    LAST_LOGIN?: string;

    @ApiProperty({
        description: 'Фамилия пользователя.',
        type: String,
        example: 'Иванов',
    })
    @IsString()
    LAST_NAME: string;

    @ApiProperty({
        description: 'Имя пользователя.',
        type: String,
        example: 'Иван',
    })
    @IsString()
    NAME: string;

    @ApiPropertyOptional({
        description: 'Дата рождения пользователя (ISO 8601).',
        type: String,
        example: '1990-05-01T00:00:00+03:00',
    })
    @IsString()
    @IsOptional()
    PERSONAL_BIRTHDAY?: string;

    @ApiPropertyOptional({
        description: 'Город пользователя.',
        type: String,
        example: 'Москва',
    })
    @IsString()
    @IsOptional()
    PERSONAL_CITY?: string;

    @ApiPropertyOptional({
        description: 'Пол пользователя (`M` / `F`).',
        type: String,
        example: 'M',
    })
    @IsString()
    @IsOptional()
    PERSONAL_GENDER?: string;

    @ApiPropertyOptional({
        description: 'Мобильный телефон пользователя.',
        type: String,
        example: '+79991234567',
    })
    @IsString()
    @IsOptional()
    PERSONAL_MOBILE?: string;

    @ApiPropertyOptional({
        description: 'Ссылка на фото пользователя.',
        type: String,
        example: 'https://portal.bitrix24.ru/upload/photo.jpg',
    })
    @IsString()
    @IsOptional()
    PERSONAL_PHOTO?: string;

    @ApiPropertyOptional({
        description: 'Персональный сайт пользователя.',
        type: String,
        example: 'https://example.com',
    })
    @IsString()
    @IsOptional()
    PERSONAL_WWW?: string;

    @ApiPropertyOptional({
        description: 'Отчество пользователя.',
        type: String,
        example: 'Иванович',
    })
    @IsString()
    @IsOptional()
    SECOND_NAME?: string;

    @ApiPropertyOptional({
        description: 'Метки времени изменения записи пользователя.',
        type: [String],
        example: ['2017-12-29T19:44:28+03:00'],
    })
    @IsString()
    @IsOptional()
    TIMESTAMP_X?: string[];

    @ApiProperty({
        description: 'Идентификаторы подразделений пользователя в портале.',
        type: [Number],
        example: [1, 5],
    })
    @IsArray()
    @IsNumber({}, { each: true })
    UF_DEPARTMENT: number[];
}

export type UserDto = MinimalUserDto | FullUserDto;
