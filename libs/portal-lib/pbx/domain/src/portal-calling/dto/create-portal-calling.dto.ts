import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ECallingGroup } from '../entity/portal-calling.entity';

/**
 * Данные для создания группы звонков (`callings`).
 * Уникальность строки — по сочетанию type + group + portalId.
 */
export class CreatePortalCallingDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsInt()
    @Min(1)
    portalId!: number;

    @ApiProperty({
        description: 'Группа: ОП (sales) / ОС (service) / ТМЦ (tmc)',
        enum: ECallingGroup,
        example: ECallingGroup.sales,
    })
    @IsEnum(ECallingGroup)
    group!: ECallingGroup;

    @ApiProperty({
        description: 'Системное имя группы звонков в Bitrix',
        example: 'ОП Звонки',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Заголовок группы звонков',
        example: 'ОП Звонки',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title!: string;

    @ApiProperty({
        description: 'ID рабочей группы в Bitrix (sonet_group ID)',
        example: 42,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixId!: number;
}
