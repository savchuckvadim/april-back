import { ApiProperty } from '@nestjs/swagger';
import { PbxFieldEntityDto } from '@/modules/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalDealFieldsListResponseDto {
    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
