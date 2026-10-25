import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { IsOptional } from 'class-validator';

export class RecipientDto {
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    companyName: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    inn: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    position: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    positionCase: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    recipient: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    recipientCase: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    companyAdress: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    code: string;
    @ApiProperty({ type: String, required: false })
    @IsOptional()
    @IsString()
    type: string;
}
