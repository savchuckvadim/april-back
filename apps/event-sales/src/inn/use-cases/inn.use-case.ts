import { Injectable } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    InnDealService,
    InnPbxBitrix,
    resolveInnActor,
    runInnAction,
    setInnManually,
} from '@lib/portal-lib/pbx-inn';
import {
    ChooseInnRequestDto,
    HideInnRequestDto,
    InnAlignResponseDto,
    InnSnapshotResponseDto,
} from '../dto/inn.dto';
import { InnSetResponseDto, SetInnRequestDto } from '../dto/inn-set.dto';
import { OpenCardOnceGuard } from '../../shared/open-card-once';
import { InnLegacyFieldsResolver } from '../services/inn-legacy-fields.resolver';

/**
 * Сценарии вкладки «ИНН» фрейма отдела продаж.
 *
 * Доменная работа — в `@lib/portal-lib/pbx-inn`; здесь только получение
 * инстанса Битрикса по домену, подпись автора действия (`resolveInnActor`)
 * и перевод доменных ошибок в коды ответа (`runInnAction`): эти два шага
 * общие с konstructor и лежат в библиотеке.
 *
 * `this.bitrix` в поле НЕ хранится: инстанс свой на каждый домен и на
 * каждый запрос (CLAUDE.md) — инжектится только `PBXService`.
 */
@Injectable()
export class InnUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly once: OpenCardOnceGuard,
        private readonly legacyFields: InnLegacyFieldsResolver,
    ) {}

    /**
     * Снимок ИНН сделки. Пустую сторону текущего ИНН дописывает (с 06.10),
     * остальное — чтение.
     */
    async snapshot(
        dealId: number,
        domain: string,
    ): Promise<InnSnapshotResponseDto> {
        const { service } = await this.context(domain);
        return runInnAction(() => service.snapshot(dealId));
    }

    /**
     * Выровнять текущий ИНН сделки без вкладки (лёгкое чтение). Недавно
     * выравнивали — не повторяем (OpenCardOnceGuard), отметка после успеха.
     */
    async align(dealId: number, domain: string): Promise<InnAlignResponseDto> {
        const scope = { action: 'inn-align' as const, domain, dealId };
        if (await this.once.isRecent(scope)) {
            return { current: null, warnings: [], skipped: true };
        }
        const { service } = await this.context(domain);
        const result = await runInnAction(() => service.align(dealId));
        await this.once.remember(scope);
        return {
            current: result.current || null,
            warnings: result.warnings,
            skipped: false,
        };
    }

    /** Выбрать текущий ИНН договора (или добавить новый и выбрать его). */
    async choose(
        dealId: number,
        dto: ChooseInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        const { service, bitrix } = await this.context(dto.domain);
        const actor = await resolveInnActor(bitrix, dto.userId);
        return runInnAction(() =>
            service.choose(dealId, {
                inn: dto.inn,
                version: dto.version,
                actor,
            }),
        );
    }

    /**
     * ИНН из шапки «Звонков»: открытая сделка — как «Выбрать» во вкладке,
     * иначе компания или заявка. Сценарий общий с konstructor и живёт в
     * `setInnManually` (`@lib/portal-lib/pbx-inn`).
     */
    async set(dto: SetInnRequestDto): Promise<InnSetResponseDto> {
        return setInnManually(this.pbx, dto);
    }

    /** Скрыть вариант ИНН или вернуть его обратно в список. */
    async hide(
        dealId: number,
        dto: HideInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        const { service, bitrix } = await this.context(dto.domain);
        const actor = await resolveInnActor(bitrix, dto.userId);
        return runInnAction(() =>
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
     * Старые поля портала с ИНН (настройка) — сразу в сервис: вкладка и
     * выравнивание видят их значения на лету.
     */
    private async context(
        domain: string,
    ): Promise<{ bitrix: InnPbxBitrix; service: InnDealService }> {
        const [{ bitrix, PortalModel }, legacy] = await Promise.all([
            this.pbx.init(domain),
            this.legacyFields.resolve(domain),
        ]);
        return {
            bitrix,
            service: new InnDealService(bitrix, PortalModel, domain, legacy),
        };
    }
}
