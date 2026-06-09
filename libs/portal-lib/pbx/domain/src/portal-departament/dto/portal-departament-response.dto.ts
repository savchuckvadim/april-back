import { ApiProperty } from '@nestjs/swagger';
import { EDepartamentGroup } from '../entity/portal-departament.entity';

/** Отдел портала (ответ API). */
export class PortalDepartamentResponseDto {
    @ApiProperty({ description: 'ID строки', example: 1, type: Number })
    id!: number;

    @ApiProperty({ description: 'ID портала', example: 1, type: Number })
    portalId!: number;

    @ApiProperty({ description: 'Тип', example: 'department', type: String })
    type!: string;

    @ApiProperty({
        description: 'Группа отдела',
        enum: EDepartamentGroup,
        example: EDepartamentGroup.sales,
    })
    group!: EDepartamentGroup;

    @ApiProperty({
        description: 'Системное имя',
        example: 'Отдел продаж',
        type: String,
    })
    name!: string;

    @ApiProperty({
        description: 'Заголовок',
        example: 'Отдел продаж',
        type: String,
    })
    title!: string;

    @ApiProperty({
        description: 'ID отдела в Bitrix',
        example: 5,
        type: Number,
    })
    bitrixId!: number;
}
