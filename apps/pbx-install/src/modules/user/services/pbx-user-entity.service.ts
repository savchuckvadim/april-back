import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PbxUserEntityDto, PbxUserService } from '@lib/portal-lib/pbx-domain';

/**
 * Резолвер сущности "пользователь" (BtxUser) в PortalDB по домену портала.
 * Аналог логики company-use-case: на портал заводится одна запись user,
 * к которой привязываются установленные поля.
 */
@Injectable()
export class PbxUserEntityService {
    constructor(
        private readonly portalService: PortalStoreService,
        private readonly pbxUserService: PbxUserService,
    ) {}

    /** Возвращает userId, создавая запись при отсутствии. */
    async getOrCreateUserId(
        domain: string,
    ): Promise<{ portalId: number; userId: number }> {
        const portalId = await this.getPortalId(domain);
        let user: PbxUserEntityDto;
        try {
            user = await this.pbxUserService.findByPortalId(String(portalId));
        } catch (e) {
            if (e instanceof NotFoundException) {
                user = await this.pbxUserService.create(
                    `user_${domain}`,
                    String(portalId),
                );
            } else {
                throw e;
            }
        }
        return { portalId, userId: Number(user.id) };
    }

    /** Возвращает userId существующей записи или null. */
    async findUserId(
        domain: string,
    ): Promise<{ portalId: number; userId: number } | null> {
        const portalId = await this.getPortalId(domain);
        try {
            const user = await this.pbxUserService.findByPortalId(
                String(portalId),
            );
            return { portalId, userId: Number(user.id) };
        } catch (e) {
            if (e instanceof NotFoundException) {
                return null;
            }
            throw e;
        }
    }

    private async getPortalId(domain: string): Promise<number> {
        const portal = await this.portalService.getPortalByDomain(domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal not found for domain ${domain}`,
            );
        }
        return Number(portal.id);
    }
}
