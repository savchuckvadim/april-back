import { PortalAggregate } from './portal-aggregate.types';

/**
 * Read-only доступ к агрегату портала (портал + все плоские relations +
 * индексы полиморфных bitrixfields / btx_categories).
 */
export abstract class PortalAggregateRepository {
    abstract findByDomain(domain: string): Promise<PortalAggregate | null>;
    abstract findById(id: number): Promise<PortalAggregate | null>;
}
