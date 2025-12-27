import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsBoolean } from 'class-validator';

export class UpdateClientDto {
    @ApiPropertyOptional({
        description: 'Client name',
        example: 'Acme Corp',
    })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({
        description: 'Client email',
        example: 'contact@acme.com',
    })
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiPropertyOptional({
        description: 'Client status',
        example: 'active',
    })
    @IsString()
    @IsOptional()
    status?: string;

    @ApiPropertyOptional({
        description: 'Client is active',
        example: true,
    })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}

