import { IsBoolean, IsDate, IsEmail, IsNotEmpty, IsNumber, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClientRegistrationRequestDto {
    @ApiProperty({ description: 'Client name', example: 'Acme Corp' })
    @IsNotEmpty()
    @IsString()
    name: string;

    @ApiProperty({ description: 'User name', example: 'John' })
    @IsNotEmpty()
    @IsString()
    userName: string;

    @ApiProperty({ description: 'User surname', example: 'Doe' })
    @IsNotEmpty()
    @IsString()
    userSurname: string;

    @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    password: string;
}


export class ClientDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Client name', example: 'Acme Corp' })
    @IsNotEmpty()
    @IsString()
    name: string;


    @ApiProperty({ description: 'Client email', example: 'john.doe@example.com' })
    @IsEmail()
    email: string;


    @ApiProperty({ description: 'Client is active', example: true })
    @IsNotEmpty()
    @IsBoolean()
    is_active: boolean;
    // @ApiProperty({ description: 'Client email verified at', example: '2024-01-01T00:00:00.000Z' })
    // @IsDate()
    // email_verified_at: Date;

    @ApiProperty({ description: 'Client created at', example: '2024-01-01T00:00:00.000Z' })
    @IsNotEmpty()
    @IsDate()
    created_at: Date;

    @ApiProperty({ description: 'Client updated at', example: '2024-01-01T00:00:00.000Z' })
    @IsNotEmpty()
    @IsDate()
    updated_at: Date;
}
