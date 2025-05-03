// core/silence/silent-job-handlers.module.ts
import { Global, Module, Logger } from '@nestjs/common';
import { SilentJobHandlersRegistry } from './silent-job-handlers.registry';

@Global()
@Module({
  providers: [SilentJobHandlersRegistry],
  exports: [SilentJobHandlersRegistry],
})
export class SilentJobHandlersModule {
  private readonly logger = new Logger(SilentJobHandlersModule.name);

  constructor(private readonly registry: SilentJobHandlersRegistry) {
    this.logger.log('SilentJobHandlersModule initialized ✅');
    this.logger.log(`Registry available: ${!!this.registry}`);
  }
}
