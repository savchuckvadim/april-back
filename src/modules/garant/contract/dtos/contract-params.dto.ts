import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class ContractIdParamsDto {
    @ApiProperty({ description: 'The contract id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}

export class ContractPortalIdParamsDto {
    @ApiProperty({ description: 'The portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    portalId: number;
}
