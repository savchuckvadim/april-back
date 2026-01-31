import { IsNumeric } from "@/core/decorators";
import { IsBxHookUserId } from "@/core/decorators/dto/bx-hook-user-id.decorator";
import { ApiProperty } from "@nestjs/swagger"
import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator"

export class HookAuthDto {

    @ApiProperty({ description: 'Domain of the Bitrix24 portal' })
    @IsString()
    domain: string;
    // client_endpoint: 'https://gsr.bitrix24.ru/rest/',
    // server_endpoint: 'https://oauth.bitrix24.tech/rest/',
    // member_id: 'd1affba697e56e33eb55983b26755ff2'
}


export class BxWebHookDto {
    @ApiProperty({ description: 'Authentication information' })
    @ValidateNested()
    @Type(() => HookAuthDto)
    auth: HookAuthDto;
}



export class OrkQueryDto {
    @ApiProperty({ description: 'Responsible ID' })
    @IsBxHookUserId()
    responsibleId: string;


    @ApiProperty({ description: 'Smart ID' })
    @IsNumeric()
    smartId: number;
    @ApiProperty({ description: 'Deal ID' })
    @IsNumeric()
    dealId: number;

    @ApiProperty({ description: 'Quantity of products or months' })
    @IsNumeric()
    quantity: number;
    @ApiProperty({ description: 'Smart Type ID' })
    @IsNumeric()
    smartTypeId: number;
    @ApiProperty({ description: 'Smart Category ID' })
    @IsNumeric()
    smartCategoryId: number;

    @ApiProperty({ description: 'Smart CRM ID' })
    @IsString()
    smartCrmId: string;



    @ApiProperty({ description: 'deadline' })
    @IsOptional()
    @IsString()
    deadline?: string;


    @ApiProperty({ description: 'Comment' })
    @IsOptional()
    @IsString()
    comment?: string;

}


export class CreateActDto extends OrkQueryDto {
    @ApiProperty({ description: 'Domain of the Bitrix24 portal' })
    @IsString()
    domain: string;
}

