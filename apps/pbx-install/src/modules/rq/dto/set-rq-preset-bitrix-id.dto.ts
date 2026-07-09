import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsString,
    Matches,
    Min,
} from 'class-validator';
import { ERqPresetCode } from '@lib/portal-lib/pbx-domain/portal-rq';

/**
 * Тело запроса ручной привязки существующего пресета реквизита Bitrix
 * к строке `bx_rqs` по бизнес-коду. В Bitrix ничего не создаётся и не меняется.
 */
export class SetRqPresetBitrixIdDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала. Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain!: string;

    @ApiProperty({
        description:
            'Бизнес-код пресета (ключ строки `bx_rqs`): ' +
            'preset_org / preset_ip / preset_fiz.',
        enum: ERqPresetCode,
        example: ERqPresetCode.ORG,
    })
    @IsEnum(ERqPresetCode)
    code!: ERqPresetCode;

    @ApiProperty({
        description:
            'ID существующего пресета реквизита в Bitrix (`crm.requisite.preset.*`).',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixId!: number;
}
