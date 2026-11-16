import {
    CreateOfferLetterData,
    LegacyOfferLetter,
    legacyLetterOf,
    OfferLetterEntity,
    OfferLetterRepository,
} from '@lib/portal-lib/konstructor';
import { OfferLetterImportStatusEnum } from '../dto/offer-letters-import.dto';
import { OfferLettersImportService } from '../services/offer-letters-import.service';

/** Репозиторий в памяти: легаси-письма заданы, созданное копится в rows */
class MemoryOfferLetterRepository implements OfferLetterRepository {
    readonly rows: OfferLetterEntity[] = [];

    constructor(private readonly legacy: LegacyOfferLetter[]) {}

    findByPortal(portalId: number): Promise<OfferLetterEntity[]> {
        return Promise.resolve(
            this.rows.filter(row => row.portalId === portalId),
        );
    }

    findPortalDefault(): Promise<OfferLetterEntity | null> {
        return Promise.resolve(null);
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
        return Promise.resolve(row);
    }

    findLegacyPortalLetters(): Promise<LegacyOfferLetter[]> {
        return Promise.resolve(this.legacy);
    }
}

const letter = (
    portalId: number,
    fieldId: number,
    text: string,
): LegacyOfferLetter => ({
    portalId,
    domain: `portal-${portalId}.bitrix24.ru`,
    templateId: portalId,
    fieldId,
    text,
    enabled: true,
});

describe('перенос писем КП из легаси-шаблонов', () => {
    it('сухой запуск только показывает, что будет создано', async () => {
        const repository = new MemoryOfferLetterRepository([
            letter(1, 2, 'Вот уже 35 лет…'),
        ]);
        const result = await new OfferLettersImportService(
            repository,
        ).importLegacy({});

        expect(result.dryRun).toBe(true);
        expect(result.created).toBe(0);
        expect(result.items[0]?.status).toBe(
            OfferLetterImportStatusEnum.WOULD_CREATE,
        );
        expect(result.items[0]?.isDefault).toBe(true);
        expect(repository.rows).toHaveLength(0);
    });

    it('перенос создаёт письмо портала по умолчанию, повторный — ничего не дублирует', async () => {
        const repository = new MemoryOfferLetterRepository([
            letter(1, 2, 'Вот уже 35 лет…'),
        ]);
        const service = new OfferLettersImportService(repository);

        const first = await service.importLegacy({ dryRun: false });
        expect(first.created).toBe(1);
        expect(repository.rows[0]).toMatchObject({
            portalId: 1,
            bxUserId: null,
            isDefault: true,
            legacyFieldId: 2,
            text: 'Вот уже 35 лет…',
        });

        const second = await service.importLegacy({ dryRun: false });
        expect(second.created).toBe(0);
        expect(second.items[0]?.status).toBe(
            OfferLetterImportStatusEnum.EXISTS,
        );
        expect(repository.rows).toHaveLength(1);
    });

    it('пустое письмо пропускается; второе письмо портала — не по умолчанию', async () => {
        const repository = new MemoryOfferLetterRepository([
            letter(1, 2, ''),
            letter(3, 4, 'Первое'),
            letter(3, 5, 'Второе'),
        ]);
        const result = await new OfferLettersImportService(
            repository,
        ).importLegacy({ dryRun: false });

        expect(result.items.map(item => item.status)).toEqual([
            OfferLetterImportStatusEnum.EMPTY,
            OfferLetterImportStatusEnum.CREATED,
            OfferLetterImportStatusEnum.CREATED,
        ]);
        expect(repository.rows.map(row => row.isDefault)).toEqual([
            true,
            false,
        ]);
    });
});

describe('письмо из легаси-шаблона', () => {
    it('текст из description поля letter, флаг из isLetter', () => {
        expect(
            legacyLetterOf({
                id: 1n,
                portalId: 7n,
                domain: 'april-garant.bitrix24.ru',
                fields: [
                    { id: 1n, code: 'isLetter', value: '0', description: null },
                    {
                        id: 2n,
                        code: 'letter',
                        value: null,
                        description: '\n Вот уже <red>35</red> лет \n',
                    },
                ],
            }),
        ).toEqual({
            portalId: 7,
            domain: 'april-garant.bitrix24.ru',
            templateId: 1,
            fieldId: 2,
            text: 'Вот уже <red>35</red> лет',
            enabled: false,
        });
    });

    it('шаблон без поля letter письма не даёт', () => {
        expect(
            legacyLetterOf({ id: 1n, portalId: 7n, domain: null, fields: [] }),
        ).toBeNull();
    });
});
