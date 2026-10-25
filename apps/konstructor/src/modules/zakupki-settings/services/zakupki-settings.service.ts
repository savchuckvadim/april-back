import { Injectable, NotFoundException } from '@nestjs/common';
import { PortalStoreService } from '@lib/portal-lib/store/portal-store.service';
import {
    ZakupkiSettingsDto,
    ZakupkiSettingsSaveDto,
} from '../dto/zakupki-settings.dto';
import {
    DEFAULT_LETTER_TEXT,
    buildZakupkiProvidersForm,
    zakupkiValuesToColumns,
} from '../lib/zakupki-settings-form';
import {
    ZakupkiSettingsPrismaRepository,
    type ZakupkiSettingsRecord,
} from '../repositories/zakupki-settings.prisma.repository';

interface ResolveStatus {
    isFromUser: boolean;
    isDefault: boolean;
    isNew: boolean;
}

/**
 * Настройки «3 КП для торгов» — замена Laravel `konstructor/front/zakupki/*`.
 * Порядок поиска тот же: свои настройки пользователя → дефолт портала →
 * любая запись домена → создать дефолт. Дефолт удалить нельзя.
 */
@Injectable()
export class ZakupkiSettingsService {
    constructor(
        private readonly repository: ZakupkiSettingsPrismaRepository,
        private readonly portals: PortalStoreService,
    ) {}

    async resolve(
        domain: string,
        bxUserId: number,
    ): Promise<ZakupkiSettingsDto> {
        const own = await this.repository.findByDomainAndUser(domain, bxUserId);
        if (own)
            return this.toDto(own, {
                isFromUser: true,
                isDefault: Boolean(own.is_default),
                isNew: false,
            });

        const fallback =
            (await this.repository.findDefaultByDomain(domain)) ??
            (await this.repository.findAnyByDomain(domain));
        if (fallback)
            return this.toDto(fallback, {
                isFromUser: false,
                isDefault: true,
                isNew: false,
            });

        const created = await this.createDefault(domain);
        return this.toDto(created, {
            isFromUser: false,
            isDefault: true,
            isNew: true,
        });
    }

    /** Свои настройки пользователя: есть — обновить, нет — создать поверх дефолта портала. */
    async saveForUser(
        dto: ZakupkiSettingsSaveDto,
    ): Promise<ZakupkiSettingsDto> {
        const columns = zakupkiValuesToColumns(dto.values);
        const own = await this.repository.findByDomainAndUser(
            dto.domain,
            dto.bxUserId,
        );
        if (own) {
            const updated = await this.repository.update(own.id, {
                ...columns,
                ...(dto.name ? { name: dto.name } : {}),
                ...(dto.isOneDocument !== undefined
                    ? { is_one_document: dto.isOneDocument }
                    : {}),
            });
            return this.toDto(updated, {
                isFromUser: true,
                isDefault: Boolean(updated.is_default),
                isNew: false,
            });
        }
        const base =
            (await this.repository.findDefaultByDomain(dto.domain)) ??
            (await this.createDefault(dto.domain));
        const created = await this.repository.create({
            ...this.copyColumns(base),
            ...columns,
            portal_id: base.portal_id,
            domain: dto.domain,
            bxUserId: dto.bxUserId,
            name: dto.name ?? `Настройки пользователя ${dto.bxUserId}`,
            is_default: false,
            is_current: true,
            is_one_document: dto.isOneDocument ?? base.is_one_document,
        });
        return this.toDto(created, {
            isFromUser: true,
            isDefault: false,
            isNew: false,
        });
    }

    /** Настройки портала по умолчанию (их правит руководитель/суперпользователь). */
    async saveDefault(
        dto: ZakupkiSettingsSaveDto,
    ): Promise<ZakupkiSettingsDto> {
        const target =
            (await this.repository.findDefaultByDomain(dto.domain)) ??
            (await this.createDefault(dto.domain));
        const updated = await this.repository.update(target.id, {
            ...zakupkiValuesToColumns(dto.values),
            ...(dto.name ? { name: dto.name } : {}),
            ...(dto.isOneDocument !== undefined
                ? { is_one_document: dto.isOneDocument }
                : {}),
            is_default: true,
        });
        return this.toDto(updated, {
            isFromUser: false,
            isDefault: true,
            isNew: false,
        });
    }

    /** Свои настройки удаляются — пользователь возвращается к дефолту портала. */
    async deleteForUser(domain: string, bxUserId: number): Promise<boolean> {
        const own = await this.repository.findByDomainAndUser(domain, bxUserId);
        if (!own || own.is_default) return false;
        await this.repository.delete(own.id);
        return true;
    }

    private async createDefault(
        domain: string,
    ): Promise<ZakupkiSettingsRecord> {
        const portal = await this.portals.getPortalByDomain(domain);
        if (!portal) throw new NotFoundException(`Портал ${domain} не найден`);
        return this.repository.create({
            portal_id: BigInt(portal.id),
            domain,
            name: 'Настройки по умолчанию',
            provider1_letter_text: DEFAULT_LETTER_TEXT.provider1,
            provider2_letter_text: DEFAULT_LETTER_TEXT.provider2,
            is_default: true,
        });
    }

    /** Поля поставщиков дефолта — стартовое наполнение своих настроек. */
    private copyColumns(base: ZakupkiSettingsRecord) {
        const {
            id: _id,
            created_at: _c,
            updated_at: _u,
            portal_id: _p,
            bxUserId: _b,
            domain: _d,
            name: _n,
            is_default: _df,
            is_current: _cur,
            ...rest
        } = base;
        return rest;
    }

    private toDto(
        record: ZakupkiSettingsRecord,
        status: ResolveStatus,
    ): ZakupkiSettingsDto {
        return {
            id: Number(record.id),
            domain: record.domain ?? '',
            bxUserId: record.bxUserId ?? null,
            name: record.name ?? '',
            isOneDocument: record.is_one_document,
            providers: buildZakupkiProvidersForm(record),
            ...status,
        };
    }
}
