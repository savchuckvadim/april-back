import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import { PortalListService } from '@lib/portal-lib/pbx-domain';
import { bigintConvertToNumber } from '@/shared';

export interface ListContextResolveArgs {
    domain: string;
    /** То же, что хранится в `bitrixlists.type` (например, `kpi`). */
    type: string;
    /** То же, что хранится в `bitrixlists.group` (например, `sales`). */
    group: string;
}

export interface ListContext {
    portalId: number;
    listDbId: bigint;
    /** IBLOCK_ID списка в Bitrix — все обращения к lists.* адресуем по нему */
    listBitrixId: number;
}

/**
 * Резолвер «контекста» одного списка: строка в PortalDB (`bitrixlists`) +
 * Bitrix-адресация (IBLOCK_ID). Используется во всех list field use-case-ах.
 *
 * Не делает upsert — если списка нет в БД, бросает 404; первичный сценарий
 * установки делает InstallListUseCase (он поднимает строку через
 * PortalListService.upsertFromBitrix ДО установки полей).
 */
@Injectable()
export class ListContextResolver {
    private readonly logger = new Logger(ListContextResolver.name);

    constructor(
        private readonly portalService: PortalStoreService,
        private readonly portalListService: PortalListService,
    ) {}

    async resolve(args: ListContextResolveArgs): Promise<ListContext> {
        const portal = await this.portalService.getPortalByDomain(args.domain);
        if (!portal) {
            throw new NotFoundException(
                `Portal not found for domain ${args.domain}`,
            );
        }
        const list = await this.portalListService.findFirstByPortalTypeGroup(
            BigInt(portal.id.toString()),
            args.type,
            args.group,
        );
        if (!list) {
            throw new NotFoundException(
                `List not found for portal=${args.domain} type=${args.type} group=${args.group}`,
            );
        }
        return {
            portalId: Number(portal.id),
            listDbId: list.id,
            listBitrixId: bigintConvertToNumber(list.bitrixId),
        };
    }

    /** null вместо 404 — для массовых операций по всем порталам */
    async resolveSafe(
        args: ListContextResolveArgs,
    ): Promise<ListContext | null> {
        try {
            return await this.resolve(args);
        } catch (e) {
            this.logger.warn(
                `resolveSafe(${args.domain}, ${args.type}, ${args.group}): ${String(e)}`,
            );
            return null;
        }
    }
}
