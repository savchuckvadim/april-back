import { ApiProperty } from '@nestjs/swagger';
import { PortalDealResponseDto } from './portal-deal-response.dto';
import { PbxFieldEntityDto } from '@/modules/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalDealWithFieldsResponseDto {
    @ApiProperty({ type: PortalDealResponseDto })
    deal!: PortalDealResponseDto;

    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
