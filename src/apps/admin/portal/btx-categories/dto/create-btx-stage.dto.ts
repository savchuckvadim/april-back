import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean } from 'class-validator';

export class CreateBtxStageDto {
    @ApiProperty({
        description: 'Stage name',
        example: 'stage_name',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Stage title',
        example: 'Stage Title',
    })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({
        description: 'Stage code',
        example: 'stage_code',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Bitrix ID',
        example: 'DT134_1',
    })
    @IsString()
    @IsNotEmpty()
    bitrixId: string;

    @ApiProperty({
        description: 'Stage color',
        example: '#FF0000',
    })
    @IsString()
    @IsNotEmpty()
    color: string;

    @ApiProperty({
        description: 'Is active',
        example: true,
    })
    @IsBoolean()
    @IsNotEmpty()
    isActive: boolean;
}

