import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

/**
 * Суперпользователь ВЕНДОРА (сотрудник April) на портале клиента.
 *
 * Не путать с настройками видимости портала (`visibility_*_user_ids`,
 * portal_app_settings): те про сотрудников КЛИЕНТА внутри его структуры
 * продаж, ими распоряжается владелец портала. Эти записи ведёт только
 * April — сотрудник сопровождения получает видимость all
 * (headOfSource = superuser), «Смотреть как…» и служебные ссылки.
 */
export class VendorSuperUserDto {
    @ApiProperty({ description: 'Идентификатор записи (uuid).' })
    id: string;

    @ApiProperty({ description: 'Портал, к которому привязан доступ.' })
    portalId: number;

    @ApiProperty({
        description:
            'Домен портала на момент записи (дубль для поиска без join).',
        example: 'example.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Bitrix-id сотрудника April на этом портале.',
        example: 123,
    })
    bitrixId: number;

    @ApiProperty({
        description: 'Кто это — для людей в админке.',
        nullable: true,
        example: 'Иванов, внедрение',
    })
    comment: string | null;

    @ApiProperty({
        description:
            'Доступ активен. false — запись сохранена, но прав не даёт ' +
            '(снять доступ, не теряя историю).',
    })
    isActive: boolean;
}

/** Заведение или правка доступа. Повторный bitrixId обновляет запись. */
export class VendorSuperUserSaveDto {
    @ApiProperty({
        description:
            'Bitrix-id сотрудника April на этом портале. Повторный id не ' +
            'создаёт дубль, а обновляет существующую запись.',
        example: 123,
    })
    @IsInt()
    @Min(1)
    bitrixId: number;

    @ApiPropertyOptional({
        description: 'Кто это — для людей в админке.',
        example: 'Иванов, внедрение',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    comment?: string | null;

    @ApiPropertyOptional({
        description: 'Доступ активен. По умолчанию true.',
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
