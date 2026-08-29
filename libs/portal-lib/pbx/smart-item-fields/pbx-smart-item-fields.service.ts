import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';

/** Элемент справочника поля элемента: id — ровно то, что уходит в запись. */
export interface SmartItemFieldItem {
    /** Числовой идентификатор значения (Битрикс ждёт именно его). */
    id: number;
    /** Подпись значения ровно как её показывает портал. */
    value: string;
}

/** Живое поле элемента смарта в двух именах сразу. */
export interface SmartItemField {
    /**
     * ФАКТИЧЕСКИЙ ключ `crm.item` (camel) — его и только его примет
     * `crm.item.add` / `crm.item.update`.
     */
    key: string;
    /** UF-имя (`meta.upperName`) — якорь портального каталога анкет. */
    upperName: string;
    /** `userTypeId` поля: string, date, enumeration и т.д. */
    type: string;
    isMultiple: boolean;
    /** Подпись поля в карточке — только для внятных предупреждений. */
    title: string;
    /** Элементы списка; у неперечислимых полей — пустой массив. */
    items: SmartItemFieldItem[];
}

/** Карта живых полей одного смарта. */
export interface SmartItemFields {
    entityTypeId: number;
    /** Ключ — UF-имя, нормализованное {@link normalizeSmartFieldName}. */
    byNormalizedName: Record<string, SmartItemField>;
}

/** Запись кэша: null (не прочитали) кэшируется тоже. */
interface SmartItemFieldsCacheEntry {
    fields: SmartItemFields | null;
    expiresAt: number;
}

/** TTL кэша: поля смарта правят руками редко, 10 минут — безопасный лаг. */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Имя поля без подчёркиваний и регистра.
 *
 * Тот же приём, которым `PbxPresentationSmartService` уже ловит боевой
 * инцидент `UF_CRM_94_TRANSCRIPT_1`: сравнивать имена буква в букву нельзя —
 * портал и Битрикс расходятся в подчёркиваниях и регистре, а имя поля
 * это ЯКОРЬ каталога анкет.
 */
export const normalizeSmartFieldName = (name: string): string =>
    name.replace(/_/g, '').toLowerCase();

/** Поле по UF-имени; неизвестное имя — undefined. */
export const findSmartItemField = (
    fields: SmartItemFields,
    upperName: string,
): SmartItemField | undefined =>
    fields.byNormalizedName[normalizeSmartFieldName(upperName)];

/**
 * ЖИВЫЕ поля элемента смарта: «UF-имя ↔ фактический camel-ключ ↔ элементы
 * списка» за один вызов `crm.item.fields`.
 *
 * Зачем сервис вообще нужен. Портальная анкета привязывает вопрос к
 * ПРОИЗВОЛЬНОМУ полю смарта и хранит его UF-имя — а `crm.item.add/update`
 * принимает camel-ключ, и собрать его формулой нельзя (боевой инцидент
 * `UF_CRM_94_TRANSCRIPT_1`: Битрикс дал полю имя, которого формула не
 * предскажет). `resolveInfo` смарта знает camel-ключи только НАШИХ
 * константных полей — поля, заведённого владельцем руками, там нет.
 * Поэтому правду читаем у самого Битрикса.
 *
 * Метод зовётся БЕЗ `useOriginalUfNames`: тогда ключи ответа — те самые
 * фактические camel-ключи, а `meta.upperName` в каждом описателе —
 * оригинальное UF-имя. Оба имени приезжают одним запросом, и переключать
 * режим всего запроса (а с ним и ключи, которые мы кладём в `fields`) не
 * приходится.
 *
 * Кэш 10 минут по паре (домен, entityTypeId), `null` кэшируется тоже.
 * Fail-open: не прочитали — вернём null, и потребитель просто НЕ ПИШЕТ
 * ответы (warn), вместо того чтобы писать их наугад.
 *
 * Сервис общий (а не приватный внутри потока) намеренно: следующим заходом
 * «живая правда» (переименованное поле, изменившийся справочник) читается
 * этим же кодом.
 */
@Injectable()
export class PbxSmartItemFieldsService {
    private readonly logger = new Logger(PbxSmartItemFieldsService.name);

    private readonly cache = new Map<string, SmartItemFieldsCacheEntry>();

    constructor(private readonly pbxService: PBXService) {}

    /** Живые поля смарта; null — прочитать не удалось. */
    async resolveFields(
        domain: string,
        entityTypeId: number,
    ): Promise<SmartItemFields | null> {
        const cacheKey = `${domain}:${entityTypeId}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return cached.fields;

        const fields = await this.loadFields(domain, entityTypeId);
        this.cache.set(cacheKey, {
            fields,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return fields;
    }

    /** Сброс кэша домена — шаг установщика полей смарта. */
    invalidate(domain: string): void {
        for (const key of [...this.cache.keys()]) {
            if (key.startsWith(`${domain}:`)) this.cache.delete(key);
        }
    }

    private async loadFields(
        domain: string,
        entityTypeId: number,
    ): Promise<SmartItemFields | null> {
        try {
            const { bitrix } = await this.pbxService.init(domain);
            const response = (await bitrix.item.fields(entityTypeId)) as {
                result?: { fields?: Record<string, unknown> };
            } | null;
            const raw = response?.result?.fields ?? {};

            const byNormalizedName: Record<string, SmartItemField> = {};
            for (const [key, meta] of Object.entries(raw)) {
                const field = this.toField(key, meta);
                if (!field) continue;
                byNormalizedName[normalizeSmartFieldName(field.upperName)] =
                    field;
            }
            return { entityTypeId, byNormalizedName };
        } catch (error) {
            this.logger.warn(
                `crm.item.fields не прочитан (${domain}, ${entityTypeId}): ` +
                    `${(error as Error).message} — ответы анкеты в элемент ` +
                    'не пишутся',
            );
            return null;
        }
    }

    /** Описатель Битрикса → поле; без UF-имени поле нам бесполезно. */
    private toField(key: string, meta: unknown): SmartItemField | null {
        if (!meta || typeof meta !== 'object') return null;
        const row = meta as Record<string, unknown>;
        // upperName приходит только у пользовательских полей — штатные
        // (title, stageId) якорем анкеты быть не могут по определению.
        const upperName = this.toText(row.upperName);
        if (!upperName) return null;
        return {
            key,
            upperName,
            type: this.toText(row.type),
            isMultiple: row.isMultiple === true,
            title: this.toText(row.title) || upperName,
            items: this.toItems(row.items),
        };
    }

    private toItems(value: unknown): SmartItemFieldItem[] {
        if (!Array.isArray(value)) return [];
        const items: SmartItemFieldItem[] = [];
        for (const raw of value) {
            if (!raw || typeof raw !== 'object') continue;
            const row = raw as Record<string, unknown>;
            const id = Number(row.ID ?? row.id);
            if (!Number.isFinite(id) || id <= 0) continue;
            items.push({ id, value: this.toText(row.VALUE ?? row.value) });
        }
        return items;
    }

    private toText(value: unknown): string {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return String(value);
        return '';
    }
}
