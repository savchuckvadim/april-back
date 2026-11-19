import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { OfferLetterEntity, OfferLetterScope } from './offer-letter.entity';
import {
    OfferLetterRepository,
    UpdateOfferLetterData,
} from './offer-letter.repository';
import {
    findOfferLetterMarkupError,
    OFFER_LETTER_NAME_MAX_LENGTH,
    OFFER_LETTER_TEXT_MAX_LENGTH,
} from './lib/offer-letter-markup.util';
import {
    hasScopeDefaultFlags,
    lettersOfScope,
    pickScopeDefaultId,
} from './lib/offer-letter-scope.util';

export interface CreateOfferLetterInput {
    portalId: number;
    /** Не указан или null — письмо портала; задан — личное письмо менеджера */
    bxUserId?: number | null;
    name: string;
    text: string;
    isDefault?: boolean;
    /** По умолчанию письмо активно */
    isActive?: boolean;
    sort?: number;
}

export interface UpdateOfferLetterInput {
    name?: string;
    text?: string;
    isActive?: boolean;
    sort?: number;
}

/**
 * Письма КП: правила записи поверх репозитория.
 *
 * Письмо по умолчанию своё в каждой области (письма портала, личные письма
 * менеджера): оно активное, оно одно, и оно есть, пока в области есть активное
 * письмо. Правило держится самовосстановлением: после любой записи область
 * приводится в порядок. Новое первое активное письмо становится письмом по
 * умолчанию; если по умолчанию выключили или удалили, его место занимает
 * следующее активное по `sort`.
 */
@Injectable()
export class OfferLetterService {
    constructor(private readonly letters: OfferLetterRepository) {}

    /** Письма портала: портальные и личные, по порядку `sort` */
    list(portalId: number): Promise<OfferLetterEntity[]> {
        return this.letters.findByPortal(portalId);
    }

    async get(id: string): Promise<OfferLetterEntity> {
        const letter = await this.letters.findById(id);
        if (!letter) throw this.notFound(id);
        return letter;
    }

    async create(input: CreateOfferLetterInput): Promise<OfferLetterEntity> {
        const bxUserId = input.bxUserId ?? null;
        this.checkPortalId(input.portalId);
        this.checkBxUserId(bxUserId);
        const name = this.cleanName(input.name);
        const text = this.cleanText(input.text);
        const isActive = input.isActive ?? true;
        if (input.isDefault && !isActive) {
            throw new BadRequestException(
                'Неактивное письмо не может быть письмом по умолчанию.',
            );
        }
        if (!(await this.letters.portalExists(input.portalId))) {
            throw new NotFoundException(`Портал ${input.portalId} не найден.`);
        }

        const created = await this.letters.create({
            portalId: input.portalId,
            bxUserId,
            name,
            text,
            isDefault: false,
            isActive,
            sort: input.sort,
        });
        await this.syncScopeDefault(
            created,
            input.isDefault ? created.id : undefined,
        );
        return this.get(created.id);
    }

    async update(
        id: string,
        input: UpdateOfferLetterInput,
    ): Promise<OfferLetterEntity> {
        const current = await this.get(id);
        const patch: UpdateOfferLetterData = {};
        if (input.name !== undefined) patch.name = this.cleanName(input.name);
        if (input.text !== undefined) patch.text = this.cleanText(input.text);
        if (input.isActive !== undefined) patch.isActive = input.isActive;
        if (input.sort !== undefined) patch.sort = input.sort;
        if (!Object.keys(patch).length) return current;

        const updated = await this.letters.update(id, patch);
        if (!updated) throw this.notFound(id);
        await this.syncScopeDefault(updated);
        return this.get(id);
    }

    /** Сделать письмо письмом по умолчанию своей области; прежнее перестаёт им быть */
    async setDefault(id: string): Promise<OfferLetterEntity> {
        const letter = await this.get(id);
        if (!letter.isActive) {
            throw new BadRequestException(
                'Неактивное письмо нельзя назначить письмом по умолчанию: сначала включите его.',
            );
        }
        await this.syncScopeDefault(letter, letter.id);
        return this.get(id);
    }

    async remove(id: string): Promise<void> {
        const letter = await this.get(id);
        if (!(await this.letters.delete(id))) throw this.notFound(id);
        await this.syncScopeDefault(letter);
    }

    /** Приводит область письма к правилу: ровно одно активное письмо по умолчанию */
    private async syncScopeDefault(
        scope: OfferLetterScope,
        preferredId?: string,
    ): Promise<void> {
        const inScope = lettersOfScope(
            await this.letters.findByPortal(scope.portalId),
            scope,
        );
        const defaultId = pickScopeDefaultId(inScope, preferredId);
        if (hasScopeDefaultFlags(inScope, defaultId)) return;
        await this.letters.setScopeDefault(
            { portalId: scope.portalId, bxUserId: scope.bxUserId },
            defaultId,
        );
    }

    private checkPortalId(portalId: number): void {
        if (!Number.isInteger(portalId) || portalId < 1) {
            throw new BadRequestException('Портал указан неверно.');
        }
    }

    private checkBxUserId(bxUserId: number | null): void {
        if (
            bxUserId !== null &&
            (!Number.isInteger(bxUserId) || bxUserId < 1)
        ) {
            throw new BadRequestException('Менеджер указан неверно.');
        }
    }

    private cleanName(name: string): string {
        const cleaned = name.trim();
        if (!cleaned) {
            throw new BadRequestException('Название письма не заполнено.');
        }
        if (cleaned.length > OFFER_LETTER_NAME_MAX_LENGTH) {
            throw new BadRequestException(
                `Название письма длиннее ${OFFER_LETTER_NAME_MAX_LENGTH} знаков.`,
            );
        }
        return cleaned;
    }

    private cleanText(text: string): string {
        const cleaned = text.trim();
        if (!cleaned) {
            throw new BadRequestException('Текст письма не заполнен.');
        }
        if (cleaned.length > OFFER_LETTER_TEXT_MAX_LENGTH) {
            throw new BadRequestException(
                `Текст письма длиннее ${OFFER_LETTER_TEXT_MAX_LENGTH} знаков.`,
            );
        }
        const markupError = findOfferLetterMarkupError(cleaned);
        if (markupError) throw new BadRequestException(markupError);
        return cleaned;
    }

    private notFound(id: string): NotFoundException {
        return new NotFoundException(`Письмо ${id} не найдено.`);
    }
}
