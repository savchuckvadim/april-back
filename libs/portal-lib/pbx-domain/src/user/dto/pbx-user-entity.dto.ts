import { IsArray, IsString, ValidateNested } from 'class-validator';
import { PbxFieldEntityDto } from '../../field';
import { PbxUserEntity } from '../entity/pbx-user.entity';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PbxUserEntityDto {
    constructor(user: PbxUserEntity) {
        this.id = user.id;
        this.code = user.code;
        this.createdAt = user.createdAt;
        this.updatedAt = user.updatedAt;
        this.fields = user.fields.map(field => new PbxFieldEntityDto(field));
    }
    @ApiProperty({
        description: 'User ID',
        example: '1',
        type: String,
    })
    @IsString()
    id: string;
    @ApiProperty({
        description: 'User code',
        example: '123',
        type: String,
    })
    @IsString()
    code: string;
    @ApiProperty({
        description: 'User created at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    @IsString()
    createdAt: string;
    @ApiProperty({
        description: 'User updated at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    @IsString()
    updatedAt: string;
    @ApiProperty({
        description: 'User fields',
        type: [PbxFieldEntityDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PbxFieldEntityDto)
    fields: PbxFieldEntityDto[];
}
