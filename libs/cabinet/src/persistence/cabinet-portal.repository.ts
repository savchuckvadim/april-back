import { Injectable } from '@nestjs/common';
import { Client, marketplace_installs, Portal } from 'generated/prisma';
import { PrismaService } from '@lib/core/prisma/prisma.service';
import { BITRIX_APP_CODES } from '@lib/bitrix-setup/app/enums/bitrix-app.enum';
import { CabinetPortalLookup } from '../domain/cabinet-subject';
import { CabinetPortalRef } from '../domain/cabinet-context';

/**
 * Порталы и организации-клиенты для кабинета. Портал — только чтение и
 * привязка клиента (вебхук, ключи и прочие поля кабинет не трогает);
 * организацию кабинет может завести сам — с вкладки портала «Кабинет».
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

    findClientByEmail(email: string): Promise<Client | null> {
        return this.prisma.client.findUnique({ where: { email } });
    }

    /** Новая организация-клиент: действующая, без порталов. */
    createClient(input: {
        name: string;
        email: string | null;
    }): Promise<Client> {
        const now = new Date();
        return this.prisma.client.create({
            data: {
                name: input.name,
                email: input.email,
                status: 'active',
                is_active: true,
                created_at: now,
                updated_at: now,
            },
        });
    }

    /** Порталы организации. */
    listByClient(clientId: bigint): Promise<Portal[]> {
        return this.prisma.portal.findMany({
            where: { client_id: clientId },
            orderBy: { id: 'asc' },
        });
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
