import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsUUID } from 'class-validator';

export class InvoiceTemplateIdParamsDto {
    @ApiProperty({ format: 'uuid' })
    @IsUUID('4')
    id: string;
}

export class InvoiceTemplatePortalParamsDto {
    @ApiProperty()
    @IsNumberString()
    portal_id: string;
}
