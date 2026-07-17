import { Injectable } from '@nestjs/common';
import { PrismaService } from '@lib/core/prisma';
import { PortalAggregateRepository } from './portal-aggregate.repository';
import {
    BuilderEntityKey,
    CATEGORY_ENTITY_KEYS,
    ENTITY_TYPE_DB_VALUES,
    PORTAL_AGGREGATE_INCLUDE,
    PolymorphicIndex,
    PortalAggregate,
    PortalWithRelations,
} from './portal-aggregate.types';

type EntityIdsMap = Record<BuilderEntityKey, bigint[]>;

/** Общий where-фрагмент для обеих полиморфных таблиц. */
type PolymorphicWherePair = {
    entity_type: string;
    entity_id: { in: bigint[] };
};

/**
 * Собирает агрегат портала ровно за 3 запроса (без N+1):
 * 1) портал со всеми плоскими relations;
 * 2) все bitrixfields (+items) владельцев одним findMany по OR-парам;
 * 3) все btx_categories (+stages) владельцев одним findMany по OR-парам.
 */
@Injectable()
export class PortalAggregatePrismaRepository extends PortalAggregateRepository {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findByDomain(domain: string): Promise<PortalAggregate | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { domain },
            include: PORTAL_AGGREGATE_INCLUDE,
        });
        return portal ? this.loadPolymorphic(portal) : null;
    }

    async findById(id: number): Promise<PortalAggregate | null> {
        const portal = await this.prisma.portal.findFirst({
            where: { id: BigInt(id) },
            include: PORTAL_AGGREGATE_INCLUDE,
        });
        return portal ? this.loadPolymorphic(portal) : null;
    }

    private async loadPolymorphic(
        portal: PortalWithRelations,
    ): Promise<PortalAggregate> {
        const ids = this.collectEntityIds(portal);

        const fieldPairs = this.buildOrPairs(ids, [
            ...(Object.keys(ENTITY_TYPE_DB_VALUES) as BuilderEntityKey[]),
        ]);
        const categoryPairs = this.buildOrPairs(ids, CATEGORY_ENTITY_KEYS);

        const [fields, categories] = await Promise.all([
            fieldPairs.length
                ? this.prisma.bitrixfields.findMany({
                      where: { OR: fieldPairs },
                      include: { bitrixfield_items: true },
                  })
                : Promise.resolve([]),
            categoryPairs.length
                ? this.prisma.btx_categories.findMany({
                      where: { OR: categoryPairs },
                      include: { btx_stages: true },
                  })
                : Promise.resolve([]),
        ]);

        return {
            portal,
            fieldsIndex: this.buildIndex(fields),
            categoriesIndex: this.buildIndex(categories),
        };
    }

    private collectEntityIds(portal: PortalWithRelations): EntityIdsMap {
        return {
            deal: portal.btx_deals.map(row => row.id),
            smart: portal.smarts.map(row => row.id),
            company: portal.btx_companies.map(row => row.id),
            contact: portal.btx_contacts.map(row => row.id),
            lead: portal.btx_leads.map(row => row.id),
            list: portal.bitrixlists.map(row => row.id),
            rpa: portal.btx_rpas.map(row => row.id),
            user: portal.btx_users.map(row => row.id),
        };
    }

    /**
     * OR-пары (entity_type, entity_id in ids) для полиморфного запроса.
     * Для lead/list в БД встречаются два написания FQCN — запрашиваем оба.
     */
    private buildOrPairs(
        ids: EntityIdsMap,
        keys: readonly BuilderEntityKey[],
    ): PolymorphicWherePair[] {
        const pairs: PolymorphicWherePair[] = [];
        for (const key of keys) {
            if (!ids[key].length) continue;
            for (const entityType of ENTITY_TYPE_DB_VALUES[key]) {
                pairs.push({
                    entity_type: entityType,
                    entity_id: { in: ids[key] },
                });
            }
        }
        return pairs;
    }

    private buildIndex<T extends { entity_type: string; entity_id: bigint }>(
        rows: T[],
    ): PolymorphicIndex<T> {
        const index: PolymorphicIndex<T> = new Map();
        for (const row of rows) {
            let byId = index.get(row.entity_type);
            if (!byId) {
                byId = new Map();
                index.set(row.entity_type, byId);
            }
            const entityId = Number(row.entity_id);
            const list = byId.get(entityId);
            if (list) list.push(row);
            else byId.set(entityId, [row]);
        }
        return index;
    }
}
