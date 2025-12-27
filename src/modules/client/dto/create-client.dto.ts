import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateClientDto {
    @ApiProperty({
        description: 'Client name',
        example: 'Acme Corp',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

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
        default: true,
    })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;
}

