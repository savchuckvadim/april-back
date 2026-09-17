import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    IInnActor,
    InnDealClosedError,
    InnDealNotFoundError,
    InnDealService,
    InnHideCurrentError,
    InnInvalidValueError,
    InnVersionConflictError,
} from '@lib/portal-lib/pbx-inn';
import {
    ChooseInnRequestDto,
    HideInnRequestDto,
    InnSnapshotResponseDto,
} from '../dto/inn.dto';

/** Инстанс Битрикса ровно в том виде, в каком его отдаёт `PBXService`. */
type PbxBitrix = Awaited<ReturnType<PBXService['init']>>['bitrix'];

/**
 * Сценарии вкладки «ИНН» фрейма отдела продаж.
 *
 * Доменная работа — в `@lib/portal-lib/pbx-inn`; здесь только получение
 * инстанса Битрикса по домену, подпись автора действия и перевод доменных
 * ошибок в коды ответа.
 *
 * `this.bitrix` в поле НЕ хранится: инстанс свой на каждый домен и на
 * каждый запрос (CLAUDE.md) — инжектится только `PBXService`.
 */
@Injectable()
export class InnUseCase {
    constructor(private readonly pbx: PBXService) {}

    /** Снимок ИНН сделки. Чтение: ничего не пишет. */
    async snapshot(
        dealId: number,
        domain: string,
    ): Promise<InnSnapshotResponseDto> {
        const { service } = await this.context(domain);
        return this.run(() => service.snapshot(dealId));
    }

    /** Выбрать текущий ИНН договора (или добавить новый и выбрать его). */
    async choose(
        dealId: number,
        dto: ChooseInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        const { service, bitrix } = await this.context(dto.domain);
        const actor = await this.actor(bitrix, dto.userId);
        return this.run(() =>
            service.choose(dealId, {
                inn: dto.inn,
                version: dto.version,
                actor,
            }),
        );
    }

    /** Скрыть вариант ИНН или вернуть его обратно в список. */
    async hide(
        dealId: number,
        dto: HideInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        const { service, bitrix } = await this.context(dto.domain);
        const actor = await this.actor(bitrix, dto.userId);
        return this.run(() =>
            service.hide(dealId, {
                inn: dto.inn,
                actor,
                restore: dto.restore === true,
            }),
        );
    }

    /* ------------------------------------------------------------------ */

    /**
     * Инстанс Битрикса и доменный сервис на один запрос. `init` зовём ОДИН
     * раз: он тянет слепок портала, и второй вызов был бы лишней работой.
     */
    private async context(
        domain: string,
    ): Promise<{ bitrix: PbxBitrix; service: InnDealService }> {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        return {
            bitrix,
            service: new InnDealService(bitrix, PortalModel, domain),
        };
    }

    /**
     * Подпись автора для таймлайна. Имя берём у портала, а не у фронта:
     * запись «кто выбрал» должна быть достоверной.
     */
    private async actor(
        bitrix: PbxBitrix,
        userId: number | undefined,
    ): Promise<IInnActor> {
        if (!userId) return { id: null, name: '' };
        try {
            const response = await bitrix.user.get({ ID: userId }, [
                'ID',
                'NAME',
                'LAST_NAME',
            ]);
            const row = Array.isArray(response?.result)
                ? response.result[0]
                : null;
            const name = [row?.LAST_NAME, row?.NAME]
                .map(part => String(part ?? '').trim())
                .filter(Boolean)
                .join(' ');
            return { id: userId, name };
        } catch {
            // Имя не прочиталось — запись всё равно должна состояться.
            return { id: userId, name: '' };
        }
    }

    /** Доменные ошибки → коды ответа: 404, 409, 400. */
    private async run(
        action: () => Promise<InnSnapshotResponseDto>,
    ): Promise<InnSnapshotResponseDto> {
        try {
            return await action();
        } catch (error) {
            if (error instanceof InnDealNotFoundError) {
                throw new NotFoundException(error.message);
            }
            if (
                error instanceof InnVersionConflictError ||
                error instanceof InnDealClosedError ||
                error instanceof InnHideCurrentError
            ) {
                throw new ConflictException(error.message);
            }
            if (error instanceof InnInvalidValueError) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
    }
}
