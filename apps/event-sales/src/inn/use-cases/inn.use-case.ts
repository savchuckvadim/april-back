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
    InnManualSetService,
    InnNoTargetError,
    InnVersionConflictError,
} from '@lib/portal-lib/pbx-inn';
import {
    ChooseInnRequestDto,
    HideInnRequestDto,
    InnAlignResponseDto,
    InnSnapshotResponseDto,
} from '../dto/inn.dto';
import { InnSetResponseDto, SetInnRequestDto } from '../dto/inn-set.dto';

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

    /**
     * Снимок ИНН сделки. Пустую сторону текущего ИНН дописывает (с 06.10),
     * остальное — чтение.
     */
    async snapshot(
        dealId: number,
        domain: string,
    ): Promise<InnSnapshotResponseDto> {
        const { service } = await this.context(domain);
        return this.run(() => service.snapshot(dealId));
    }

    /** Выровнять текущий ИНН сделки без вкладки (лёгкое чтение). */
    async align(dealId: number, domain: string): Promise<InnAlignResponseDto> {
        const { service } = await this.context(domain);
        const result = await this.run(() => service.align(dealId));
        return { current: result.current || null, warnings: result.warnings };
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

    /**
     * ИНН из шапки «Звонков»: открытая сделка — как «Выбрать» во вкладке,
     * иначе компания или заявка (InnManualSetService).
     */
    async set(dto: SetInnRequestDto): Promise<InnSetResponseDto> {
        const { bitrix, PortalModel } = await this.pbx.init(dto.domain);
        const actor = await this.actor(bitrix, dto.userId);
        const service = new InnManualSetService(
            bitrix,
            PortalModel,
            dto.domain,
        );
        return this.run(() =>
            service.set(
                {
                    dealId: dto.dealId,
                    companyId: dto.companyId,
                    leadId: dto.leadId,
                },
                dto.inn,
                actor,
            ),
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
    private async run<T>(action: () => Promise<T>): Promise<T> {
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
            if (
                error instanceof InnInvalidValueError ||
                error instanceof InnNoTargetError
            ) {
                throw new BadRequestException(error.message);
            }
            throw error;
        }
    }
}
