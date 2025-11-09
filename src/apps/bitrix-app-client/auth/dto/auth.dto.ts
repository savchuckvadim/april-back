import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsNumber, IsObject, IsString, IsStrongPassword, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Client } from "generated/prisma";
import { UserResponseDto } from "../../user/dto/user-response.dto";
import { Type } from "class-transformer";
import { ClientDto } from "../../client/dto/client-registration.dto";

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
    @IsNotEmpty()
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
    @IsNotEmpty({ message: 'Пароль обязательно для заполнения' })
    @IsString({ message: 'Пароль должен быть строкой' })
    @MinLength(6, { message: 'Пароль должен быть не менее 6 символов' })
    @MaxLength(100, { message: 'Пароль должен быть не более 100 символов' })
    @IsStrongPassword({
        minLength: 6,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
    }, { message: 'Пароль должен содержать хотя бы одну большую букву, одну маленькую букву, одну цифру и один специальный символ' })
    password: string;


    @ApiProperty({ description: 'Domain', example: 'example.com' })
    @IsNotEmpty()
    @IsString()
    domain: string;
}

export class LoginDto {
    @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
    @IsNotEmpty()
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'User password', example: 'password123', minLength: 6 })
    @IsNotEmpty()
    @IsString()
    @MinLength(6)
    @IsString()
    password: string;




    @ApiProperty({ description: 'Domain', example: 'example.bitrix24.com' })
    @IsNotEmpty()
    @IsString()
    domain: string;
}
export class LoginResponseCookieDto {
    @ApiProperty({ description: 'Token', example: 'token123' })
    @IsNotEmpty()
    @IsString()
    token: string;

    @ApiProperty({ description: 'User', example: 'User' })
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => UserResponseDto)
    user: UserResponseDto;

    @ApiProperty({ description: 'Client', example: 'Client' })
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => ClientDto)
    client: ClientDto;
}

export class MeResponseDto {


    @ApiProperty({ description: 'User', example: 'User' })
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => UserResponseDto)
    user: UserResponseDto;

    @ApiProperty({ description: 'Client', example: 'Client' })
    @IsNotEmpty()
    @IsObject()
    @ValidateNested()
    @Type(() => ClientDto)
    client: ClientDto;



}

export class LoginResponseDto extends MeResponseDto {


    // @ApiProperty({ description: 'User', example: 'User' })
    // @IsNotEmpty()
    // @IsObject()
    // @ValidateNested()
    // @Type(() => UserResponseDto)
    // user: UserResponseDto;

    // @ApiProperty({ description: 'Client', example: 'Client' })
    // @IsNotEmpty()
    // @IsObject()
    // @ValidateNested()
    // @Type(() => ClientDto)
    // client: ClientDto;


    @ApiProperty({ description: 'Token', example: 'token123' })
    @IsNotEmpty()
    @IsString()
    token: string;
}
export class ClientResponseDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Message', example: 'Client registered, please confirm email' })
    @IsNotEmpty()
    @IsString()
    message: string;

    @ApiProperty({ description: 'Client', example: 'Client' })

    @IsObject()
    @ValidateNested()
    @Type(() => ClientDto)
    client: ClientDto;

    @ApiProperty({ description: 'Owner', example: 'Owner', type: UserResponseDto })

    @IsObject()
    @ValidateNested()
    @Type(() => UserResponseDto)

    owner: UserResponseDto | null;
}

export class LogoutResponseDto {
    @ApiProperty({ description: 'Message', example: 'Logged out' })
    @IsNotEmpty()
    @IsString()
    message: string;
}

export class GetAllClientsUsersDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    clientId: number;
}
