import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { User } from 'generated/prisma';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { MailAuthJobPayload, MailAuthJobType } from '../dto/mail-auth-job.dto';
import { MailService } from '../mail.service';

@Injectable()
@Processor(QueueNames.MAIL)
export class MailProcessor {
    private readonly logger = new Logger(MailProcessor.name);

    constructor(private readonly mailService: MailService) {}

    @Process(JobNames.MAIL_SEND_AUTH)
    async handleAuthMail(job: Job<MailAuthJobPayload>): Promise<void> {
        const { type, token, user } = job.data;
        const mailUser = {
            id: BigInt(user.id),
            email: user.email,
            name: user.name,
            surname: user.surname,
        } as User;

        switch (type) {
            case MailAuthJobType.EMAIL_VERIFICATION:
                await this.mailService.sendEmailVerification(mailUser, token);
                return;
            case MailAuthJobType.PASSWORD_RESET:
                await this.mailService.sendPasswordReset(mailUser, token);
                return;
            default:
                this.logger.error(`Unknown mail auth job type: ${String(type)}`);
                throw new Error(`Unknown mail auth job type: ${String(type)}`);
        }
    }
}
