import { ApiProperty } from '@nestjs/swagger';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalLeadFieldsListResponseDto {
    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
