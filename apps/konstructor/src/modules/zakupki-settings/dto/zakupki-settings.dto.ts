import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

/** Поле формы вымышленного поставщика (та же форма уходит в zakupki-offer как OtherProvidersDto). */
export class ZakupkiProviderFieldDto {
    @ApiProperty({ description: 'Порядковый номер поля', type: Number })
    id: number;

    @ApiProperty({ description: 'Подпись поля', type: String })
    name: string;

    @ApiProperty({ description: 'Подсказка в пустом поле', type: String })
    placeholder: string;

    @ApiProperty({
        description: 'Код поля: provider1_shortname, provider2_letter_text, …',
        type: String,
    })
    code: string;

    @ApiProperty({ description: 'Значение', type: String, nullable: true })
    value: string | null;

    @ApiProperty({
        description: 'Тип ввода',
        enum: ['string', 'text'],
        enumName: 'ZakupkiFieldType',
    })
    type: 'string' | 'text';

    @ApiProperty({ description: 'Обязательное для генерации', type: Boolean })
    isRequired: boolean;
}

export class ZakupkiProvidersFormDto {
    @ApiProperty({
        description: 'Поставщик 1',
        type: [ZakupkiProviderFieldDto],
    })
    provider1: ZakupkiProviderFieldDto[];

    @ApiProperty({
        description: 'Поставщик 2',
        type: [ZakupkiProviderFieldDto],
    })
    provider2: ZakupkiProviderFieldDto[];
}

/** Действующие настройки «3 КП» для пользователя на домене. */
export class ZakupkiSettingsDto {
    @ApiProperty({ type: Number })
    id: number;

    @ApiProperty({ type: String })
    domain: string;

    @ApiProperty({
        description: 'Чьи настройки (null — общие портала)',
        type: Number,
        nullable: true,
    })
    bxUserId: number | null;

    @ApiProperty({ type: String })
    name: string;

    @ApiProperty({
        description: 'Запись принадлежит запросившему пользователю',
        type: Boolean,
    })
    isFromUser: boolean;

    @ApiProperty({
        description: 'Запись — настройки портала по умолчанию',
        type: Boolean,
    })
    isDefault: boolean;

    @ApiProperty({
        description:
            'Запись только что создана дефолтом (на портале ничего не было)',
        type: Boolean,
    })
    isNew: boolean;

    @ApiProperty({ description: 'Три КП одним документом', type: Boolean })
    isOneDocument: boolean;

    @ApiProperty({ type: ZakupkiProvidersFormDto })
    providers: ZakupkiProvidersFormDto;
}

export class ZakupkiSettingsValueDto {
    @ApiProperty({ description: 'Код поля формы', type: String })
    @IsString()
    code: string;

    @ApiProperty({ description: 'Значение', type: String, nullable: true })
    @IsOptional()
    @IsString()
    value: string | null;
}

export class ZakupkiSettingsSaveDto {
    @ApiProperty({ type: String })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Пользователь Bitrix (для своих настроек)',
        type: Number,
    })
    @IsNumber()
    bxUserId: number;

    @ApiProperty({
        description: 'Название набора настроек',
        type: String,
        required: false,
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiProperty({
        description: 'Три КП одним документом',
        type: Boolean,
        required: false,
    })
    @IsOptional()
    @IsBoolean()
    isOneDocument?: boolean;

    @ApiProperty({
        description: 'Значения полей формы по кодам',
        type: [ZakupkiSettingsValueDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ZakupkiSettingsValueDto)
    values: ZakupkiSettingsValueDto[];
}

export class ZakupkiSettingsDeletedDto {
    @ApiProperty({
        description: 'Своя запись удалена; false — её не было или это дефолт',
        type: Boolean,
    })
    deleted: boolean;
}
