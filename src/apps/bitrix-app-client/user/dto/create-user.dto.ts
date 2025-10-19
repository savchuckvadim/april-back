import { IsDate, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
    @ApiProperty({ description: 'User name', example: 'John' })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ description: 'User surname', example: 'Doe' })
    @IsNotEmpty()
    @IsString()
    surname: string;

    @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    client_id: number;

    @ApiPropertyOptional({ description: 'User photo URL', example: 'https://example.com/photo.jpg' })
    @IsOptional()
    @IsString()
    photo?: string;

    @ApiPropertyOptional({ description: 'Bitrix user ID', example: '12345' })
    @IsOptional()
    @IsString()
    bitrix_id?: string;

    @ApiPropertyOptional({ description: 'Role ID', example: 1 })
    @IsOptional()
    @IsNumber()
    role_id?: number | undefined;

    @ApiPropertyOptional({ description: 'Email verified at', example: '2024-01-01T00:00:00.000Z' })
    @IsOptional()
    @IsDate()
    email_verified_at?: Date;
}
