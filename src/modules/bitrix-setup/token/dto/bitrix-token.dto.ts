import { IsString, IsOptional, IsDateString, IsEnum, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BITRIX_APP_CODES } from 'src/modules/bitrix-setup/app/enums/bitrix-app.enum';


export class GetBitrixTokenDto {
    @ApiProperty({
        description: 'Domain',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    domain: string;


    @ApiProperty({
        description: 'Code',
        example: BITRIX_APP_CODES.SALES,
        enum: BITRIX_APP_CODES,
    })
    @IsEnum(BITRIX_APP_CODES)
    code: BITRIX_APP_CODES;
}


export class BitrixTokenDto {
    @ApiProperty({
        description: 'Access token',
        example: '1234567890',
        type: String,
    })
    @IsString()
    access_token: string;

    @ApiProperty({
        description: 'Refresh token',
        example: '1234567890',
        type: String,
    })
    @IsString()
    refresh_token: string;

    @ApiProperty({
        description: 'Expires at',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
    })
    @IsDateString()
    expires_at: string;

    @ApiProperty({
        description: 'Application token',
        example: '1234567890',
        type: String,
    })
    @IsString()
    application_token: string;

    @ApiProperty({
        description: 'Member id',
        example: '1234567890',
        type: String,
    })
    @IsString()
    member_id: string;
}

export class CreateBitrixTokenDto extends GetBitrixTokenDto {


    @ApiProperty({
        description: 'Token',
        type: BitrixTokenDto,
    })
    @Type(() => BitrixTokenDto)
    token: BitrixTokenDto;
}





export class SetBitrixSecretDto {

    // @ApiProperty({
    //     description: 'App id',
    //     example: 1,
    //     type: Number,
    // })
    // @IsNumber()
    // appId: bigint;

    @ApiProperty({
        description: 'Client id',
        example: '1234567890',
        type: String,
    })
    @IsString()
    clientId: string;

    @ApiProperty({
        description: 'Client secret',
        example: '1234567890',
        type: String,
    })
    @IsString()
    clientSecret: string;
}

