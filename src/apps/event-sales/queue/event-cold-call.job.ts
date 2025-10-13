import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';

// apps/event/queue/event-cold-call.job.ts
@Processor('event')
export class ColdCallProcessor {
    constructor() // private readonly portalContext: PortalContext, // private readonly eventService: EventService,
    {}

    @Process('cold-call')
    async handle(job: Job<{ domain: string }>) {
        // тут можно: portalContext.set(...);
        // await this.eventService.handleColdCall(job.data);
    }
}
