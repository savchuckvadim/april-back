import { Body, Controller, Get, Post } from '@nestjs/common';
import { MailService } from './mail.service';

import { ApiBody, ApiOperation, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { SuccessResponseDto } from '@/core';
import { EmailTemplate, SendEmailRequestDto } from './mail.dto';


@Controller('mail')
export class MailController {
    constructor(private readonly mailService: MailService) { }

    @ApiOperation({ summary: 'Send email' })
    @ApiBody({ type: SendEmailRequestDto })
    @ApiResponse({
        status: 200, description: 'Email sent', type: SuccessResponseDto
    })
    @Post('send')
    async sendMail(@Body() dto: SendEmailRequestDto) {
        return await this.mailService.sendTestEmail(dto)

    }
    // @Post('send')
    // async sendMail(@Body() dto: SendEmailRequestDto) {
    //    return await this.mailService.sendEmail({
    //         subject: dto.subject,
    //         template: EmailTemplate.CONFIRMATION,
    //         context: {
    //             name: 'Jhon Doe',
    //         },
    //         to: [dto.email],
    //     });
    // }
}
