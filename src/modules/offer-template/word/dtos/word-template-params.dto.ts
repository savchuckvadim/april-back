import { IsString, IsNumberString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WordTemplateIdParamsDto {
    @ApiProperty({ description: 'Word template ID' })
    @IsString()
    id: string;
}

export class WordTemplatePortalIdParamsDto {
    @ApiProperty({ description: 'Portal ID' })
    @IsNumberString()
    portal_id: string;
}

export class WordTemplateUserPortalParamsDto {
    @ApiProperty({ description: 'User ID' })
    @IsNumberString()
    user_id: string;

    @ApiProperty({ description: 'Portal ID' })
    @IsNumberString()
    portal_id: string;
}

