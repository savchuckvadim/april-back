import { ApiProperty } from '@nestjs/swagger';
import { PortalContactResponseDto } from './portal-contact-response.dto';
import { PbxFieldEntityDto } from '@lib/portal-lib/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalContactWithFieldsResponseDto {
    @ApiProperty({ type: PortalContactResponseDto })
    contact!: PortalContactResponseDto;

    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
