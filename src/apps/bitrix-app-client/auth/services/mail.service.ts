import { MailService } from "@/modules/mail/mail.service";
import { Injectable } from "@nestjs/common";
import { User } from "generated/prisma";

@Injectable()
export class MailConfirmationService {
    constructor(
        private readonly mailService: MailService
    ) { }
    async sendEmailConfirmation(user: User, token: string) {
        const link = `${process.env.APP_URL}/api/auth/confirm/${token}`;
        // тут можешь использовать nodemailer, Resend или SendGrid
        console.log(`Send confirmation to ${user.email}: ${link}`);
        await this.mailService.sendEmailVerification(user, token);
        return { message: 'Email confirmation sent successfully' };

    }
}
