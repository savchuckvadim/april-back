import { Injectable, Logger } from '@nestjs/common';
import { FlowDtoStorageService } from '../services/flow-dto-storage.service';
import { TaskWebhookDto } from '../dto/task-webhook.dto';
import { TaskCompleteResultDto } from '../dto/task-complete-result.dto';

const TASK_STATUS_COMPLETED = '5';

@Injectable()
export class TaskCompleteUseCase {
    private readonly logger = new Logger(TaskCompleteUseCase.name);

    constructor(private readonly flowStorage: FlowDtoStorageService) {}

    async handle(webhook: TaskWebhookDto): Promise<TaskCompleteResultDto> {
        const domain = webhook.auth?.domain;
        const fields = webhook.data?.FIELDS_AFTER;
        const taskId = Number(fields?.ID);
        const status = fields?.STATUS;

        if (!domain || !taskId) {
            return { accepted: false, reason: 'Missing domain or task ID' };
        }
        if (status && status !== TASK_STATUS_COMPLETED) {
            return {
                accepted: false,
                reason: `Status ${status} is not completed (5)`,
                domain,
                taskId,
            };
        }

        const flowDto = await this.flowStorage.get(domain, taskId);
        if (!flowDto) {
            return {
                accepted: false,
                reason: 'No stored flowDto for this task (not a call-analysis confirmation task)',
                domain,
                taskId,
            };
        }

        this.logger.log(
            `Task ${taskId} (${domain}) completed — forwarding flowDto to event-sales`,
        );
        // TODO: forward to event-sales use-case once it's implemented
        // For now we just return the DTO so the webhook caller / log gets it.

        await this.flowStorage.delete(domain, taskId);

        return { accepted: true, domain, taskId, flowDto };
    }
}
