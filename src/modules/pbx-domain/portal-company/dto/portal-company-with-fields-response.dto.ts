import { ApiProperty } from '@nestjs/swagger';
import { PortalCompanyResponseDto } from './portal-company-response.dto';
import { PbxFieldEntityDto } from '@/modules/pbx-domain/field/dto/pbx-field.enity.dto';

export class PortalCompanyWithFieldsResponseDto {
    @ApiProperty({ type: PortalCompanyResponseDto })
    company!: PortalCompanyResponseDto;

    @ApiProperty({ type: [PbxFieldEntityDto] })
    fields!: PbxFieldEntityDto[];
}
