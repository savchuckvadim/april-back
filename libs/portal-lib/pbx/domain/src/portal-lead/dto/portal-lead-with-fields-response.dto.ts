import { ApiProperty } from '@nestjs/swagger';
import { PortalLeadResponseDto } from './portal-lead-response.dto';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalLeadWithFieldsResponseDto {
    @ApiProperty({ type: PortalLeadResponseDto })
    lead!: PortalLeadResponseDto;

    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
