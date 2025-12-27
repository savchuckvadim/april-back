import { timezones } from 'generated/prisma';

export abstract class TimezoneRepository {
    abstract create(timezone: Partial<timezones>): Promise<timezones | null>;
    abstract findById(id: number): Promise<timezones | null>;
    abstract findMany(): Promise<timezones[] | null>;
    abstract findByPortalId(portalId: number): Promise<timezones[] | null>;
    abstract update(id: number, timezone: Partial<timezones>): Promise<timezones | null>;
    abstract delete(id: number): Promise<boolean>;
}

