import { Injectable } from "@nestjs/common";

@Injectable()
export class MailService {
    async sendEmailConfirmation(email: string, token: string) {
        const link = `${process.env.APP_URL}/auth/confirm/${token}`;
        // тут можешь использовать nodemailer, Resend или SendGrid
        console.log(`Send confirmation to ${email}: ${link}`);
    }
}
