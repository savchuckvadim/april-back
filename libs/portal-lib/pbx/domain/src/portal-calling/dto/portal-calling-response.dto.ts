import { ApiProperty } from '@nestjs/swagger';
import { ECallingGroup } from '../entity/portal-calling.entity';

/** Группа звонков портала (ответ API). */
export class PortalCallingResponseDto {
    @ApiProperty({ description: 'ID строки', example: 1, type: Number })
    id!: number;

    @ApiProperty({ description: 'ID портала', example: 1, type: Number })
    portalId!: number;

    @ApiProperty({ description: 'Тип', example: 'calling', type: String })
    type!: string;

    @ApiProperty({
        description: 'Группа',
        enum: ECallingGroup,
        example: ECallingGroup.sales,
    })
    group!: ECallingGroup;

    @ApiProperty({
        description: 'Системное имя',
        example: 'ОП Звонки',
        type: String,
    })
    name!: string;

    @ApiProperty({
        description: 'Заголовок',
        example: 'ОП Звонки',
        type: String,
    })
    title!: string;

    @ApiProperty({
        description: 'ID рабочей группы в Bitrix',
        example: 42,
        type: Number,
    })
    bitrixId!: number;
}
