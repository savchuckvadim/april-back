import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    CLIENT_TYPE_CODES,
    CLIENT_TYPE_FIELD_CODE,
    ClientTypeCode,
    ClientTypeEntity,
} from './client-type.const';

interface IEntityField {
    ufName: string;
    /** bitrixId варианта → код и обратно: у сделки и компании id разные. */
    codeById: Map<string, ClientTypeCode>;
    idByCode: Map<ClientTypeCode, number>;
}

const isClientTypeCode = (code: string): code is ClientTypeCode =>
    (CLIENT_TYPE_CODES as readonly string[]).includes(code);

/**
 * Поле «Тип Клиента» у сделки и компании через `PortalModel`.
 *
 * Значение enumeration-поля в Битриксе — id варианта, и у сделки и компании
 * эти id РАЗНЫЕ (на garant «Бюджетники» — 5473 у сделки и 5695 у компании).
 * Поэтому сравниваем и переносим только по коду варианта, никогда по id или
 * тексту (ai/rules/pbx-typing.md). Поля нет на портале — null у сущности.
 */
export class ClientTypeFieldMap {
    private constructor(
        private readonly fields: Record<ClientTypeEntity, IEntityField | null>,
    ) {}

    static from(portal: PortalModel): ClientTypeFieldMap {
        const resolve = (entity: ClientTypeEntity): IEntityField | null => {
            const field = portal.getEntityFieldByCode(
                entity,
                CLIENT_TYPE_FIELD_CODE,
            );
            if (!field) return null;
            const codeById = new Map<string, ClientTypeCode>();
            const idByCode = new Map<ClientTypeCode, number>();
            for (const item of field.items ?? []) {
                if (!isClientTypeCode(item.code) || !item.bitrixId) continue;
                codeById.set(String(item.bitrixId), item.code);
                idByCode.set(item.code, Number(item.bitrixId));
            }
            return {
                ufName: portal.getFieldBitrixId(field),
                codeById,
                idByCode,
            };
        };
        return new ClientTypeFieldMap({
            deal: resolve('deal'),
            company: resolve('company'),
        });
    }

    /** UF-имя поля у сущности; поля нет — null. */
    ufName(entity: ClientTypeEntity): string | null {
        return this.fields[entity]?.ufName ?? null;
    }

    /** Код варианта по сырому значению строки Битрикса; пусто — null. */
    codeOf(
        entity: ClientTypeEntity,
        row: Record<string, unknown> | null,
    ): ClientTypeCode | null {
        const field = this.fields[entity];
        if (!field || !row) return null;
        // Значение enumeration — id варианта строкой или числом.
        const raw = row[field.ufName];
        if (typeof raw !== 'string' && typeof raw !== 'number') return null;
        return field.codeById.get(String(raw)) ?? null;
    }

    /** Id варианта у сущности по коду; поля или варианта нет — null. */
    valueOf(entity: ClientTypeEntity, code: ClientTypeCode): number | null {
        return this.fields[entity]?.idByCode.get(code) ?? null;
    }
}
