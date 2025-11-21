import { IsEmail, IsNotEmpty, IsString, } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


export enum EmailTemplate {
    CONFIRMATION = 'signup-confirmation-email',
    FIRST_STEPS = 'first-steps-email',


}
export class SendEmailRequestDto {
    @ApiProperty({ description: 'Email', example: 'test@example.com' })
    @IsString()
    @IsNotEmpty()
    @IsEmail()
    email: string;

    @ApiProperty({ description: 'Subject', example: 'Welcome to the realm of NestJS' })
    @IsString()
    @IsNotEmpty()
    @IsString()
    subject: string;



    @ApiProperty({ description: 'Template', example: 'text' })
    @IsString()
    @IsNotEmpty()
    @IsString()
    body: string;
}



export class SendEmailOfferRequestDto {
    @ApiProperty({ description: 'Email', example: 'test@example.com' })
    @IsString()
    @IsNotEmpty()
    @IsEmail()
    email: string;


}
