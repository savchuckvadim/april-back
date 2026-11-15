import { Injectable, Logger } from '@nestjs/common';
import {
    LegacyOfferLetter,
    OfferLetterRepository,
} from '@lib/portal-lib/konstructor';
import {
    OfferLetterImportItemDto,
    OfferLetterImportStatusEnum,
    OfferLettersImportDto,
    OfferLettersImportResponseDto,
} from '../dto/offer-letters-import.dto';
import {
    LEGACY_PORTAL_LETTER_NAME,
    planLegacyLetter,
} from '../lib/offer-letters-import.util';

const itemOf = (
    letter: LegacyOfferLetter,
    status: OfferLetterImportStatusEnum,
    isDefault: boolean,
): OfferLetterImportItemDto => ({
    portalId: letter.portalId,
    domain: letter.domain,
    legacyFieldId: letter.fieldId,
    length: letter.text.length,
    enabled: letter.enabled,
    isDefault,
    status,
});

/**
 * Временный перенос писем КП порталов из легаси-шаблонов `offer`
 * (`templates` → `fields`, поле `letter`) в `offer_letters`. После переноса
 * ручку можно удалить.
 *
 * Перенесённое помечается `legacyFieldId`: повторный запуск ничего не
 * дублирует. Письмо становится письмом портала по умолчанию, если у портала
 * такого ещё нет.
 */
@Injectable()
export class OfferLettersImportService {
    private readonly logger = new Logger(OfferLettersImportService.name);

    constructor(private readonly letters: OfferLetterRepository) {}

    async importLegacy(
        dto: OfferLettersImportDto,
    ): Promise<OfferLettersImportResponseDto> {
        const dryRun = dto.dryRun ?? true;
        const legacy = await this.letters.findLegacyPortalLetters();
        const imported = new Set(
            await this.letters.findImportedLegacyFieldIds(
                legacy.map(letter => letter.fieldId),
            ),
        );
        // порталы, которые получили письмо по умолчанию в этом запуске
        const defaulted = new Set<number>();
        const items: OfferLetterImportItemDto[] = [];

        for (const letter of legacy) {
            const plan = planLegacyLetter(letter, imported);
            if (plan !== 'create') {
                const status =
                    plan === 'exists'
                        ? OfferLetterImportStatusEnum.EXISTS
                        : OfferLetterImportStatusEnum.EMPTY;
                items.push(itemOf(letter, status, false));
                continue;
            }
            const isDefault =
                !defaulted.has(letter.portalId) &&
                !(await this.hasPortalDefault(letter.portalId));
            if (isDefault) defaulted.add(letter.portalId);
            if (dryRun) {
                items.push(
                    itemOf(
                        letter,
                        OfferLetterImportStatusEnum.WOULD_CREATE,
                        isDefault,
                    ),
                );
                continue;
            }
            await this.letters.create({
                portalId: letter.portalId,
                bxUserId: null,
                name: LEGACY_PORTAL_LETTER_NAME,
                text: letter.text,
                isDefault,
                legacyFieldId: letter.fieldId,
            });
            imported.add(letter.fieldId);
            items.push(
                itemOf(letter, OfferLetterImportStatusEnum.CREATED, isDefault),
            );
        }

        const created = items.filter(
            item => item.status === OfferLetterImportStatusEnum.CREATED,
        ).length;
        this.logger.log(
            `Письма КП из легаси: найдено ${legacy.length}, создано ${created}${dryRun ? ' (сухой запуск)' : ''}`,
        );
        return { dryRun, created, items };
    }

    private async hasPortalDefault(portalId: number): Promise<boolean> {
        const letters = await this.letters.findByPortal(portalId);
        return letters.some(
            letter => letter.bxUserId === null && letter.isDefault,
        );
    }
}
