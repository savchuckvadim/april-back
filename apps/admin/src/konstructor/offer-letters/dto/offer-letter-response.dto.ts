import { ApiProperty } from '@nestjs/swagger';

export class OfferLetterResponseDto {
    @ApiProperty({ description: 'Идентификатор письма (uuid).', type: String })
    id: string;

    @ApiProperty({
        description: 'Портал, которому принадлежит письмо.',
        type: Number,
    })
    portalId: number;

    @ApiProperty({
        description:
            'Менеджер (Bitrix-id), чьё это личное письмо. null — письмо портала.',
        type: Number,
        nullable: true,
    })
    bxUserId: number | null;

    @ApiProperty({ description: 'Название письма.', type: String })
    name: string;

    @ApiProperty({
        description:
            'Текст письма с разметкой `<color>`, `<bold>`, `<red>`; абзацы — перевод строки.',
        type: String,
    })
    text: string;

    @ApiProperty({
        description:
            'Письмо по умолчанию своей области (портала или менеджера). В области оно одно.',
        type: Boolean,
    })
    isDefault: boolean;

    @ApiProperty({ description: 'Активно ли письмо.', type: Boolean })
    isActive: boolean;

    @ApiProperty({
        description: 'Порядок в списке: меньше — выше.',
        type: Number,
    })
    sort: number;

    @ApiProperty({
        description: 'Когда создано.',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    createdAt: string | null;

    @ApiProperty({
        description: 'Когда менялось в последний раз.',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    updatedAt: string | null;
}

export class OfferLetterDeletedDto {
    @ApiProperty({
        description: 'Идентификатор удалённого письма.',
        type: String,
    })
    id: string;
}
