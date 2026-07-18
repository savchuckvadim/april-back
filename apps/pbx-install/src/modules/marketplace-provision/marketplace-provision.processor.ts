import { Injectable, Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { JobNames, QueueNames } from '@lib/queue';
import { MarketplaceProvisionJobPayload } from '@lib/marketplace-core';
import { ProvisionProductUseCase } from './use-cases/provision-product.use-case';

/**
 * Воркер очереди marketplace-provision: принимает задания provisioning
 * pbx-сущностей маркетплейс-продукта (продюсер — apps/pbx marketplace)
 * и делегирует оркестрацию в {@link ProvisionProductUseCase}.
 */
@Injectable()
@Processor(QueueNames.MARKETPLACE_PROVISION)
export class MarketplaceProvisionProcessor {
    private readonly logger = new Logger(MarketplaceProvisionProcessor.name);

    constructor(private readonly useCase: ProvisionProductUseCase) {}

    @Process(JobNames.MARKETPLACE_PROVISION_PRODUCT)
    async handle(job: Job<MarketplaceProvisionJobPayload>): Promise<void> {
        const { requestId, domain, productCode, trigger } = job.data;
        this.logger.log(
            `[${requestId}] provisioning старт: domain=${domain} product=${productCode} trigger=${trigger} jobId=${job.id} attempt=${job.attemptsMade + 1}`,
        );
        const result = await this.useCase.execute(job.data);
        this.logger.log(
            `[${requestId}] provisioning финиш: domain=${domain} product=${productCode} status=${result.status} installed=${result.installedSteps} skipped=${result.skippedSteps}`,
        );
    }

    @OnQueueFailed()
    onFailed(job: Job<MarketplaceProvisionJobPayload>, error: Error): void {
        this.logger.error(
            `[${job.data?.requestId}] provisioning failed: jobId=${job.id} domain=${job.data?.domain} err=${error.message}`,
        );
    }
}
