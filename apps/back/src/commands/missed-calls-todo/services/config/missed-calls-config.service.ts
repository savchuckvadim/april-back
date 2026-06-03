import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MissedCallsConfigService {
    private readonly logger = new Logger(MissedCallsConfigService.name);
    constructor(private readonly config: ConfigService) {}

    isSchedulerEnabled(): boolean {
        const raw = this.config.get<string>('WITH_SCHEDLER');
        this.logger.log('WITH_SCHEDLER', raw);
        if (raw == null) return false;
        const result = this.toBoolean(raw, false);
        this.logger.log('WITH_SCHEDLER result', result);
        return result;
    }

    getPortalDomain(): string {
        return (
            this.config.get<string>('MISSED_CALLS_PORTAL_DOMAIN') ||
            'gsirk.bitrix24.ru'
        );
    }

    getLookbackMinutes(): number {
        const raw = Number(
            this.config.get<string>('MISSED_CALLS_LOOKBACK_MINUTES'),
        );
        if (!Number.isFinite(raw) || raw <= 0) return 20;
        return Math.min(raw, 24 * 60);
    }

    private toBoolean(value: string, defaultValue: boolean): boolean {
        const normalized = value.toLowerCase().trim();
        if (!normalized) return defaultValue;
        return !['0', 'false', 'no', 'off'].includes(normalized);
    }
}
