import { ApiProperty } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsString,
    Matches,
    Min,
} from 'class-validator';
import { ECallingGroup } from '@lib/portal-lib/pbx-domain/portal-calling';

/**
 * Тело запроса ручной привязки рабочей группы Bitrix к строке `callings`.
 * Принимает код группы звонков и bitrixId, записывает bitrixId в нужную строку PortalDB.
 */
export class SetCallingBitrixIdDto {
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
            'Код группы звонков (он же `group` строки `callings`): ' +
            'sales (ОП) / service (ОС) / tmc (ТМЦ).',
        enum: ECallingGroup,
        example: ECallingGroup.sales,
    })
    @IsEnum(ECallingGroup)
    group!: ECallingGroup;

    @ApiProperty({
        description: 'ID рабочей группы в Bitrix (sonet_group ID).',
        example: 42,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixId!: number;
}
