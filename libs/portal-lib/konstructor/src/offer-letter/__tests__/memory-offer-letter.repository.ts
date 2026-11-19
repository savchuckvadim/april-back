import {
    LegacyOfferLetter,
    OfferLetterEntity,
    OfferLetterScope,
} from '../offer-letter.entity';
import {
    CreateOfferLetterData,
    OfferLetterRepository,
    UpdateOfferLetterData,
} from '../offer-letter.repository';

/**
 * Репозиторий писем в памяти для юнит-тестов: письма копятся в `rows`,
 * легаси-письма для переноса и существующие порталы задаются в конструкторе.
 */
export class MemoryOfferLetterRepository implements OfferLetterRepository {
    readonly rows: OfferLetterEntity[] = [];

    constructor(
        private readonly legacy: LegacyOfferLetter[] = [],
        private readonly portalIds: number[] = [],
    ) {}

    findByPortal(portalId: number): Promise<OfferLetterEntity[]> {
        return Promise.resolve(
            this.rows
                .filter(row => row.portalId === portalId)
                .map(row => ({ ...row })),
        );
    }

    findById(id: string): Promise<OfferLetterEntity | null> {
        const row = this.rows.find(item => item.id === id);
        return Promise.resolve(row ? { ...row } : null);
    }

    findPortalDefault(): Promise<OfferLetterEntity | null> {
        return Promise.resolve(null);
    }

    portalExists(portalId: number): Promise<boolean> {
        return Promise.resolve(this.portalIds.includes(portalId));
    }

    findImportedLegacyFieldIds(fieldIds: number[]): Promise<number[]> {
        return Promise.resolve(
            this.rows.flatMap(row =>
                row.legacyFieldId !== null &&
                fieldIds.includes(row.legacyFieldId)
                    ? [row.legacyFieldId]
                    : [],
            ),
        );
    }

    create(data: CreateOfferLetterData): Promise<OfferLetterEntity> {
        const row: OfferLetterEntity = {
            id: `letter-${this.rows.length + 1}`,
            portalId: data.portalId,
            bxUserId: data.bxUserId,
            name: data.name,
            text: data.text,
            isDefault: data.isDefault,
            isActive: data.isActive ?? true,
            sort: data.sort ?? 0,
            legacyFieldId: data.legacyFieldId ?? null,
            createdAt: null,
            updatedAt: null,
        };
        this.rows.push(row);
        return Promise.resolve({ ...row });
    }

    update(
        id: string,
        data: UpdateOfferLetterData,
    ): Promise<OfferLetterEntity | null> {
        const row = this.rows.find(item => item.id === id);
        if (!row) return Promise.resolve(null);
        Object.assign(row, data);
        return Promise.resolve({ ...row });
    }

    delete(id: string): Promise<boolean> {
        const index = this.rows.findIndex(row => row.id === id);
        if (index < 0) return Promise.resolve(false);
        this.rows.splice(index, 1);
        return Promise.resolve(true);
    }

    setScopeDefault(
        scope: OfferLetterScope,
        defaultId: string | null,
    ): Promise<void> {
        for (const row of this.rows) {
            if (
                row.portalId === scope.portalId &&
                row.bxUserId === scope.bxUserId
            ) {
                row.isDefault = row.id === defaultId;
            }
        }
        return Promise.resolve();
    }

    findLegacyPortalLetters(): Promise<LegacyOfferLetter[]> {
        return Promise.resolve(this.legacy);
    }
}
