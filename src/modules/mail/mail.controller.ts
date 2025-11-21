import { Body, Controller, Get, Post, Res, Param, NotFoundException } from '@nestjs/common';
import { MailService } from './mail.service';
import { Response } from 'express';
import { StorageService, StorageType } from '@/core/storage';
import * as fs from 'fs';

import { ApiBody, ApiOperation, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { SuccessResponseDto } from '@/core';
import { EmailTemplate, SendEmailOfferRequestDto, SendEmailRequestDto } from './mail.dto';


@Controller('mail')
export class MailController {
    constructor(
        private readonly mailService: MailService,
        private readonly storageService: StorageService
    ) { }

    @ApiOperation({ summary: 'Send email' })
    @ApiBody({ type: SendEmailRequestDto })
    @ApiResponse({
        status: 200, description: 'Email sent', type: SuccessResponseDto
    })
    @Post('send')
    async sendMail(@Body() dto: SendEmailRequestDto) {
        return await this.mailService.sendTestEmail(dto)

    }


    @ApiOperation({ summary: 'Send Offer email' })
    @ApiBody({ type: SendEmailOfferRequestDto })
    @ApiResponse({
        status: 200, description: 'Email sent', type: SuccessResponseDto
    })
    @Post('send-offer')
    async sendMailOffer(@Body() dto: SendEmailOfferRequestDto) {
        return await this.mailService.sendOfferEmail(dto)

    }

    @Get('assets/logo')
    @ApiOperation({ summary: 'Get logo file' })
    async getLogo(@Res() res: Response) {
        try {
            const filePath = this.storageService.getFilePath(
                StorageType.APP,
                'bitrix-app/logo',
                'logo.svg'
            );

            if (!fs.existsSync(filePath)) {
                throw new NotFoundException('Логотип не найден');
            }

            const fileBuffer = await this.storageService.readFile(filePath);

            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Кеш на год
            return res.send(fileBuffer);
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            throw new NotFoundException('Логотип не найден');
        }
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
