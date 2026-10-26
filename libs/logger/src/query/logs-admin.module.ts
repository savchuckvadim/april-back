import { Module } from '@nestjs/common';
import { LogsAdminController } from './admin/logs-admin.controller';
import { LogQueryModule } from './log-query.module';

/**
 * Ручки журналов для админки — ТОЛЬКО apps/admin
 * (ai/rules/app-api-surface.md): журналы всех приложений и порталов не
 * должны торчать в Swagger прикладных приложений.
 */
@Module({
    imports: [LogQueryModule],
    controllers: [LogsAdminController],
})
export class LogsAdminModule {}
