import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { RpaNameEnum } from './install-rpa.dto';

const DOMAIN_DESCRIPTION =
    'Домен Bitrix-портала (без протокола) либо `all` — применить ко всем порталам.';
const RPA_NAME_DESCRIPTION =
    'Имя RPA (совпадает с `btx_rpas.code` и URL установки).';

export class DeleteRpaCategoryStageDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: RPA_NAME_DESCRIPTION,
        example: RpaNameEnum.SUPPLY,
        enum: RpaNameEnum,
    })
    @IsEnum(RpaNameEnum)
    @IsNotEmpty()
    rpaName: RpaNameEnum;

    @ApiProperty({ description: 'Код стадии', example: 'rpa_supply_new' })
    @IsString()
    @IsNotEmpty()
    stageCode: string;
}

export class EditRpaCategoryStageDto {
    @ApiProperty({
        description: DOMAIN_DESCRIPTION,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description: RPA_NAME_DESCRIPTION,
        example: RpaNameEnum.SUPPLY,
        enum: RpaNameEnum,
    })
    @IsEnum(RpaNameEnum)
    @IsNotEmpty()
    rpaName: RpaNameEnum;

    @ApiProperty({ description: 'Код стадии', example: 'rpa_supply_new' })
    @IsString()
    @IsNotEmpty()
    stageCode: string;

    @ApiProperty({ description: 'Новое название стадии', example: 'Старт' })
    @IsString()
    @IsNotEmpty()
    newValue: string;
}
