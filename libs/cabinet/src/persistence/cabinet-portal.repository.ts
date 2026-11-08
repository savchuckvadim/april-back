import { Injectable } from '@nestjs/common';
import { Client, marketplace_installs, Portal } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { CabinetPortalLookup } from '../domain/cabinet-subject';
import { CabinetPortalRef } from '../domain/cabinet-context';

/**
 * Порталы и организации-клиенты для кабинета. Только чтение портала и
 * привязка клиента — вебхук, ключи и прочие поля портала кабинет не трогает.
 */
@Injectable()
export class CabinetPortalRepository {
    constructor(private readonly prisma: PrismaService) {}

    /** Портал по данным токена фрейма: id → member_id → домен. */
    async findByLookup(lookup: CabinetPortalLookup): Promise<Portal | null> {
        if (lookup.portalId) {
            const byId = await this.findById(BigInt(lookup.portalId));
            if (byId) return byId;
        }
        if (lookup.memberId) {
            const byMember = await this.prisma.portal.findFirst({
                where: { member_id: lookup.memberId },
            });
            if (byMember) return byMember;
        }
        if (lookup.domain) {
            return this.prisma.portal.findFirst({
                where: { domain: lookup.domain },
            });
        }
        return null;
    }

    findById(id: bigint): Promise<Portal | null> {
        return this.prisma.portal.findUnique({ where: { id } });
    }

    findClient(id: bigint): Promise<Client | null> {
        return this.prisma.client.findUnique({ where: { id } });
    }

    /** Установка приложения April на портале (и удалённая — для истории). */
    findAppInstall(portalId: bigint): Promise<marketplace_installs | null> {
        return this.prisma.marketplace_installs.findUnique({
            where: {
                portal_id_app_code: {
                    portal_id: portalId,
                    app_code: BITRIX_APP_CODES.GARANT,
                },
            },
        });
    }

    /** Привязать портал к организации (null — отвязать). */
    async attachClient(
        portalId: bigint,
        clientId: bigint | null,
    ): Promise<Portal> {
        return this.prisma.portal.update({
            where: { id: portalId },
            data: { client_id: clientId, updated_at: new Date() },
        });
    }
}

export function toCabinetPortalRef(portal: Portal): CabinetPortalRef {
    return {
        id: portal.id,
        domain: portal.domain,
        memberId: portal.member_id,
        clientId: portal.client_id,
        approvalStatus: portal.approval_status,
    };
}
