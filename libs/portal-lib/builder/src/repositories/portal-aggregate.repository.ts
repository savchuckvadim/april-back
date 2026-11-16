import { PortalAggregate, PortalScope } from './portal-aggregate.types';

/**
 * Read-only доступ к агрегату портала (портал + все плоские relations +
 * индексы полиморфных bitrixfields / btx_categories).
 */
export abstract class PortalAggregateRepository {
    abstract findByDomain(domain: string): Promise<PortalAggregate | null>;
    abstract findById(id: number): Promise<PortalAggregate | null>;
    /**
     * Портал только с названными сущностями (их поля и воронки) — для узких
     * ручек, которым весь портал не нужен.
     */
    abstract findScopedByDomain(
        domain: string,
        scope: PortalScope,
    ): Promise<PortalAggregate | null>;
}
