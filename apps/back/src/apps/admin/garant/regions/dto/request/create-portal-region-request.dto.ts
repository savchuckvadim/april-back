import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class CreatePortalRegionDtoAdminRequest {
    @ApiProperty({
        description: 'ID of the Bitrix24 portal',
        example: 1,
        required: true,
    })
    @IsNumber()
    portalId: number;

    @ApiProperty({
        description: 'ID of the region',
        example: 1,
        required: true,
    })
    @IsNumber()
    regionId: number;
}
