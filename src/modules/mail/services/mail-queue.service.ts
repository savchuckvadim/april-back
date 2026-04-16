import { Injectable } from '@nestjs/common';
import { User } from 'generated/prisma';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { MailAuthJobPayload, MailAuthJobType } from '../dto/mail-auth-job.dto';

@Injectable()
export class MailQueueService {
    constructor(
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    async enqueueEmailVerification(user: User, token: string): Promise<void> {
        await this.dispatchAuthMailJob({
            type: MailAuthJobType.EMAIL_VERIFICATION,
            token,
            user: this.mapUser(user),
        });
    }

    async enqueuePasswordReset(user: User, token: string): Promise<void> {
        await this.dispatchAuthMailJob({
            type: MailAuthJobType.PASSWORD_RESET,
            token,
            user: this.mapUser(user),
        });
    }

    private async dispatchAuthMailJob(data: MailAuthJobPayload): Promise<void> {
        await this.queueDispatcher.dispatch(
            QueueNames.MAIL,
            JobNames.MAIL_SEND_AUTH,
            data,
        );
    }

    private mapUser(user: User): MailAuthJobPayload['user'] {
        return {
            id: String(user.id),
            email: user.email,
            name: user.name,
            surname: user.surname,
        };
    }
}
