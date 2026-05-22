import { MailQueueService } from '@/modules/mail/services/mail-queue.service';
import { Injectable } from '@nestjs/common';
import { User } from 'generated/prisma';

@Injectable()
export class MailConfirmationService {
    constructor(private readonly mailQueueService: MailQueueService) {}

    async sendEmailConfirmation(user: User, token: string) {
        const link = `${process.env.APP_URL}/api/auth/confirm/${token}`;
        // тут можешь использовать nodemailer, Resend или SendGrid
        console.log(`Send confirmation to ${user.email}: ${link}`);
        await this.mailQueueService.enqueueEmailVerification(user, token);
        return { message: 'Email confirmation sent successfully' };
    }

    async sendPasswordReset(user: User, token: string) {
        await this.mailQueueService.enqueuePasswordReset(user, token);
        return { message: 'Password reset email sent successfully' };
    }
}
