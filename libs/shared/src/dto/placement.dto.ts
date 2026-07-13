import { Type } from 'class-transformer';
import {
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import {
    IBXPlacement,
    IBXPlacementOptions,
} from '@lib/bitrix/domain/interfaces/bitrix-placement.intreface';

/**
 * Общие DTO встройки (placement) Bitrix24 — параметры, с которыми портал
 * открывает приложение (event-sales, konstructor).
 */
export class PlacementOptionsDto implements IBXPlacementOptions {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    ID?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    TASK_ID?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    taskId?: number;
}

export class PlacementDto implements IBXPlacement {
    @IsString()
    placement: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementOptionsDto)
    options: PlacementOptionsDto;
}
