import { ApiProperty } from '@nestjs/swagger';

/** Пресет реквизита портала (ответ API). */
export class PortalRqResponseDto {
    @ApiProperty({ description: 'ID строки', example: 1, type: Number })
    id!: number;

    @ApiProperty({ description: 'ID портала', example: 1, type: Number })
    portalId!: number;

    @ApiProperty({
        description: 'Бизнес-код (org/ip/fiz)',
        example: 'org',
        nullable: true,
    })
    code!: string | null;

    @ApiProperty({
        description: 'Название',
        example: 'Организация',
        nullable: true,
    })
    name!: string | null;

    @ApiProperty({
        description: 'Тип',
        example: 'organization',
        nullable: true,
    })
    type!: string | null;

    @ApiProperty({
        description: 'ID пресета в Bitrix',
        example: 1,
        nullable: true,
    })
    bitrixId!: number | null;

    @ApiProperty({
        description: 'XML_ID пресета',
        example: 'rq_preset_org',
        nullable: true,
    })
    xmlId!: string | null;

    @ApiProperty({ description: 'ENTITY_TYPE_ID', example: 8, nullable: true })
    entityTypeId!: number | null;

    @ApiProperty({ description: 'COUNTRY_ID', example: '1', nullable: true })
    countryId!: string | null;

    @ApiProperty({ description: 'Активен ли пресет', example: true })
    isActive!: boolean;

    @ApiProperty({
        description: 'Порядок сортировки',
        example: 100,
        nullable: true,
    })
    sort!: number | null;
}
