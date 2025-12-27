import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateBitrixFieldDto } from './create-bitrixfield.dto';

export class CreateBitrixFieldsBulkDto {
    @ApiProperty({
        description: 'Array of fields to create with their items',
        type: [CreateBitrixFieldDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateBitrixFieldDto)
    fields: CreateBitrixFieldDto[];
}

