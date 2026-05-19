import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BitrixImBridgeConfigService {
    constructor(private readonly config: ConfigService) {}

    getDefaultBridgeEmail(): string {
        return (
            this.config.get<string>('BITRIX_IM_BRIDGE_USER_EMAIL') ||
            'savchuckvadim@gmail.com'
        );
    }

    isSchedulerEnabled(): boolean {
        const explicit = this.config.get<string>('WITH_SCHEDLER');
        if (explicit != null) {
            return this.toBoolean(explicit, false);
        }

        // Backward-compatible alias for corrected variable naming.
        const alias = this.config.get<string>('WITH_SCHEDLER');
        if (alias != null) {
            return this.toBoolean(alias, false);
        }

        return false;
    }

    getPortalWhitelist(): Set<string> {
        return new Set(
            this.parseList('BITRIX_IM_BRIDGE_PORTAL_WHITELIST').map(domain =>
                this.normalizeDomain(domain),
            ),
        );
    }

    getPortalDenylist(): Set<string> {
        return new Set(
            this.parseList('BITRIX_IM_BRIDGE_PORTAL_DENYLIST').map(domain =>
                this.normalizeDomain(domain),
            ),
        );
    }

    getUserWhitelist(): Set<string> {
        return new Set(this.parseList('BITRIX_IM_BRIDGE_USER_WHITELIST'));
    }

    isPortalAllowed(domain: string): boolean {
        const normalizedDomain = this.normalizeDomain(domain);
        const whitelist = this.getPortalWhitelist();
        if (whitelist.size > 0 && !whitelist.has(normalizedDomain)) {
            return false;
        }

        const denylist = this.getPortalDenylist();
        if (denylist.has(normalizedDomain)) {
            return false;
        }

        return true;
    }

    isUserAllowed(userId?: string): boolean {
        const whitelist = this.getUserWhitelist();
        if (whitelist.size === 0) return true;
        if (!userId) return false;
        return whitelist.has(userId);
    }

    shouldIgnoreSystemMessages(): boolean {
        return this.getBoolean('BITRIX_IM_BRIDGE_IGNORE_SYSTEM', true);
    }

    shouldIgnoreBotMessages(): boolean {
        return this.getBoolean('BITRIX_IM_BRIDGE_IGNORE_BOTS', true);
    }

    shouldNotifyIncomingEvents(): boolean {
        return this.getBoolean('BITRIX_IM_BRIDGE_NOTIFY_INCOMING_EVENTS', true);
    }

    getPollLimit(): number {
        const value = Number(
            this.config.get<string>('BITRIX_IM_BRIDGE_POLL_LIMIT'),
        );
        if (!Number.isFinite(value) || value < 1) return 100;
        return Math.min(value, 1000);
    }

    isValidBitrixPortalDomain(domain: string): boolean {
        const value = domain.trim().toLowerCase();
        return /^[a-z0-9][a-z0-9-]*\.bitrix24\.ru$/.test(value);
    }

    normalizeDomain(domain: string): string {
        return domain.trim().toLowerCase();
    }

    private parseList(key: string): string[] {
        return (this.config.get<string>(key) || '')
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
    }

    private getBoolean(key: string, defaultValue: boolean): boolean {
        const raw = this.config.get<string>(key);
        if (raw == null) return defaultValue;
        return this.toBoolean(raw, defaultValue);
    }

    private toBoolean(value: string, defaultValue: boolean): boolean {
        const normalized = value.toLowerCase().trim();
        if (!normalized) return defaultValue;
        return !['0', 'false', 'no', 'off'].includes(normalized);
    }
}
