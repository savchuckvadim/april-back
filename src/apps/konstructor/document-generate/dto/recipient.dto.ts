import { IsString } from "class-validator";
import { IsOptional } from "class-validator";

export class RecipientDto {
    @IsOptional() @IsString() companyName: string;
    @IsOptional() @IsString() inn: string;
    @IsOptional() @IsString() position: string;
    @IsOptional() @IsString() positionCase: string;
    @IsOptional() @IsString() recipient: string;
    @IsOptional() @IsString() recipientCase: string;
    @IsOptional() @IsString() companyAdress: string;
    @IsOptional() @IsString() code: string;
    @IsOptional() @IsString() type: string;
}
