import { ApiProperty } from '@nestjs/swagger';
import { GetRegionResponseDto } from './get-region-response.dto';
import { IsBoolean } from 'class-validator';
import { RegionEntity } from '@/modules/garant';

export class GetPortalRegionResponseDto extends GetRegionResponseDto {
    constructor(region: RegionEntity, isChecked: boolean) {
        super(region);
        this.isChecked = isChecked;
    }
    @ApiProperty({
        description: 'Is checked',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    isChecked: boolean;
}
