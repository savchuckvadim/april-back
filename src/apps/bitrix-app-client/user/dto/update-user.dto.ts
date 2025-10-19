import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsDate, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto extends PartialType(CreateUserDto) {
    @ApiPropertyOptional({ description: 'User name', example: 'John' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'User surname', example: 'Doe' })
    @IsOptional()
    @IsString()
    surname?: string;

    @ApiPropertyOptional({ description: 'User password', example: 'newpassword123', minLength: 6 })
    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string;

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

    @ApiPropertyOptional({ description: 'Client ID', example: 1 })
    @IsOptional()
    @IsNumber()
    client_id?: number | undefined;
}
