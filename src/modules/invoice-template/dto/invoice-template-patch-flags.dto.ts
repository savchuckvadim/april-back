import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class InvoiceTemplateActiveDto {
    @ApiProperty()
    @Type(() => Boolean)
    @IsBoolean()
    is_active: boolean;
}

export class InvoiceTemplateDefaultDto {
    @ApiProperty()
    @Type(() => Boolean)
    @IsBoolean()
    is_default: boolean;
}
