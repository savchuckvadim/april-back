import { IsArray, IsObject, ValidateNested, IsNumber } from 'class-validator';
import { IsBoolean } from 'class-validator';
import { IsString } from 'class-validator';
import {
    DocumentFieldBooleanSelect,
    DocumentFieldBooleanSelectNames,
    DocumentFieldDescriptionMode,
    DocumentFieldDescriptionNames,
    DocumentFieldViewMode,
    DocumentFieldViewNames,
    DocumentInfoblocksItems,
    DocumentInfoblocksItemsNames,
    DocumentInfoblocksOptionItem,
    DocumentInfoblocksOptionSelectItem,
    OfferSettings,
    SETTING_ITEM,
} from '../type/offer-settings.type';
import { Transform, Type } from 'class-transformer';

class DocumentInfoblocksOptionViewItemDto
    implements DocumentInfoblocksOptionItem
{
    @IsNumber()
    id: number;
    @IsString()
    value: DocumentFieldViewNames;
    @IsString()
    code: DocumentFieldViewMode;
}

class DocumentInfoblocksOptionDescriptionItemDto
    implements DocumentInfoblocksOptionItem
{
    @IsNumber()
    id: number;
    @IsString()
    value: DocumentFieldDescriptionNames;
    @IsString()
    code: DocumentFieldDescriptionMode;
}
class DocumentInfoblocksOptionBooleanItemDto
    implements DocumentInfoblocksOptionSelectItem
{
    @IsNumber()
    id: number;
    @IsString()
    value: DocumentFieldBooleanSelectNames;
    @IsString()
    code: DocumentFieldBooleanSelect;
}
class OfferSettingGeneralDto {
    @IsBoolean()
    isRemembed: boolean;
    @IsBoolean()
    isChanged: boolean;
    // previous: null | DocumentInfoblocksOptionItem
}
class OfferSettingStyleDto extends OfferSettingGeneralDto {
    @IsString()
    name: DocumentInfoblocksItemsNames.STYLE;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblocksOptionViewItemDto)
    items: DocumentInfoblocksOptionViewItemDto[];
    @ValidateNested()
    @Type(() => DocumentInfoblocksOptionViewItemDto)
    current: DocumentInfoblocksOptionViewItemDto;
    @IsString()
    type: DocumentInfoblocksItems.STYLE;
}
class OfferSettingDescriptionDto extends OfferSettingGeneralDto {
    @IsString()
    name: DocumentInfoblocksItemsNames.DESCRIPTION;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblocksOptionDescriptionItemDto)
    items: DocumentInfoblocksOptionDescriptionItemDto[];
    @ValidateNested()
    @Type(() => DocumentInfoblocksOptionDescriptionItemDto)
    current: DocumentInfoblocksOptionDescriptionItemDto;
    @IsString()
    type: DocumentInfoblocksItems.DESCRIPTION;
}

class OfferSettingSalePhraseDto extends OfferSettingGeneralDto {
    @Transform(({ value }) => (value === null ? '' : value))
    @IsString()
    value: string | null;
}

class OfferSettingWithStampDto extends OfferSettingGeneralDto {
    @IsString()
    name: DocumentInfoblocksItemsNames.WITH_STAMP;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    items: DocumentInfoblocksOptionBooleanItemDto[];
    @ValidateNested()
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    current: DocumentInfoblocksOptionBooleanItemDto;
    @IsString()
    type: DocumentInfoblocksItems.WITH_STAMP;
}
class OfferSettingWithManagerDto extends OfferSettingGeneralDto {
    @IsString()
    name: DocumentInfoblocksItemsNames.WITH_MANAGER;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    items: DocumentInfoblocksOptionBooleanItemDto[];
    @ValidateNested()
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    current: DocumentInfoblocksOptionBooleanItemDto;
    @IsString()
    type: DocumentInfoblocksItems.WITH_MANAGER;
}

class OfferSettingIsPriceFirstDto extends OfferSettingGeneralDto {
    @IsString()
    name: DocumentInfoblocksItemsNames.IS_PRICE_FIRST;
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    items: DocumentInfoblocksOptionBooleanItemDto[];
    @ValidateNested()
    @Type(() => DocumentInfoblocksOptionBooleanItemDto)
    current: DocumentInfoblocksOptionBooleanItemDto;
    @IsString()
    type: DocumentInfoblocksItems.IS_PRICE_FIRST;
}

export class OfferSettingSDto implements OfferSettings {
    @IsObject()
    @ValidateNested()
    @Type(() => OfferSettingStyleDto)
    [SETTING_ITEM.STYLE]: OfferSettingStyleDto;

    @IsObject()
    @ValidateNested()
    @Type(() => OfferSettingDescriptionDto)
    [SETTING_ITEM.DESCRIPTION]: OfferSettingDescriptionDto;

    @IsObject()
    @ValidateNested()
    @Type(() => OfferSettingSalePhraseDto)
    [SETTING_ITEM.SALE_PHRASE]: OfferSettingSalePhraseDto;

    @IsObject()
    @ValidateNested()
    @Type(() => OfferSettingWithStampDto)
    [SETTING_ITEM.WITH_STAMP]: OfferSettingWithStampDto;

    @IsObject()
    @ValidateNested()
    @Type(() => OfferSettingWithManagerDto)
    [SETTING_ITEM.WITH_MANAGER]: OfferSettingWithManagerDto;

    @IsObject()
    @ValidateNested()
    [SETTING_ITEM.IS_PRICE_FIRST]: OfferSettingIsPriceFirstDto;
}
