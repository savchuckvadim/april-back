import { Type } from 'class-transformer';
import {
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IBXPlacement,
    IBXPlacementOptions,
} from 'src/modules/bitrix/domain/interfaces/bitrix-placement.intreface';

export class PlacementOptionsDto implements IBXPlacementOptions {
    @ApiPropertyOptional({
        description: 'Идентификатор сущности, переданный встройкой Bitrix.',
        type: Number,
        example: 1024,
    })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    ID?: number;

    @ApiPropertyOptional({
        description:
            'Идентификатор задачи, в контексте которой открыта встройка.',
        type: Number,
        example: 777,
    })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    TASK_ID?: number;

    @ApiPropertyOptional({
        description: 'Идентификатор задачи (camelCase-вариант от встройки).',
        type: Number,
        example: 777,
    })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    taskId?: number;
}

export class PlacementDto implements IBXPlacement {
    @ApiProperty({
        description:
            'Код места встройки Bitrix (placement), из которого пришло событие.',
        type: String,
        example: 'CRM_DEAL_DETAIL_TAB',
    })
    @IsString()
    placement: string;

    @ApiPropertyOptional({
        description: 'Параметры контекста встройки (ID сущности, задачи).',
        type: PlacementOptionsDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementOptionsDto)
    options: PlacementOptionsDto;
}
