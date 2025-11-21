import { ISendMailOptions, MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { RestrictionLiftedTemplate } from './templates/restriction-lifted.template';
import { render } from '@react-email/components';
import { User } from 'generated/prisma';
import { RestrictionTemplate } from './templates/restriction.template';
import { EmailVerificationTemplate } from './templates/email-verification.template';
import { ResetPasswordTemplate } from './templates/reset-password.template';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { TestTemplate } from './templates/test.template';
import { SendEmailOfferRequestDto, SendEmailRequestDto } from './mail.dto';
import { EmailOfferTemplate } from './templates/email-offer.template';
import { StorageService, StorageType } from '@/core/storage';

@Injectable()
export class MailService {
    private readonly logger = new Logger(MailService.name);

    constructor(
        private readonly mailerService: MailerService,
        @InjectQueue('mail') private readonly queue: Queue,
        private readonly storageService: StorageService
    ) { }

    public async sendTestEmail(dto: SendEmailRequestDto) {
        const html = await render(
            TestTemplate({ userName: 'John Doe', text: 'Это тестовое письмо' })
        )

        await this.sendEmail({
            subject: dto.subject,
            html: html,
            context: {
                name: 'Jhon Doe',
            },
            to: [dto.email],
        })
        return html
    }

    public async sendOfferEmail(dto: SendEmailOfferRequestDto) {
        // Читаем логотип из storage


        // Читаем PDF из storage
        let pdfBuffer: Buffer | null = null;
        try {
            pdfBuffer = await this.storageService.readFileByType(
                StorageType.APP,
                'bitrix-app/offer',
                'offer.pdf'
            );
        } catch (error) {
            this.logger.warn('Не удалось загрузить PDF:', error);
        }

        // Используем CID для логотипа (встроенное изображение) - работает в Gmail
        const html = await render(
            EmailOfferTemplate()
        )

        // Формируем attachments
        const attachments: any[] = [];



        // Добавляем PDF как вложение
        if (pdfBuffer) {
            attachments.push({
                filename: 'offer.pdf',
                content: pdfBuffer,
                contentType: 'application/pdf',
            });
        }

        await this.sendEmail({
            subject: 'Коммерческое предложение Битрикс для партнеров Гарант',
            html: html,
            context: {
                name: 'Вадим Савчук',
            },
            to: [dto.email],
            attachments: attachments.length > 0 ? attachments : undefined,
        })
        return html
    }
    public async sendEmailVerification(user: User, token: string) {
        const html = await render(EmailVerificationTemplate({ user, token }))

        // await this.queue.add(
        //     'send-email',
        //     { email: user.email, subject: 'Верификация почты', html },
        //     { removeOnComplete: true }
        // )

        await this.sendEmail({
            subject: 'Верификация почты',
            html: html,
            to: [user.email ?? 'april-app@mail.ru'],
            context: {
                name: user.name,
            },
        })
        return true
    }

    public async sendPasswordReset(user: User, token: string) {
        const html = await render(ResetPasswordTemplate({ user, token }))

        // await this.queue.add(
        // 	'send-email',
        // 	{ email: user.email, subject: 'Сброс пароля', html },
        // 	{ removeOnComplete: true }
        // )

        return true
    }

    public async sendRestrictionEmail(
        user: User,
        // restriction: Restriction,
        violations: number
    ) {
        const html = await render(
            RestrictionTemplate({ user, violations })
        )

        // await this.queue.add(
        // 	'send-email',
        // 	{ email: user.email, subject: 'Ваш аккаунт был ограничен', html },
        // 	{ removeOnComplete: true }
        // )

        return true
    }

    public async sendRestrictionLiftedEmail(user: User, violations: number) {
        const html = await render(
            RestrictionLiftedTemplate({ user, violations })
        )

        // await this.queue.add(
        // 	'send-email',
        // 	{ email: user.email, subject: 'Ограничение снято', html },
        // 	{ removeOnComplete: true }
        // )

        return true
    }
    async sendEmail(params: {
        subject: string;
        html: string;
        to: string[];
        context: ISendMailOptions['context'];
        attachments?: Array<{
            filename: string;
            content: Buffer;
            cid?: string;
            contentType: string;
        }>;
    }) {
        try {
            const from = `"April App" <${process.env.SMTP_FROM || 'manager@april-app.ru'}>`

            const emailsList: string[] = params.to;

            if (!emailsList) {
                throw new Error(
                    `No recipients found in SMTP_TO env var, please check your .env file`,
                );
            }

            const sendMailParams: ISendMailOptions = {
                to: emailsList,
                from: from,
                subject: params.subject,
                html: params.html,
                attachments: params.attachments,
            };
            const response = await this.mailerService.sendMail(sendMailParams);
            this.logger.log(
                `Email sent successfully to recipients with the following parameters : ${JSON.stringify(
                    sendMailParams,
                )}`,
                response,
            );
            return {
                ...response,

                message: 'Email sent successfully',
            };
        } catch (error) {
            this.logger.error(
                `Error while sending mail with the following parameters : ${JSON.stringify(
                    params,
                )}`,
                error,
            );
        }
    }
    // async sendEmail(params: {
    //     subject: string;
    //     template: string;
    //     to: string[];
    //     context: ISendMailOptions['context'];
    // }) {
    //     try {
    //         const emailsList: string[] = params.to;

    //         if (!emailsList) {
    //             throw new Error(
    //                 `No recipients found in SMTP_TO env var, please check your .env file`,
    //             );
    //         }

    //         const sendMailParams = {
    //             to: emailsList,
    //             from: process.env.SMTP_FROM,
    //             subject: params.subject,
    //             template: params.template,
    //             context: params.context,
    //         };
    //         const response = await this.mailerService.sendMail(sendMailParams);
    //         this.logger.log(
    //             `Email sent successfully to recipients with the following parameters : ${JSON.stringify(
    //                 sendMailParams,
    //             )}`,
    //             response,
    //         );
    //         return {
    //             ...response,

    //             message: 'Email sent successfully',
    //         };
    //     } catch (error) {
    //         this.logger.error(
    //             `Error while sending mail with the following parameters : ${JSON.stringify(
    //                 params,
    //             )}`,
    //             error,
    //         );
    //     }
    // }
}
