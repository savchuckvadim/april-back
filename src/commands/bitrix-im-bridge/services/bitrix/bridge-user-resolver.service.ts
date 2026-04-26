import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixImBridgeStateService } from '../bitrix-im-bridge-state.service';

@Injectable()
export class BridgeUserResolverService {
    private readonly logger = new Logger(BridgeUserResolverService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly state: BitrixImBridgeStateService,
    ) {}

    async resolve(domain: string, email: string): Promise<string> {
        const cached = await this.state.getBridgeUserId(domain);
        if (cached) {
            this.logger.debug(
                `Use cached bridge user for ${domain}: ${cached}`,
            );
            return cached;
        }

        const { bitrix, portal } = await this.pbx.init(domain);
        const fromHook = this.parseUserIdFromHook(portal.C_REST_WEB_HOOK_URL);
        if (fromHook) {
            await this.state.setBridgeUserId(domain, fromHook);
            this.logger.log(
                `Resolved bridge user from hook for ${domain}: ${fromHook}`,
            );
            return fromHook;
        }

        const fromEmail = await this.findUserIdByEmail(bitrix, email);
        if (fromEmail) {
            await this.state.setBridgeUserId(domain, fromEmail);
            this.logger.log(
                `Resolved bridge user by email for ${domain}: ${fromEmail}`,
            );
            return fromEmail;
        }

        const current = (await bitrix.user.getCurrent()) as {
            result?: { ID?: number | string };
        };
        const currentId = current?.result?.ID;
        if (!currentId) {
            throw new Error(
                `Unable to resolve Bitrix bridge user for ${domain}`,
            );
        }
        const result = String(currentId);
        await this.state.setBridgeUserId(domain, result);
        this.logger.log(
            `Resolved bridge user from user.current for ${domain}: ${result}`,
        );
        return result;
    }

    private parseUserIdFromHook(
        rawHook: string | undefined,
    ): string | undefined {
        if (!rawHook) return undefined;
        const normalized = rawHook.startsWith('http')
            ? rawHook
            : `https://placeholder/${rawHook}`;
        const match = normalized.match(/\/rest\/(\d+)\//i);
        return match?.[1];
    }

    private async findUserIdByEmail(
        bitrix: {
            user: {
                get(
                    filter: Record<string, unknown>,
                    select?: string[],
                ): Promise<unknown>;
            };
        },
        email: string,
    ): Promise<string | undefined> {
        const response = (await bitrix.user.get({ EMAIL: email }, [
            'ID',
            'EMAIL',
        ])) as {
            result?: Array<{ ID?: number | string }>;
        };
        const id = response?.result?.[0]?.ID;
        return id ? String(id) : undefined;
    }
}
