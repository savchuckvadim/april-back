import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { IsString } from 'class-validator';
import { IsNumber } from 'class-validator';
import { IsOptional } from 'class-validator';
import {
    IBXPlacement,
    IBXPlacementOptions,
} from 'src/modules/bitrix/domain/interfaces/bitrix-placement.intreface';

// export class PlacementDto implements IBXPlacement {
//     options: {
//         ID?: number;
//         taskId?: number;
//         TASK_ID?: number;
//     };
//     placement: string;
// }

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
