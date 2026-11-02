import { Injectable, Logger } from '@nestjs/common';
import { PortalAiSettingsService } from '@lib/portal-lib/store/ai-settings/portal-ai-settings.service';
import {
    MethodologyRepository,
    type MethodologyRow,
} from './methodology.repository';
import { parseMethodology } from './methodology.validator';
import {
    methodologyVersionTag,
    type Methodology,
    type MethodologyScope,
    type MethodologySource,
    type ResolvedMethodology,
} from './methodology.types';
import { BUILTIN_METHODOLOGIES } from './polyansky.methodology';

/** TTL кэша методики домена, мс — как у реестра типов звонков. */
const CACHE_TTL_MS = 60_000;

/** Методика в списке выбора админки: сводка без полного конфига. */
export interface MethodologyOption {
    code: string;
    title: string;
    version: string;
    scope: MethodologyScope;
    source: MethodologySource;
    types: string[];
    checkpoints: number;
    caps: number;
    spiralsEnabled: boolean;
}

const optionOf = (
    methodology: Methodology,
    scope: MethodologyScope,
    source: MethodologySource,
): MethodologyOption => ({
    code: methodology.code,
    title: methodology.title,
    version: methodology.version,
    scope,
    source,
    types: [...methodology.types],
    checkpoints: methodology.checkpoints.length,
    caps: methodology.caps.length,
    spiralsEnabled: methodology.spirals.enabled,
});

/**
 * Реестр методик — какая методика действует на портале:
 *
 * 1) настройка AI портала `methodologyCode` (пусто — методики нет, разбор
 *    идёт одним ядром);
 * 2) строка таблицы `ai_methodologies`: своя методика портала важнее
 *    общего слоя; конфиг проверяется валидатором, битый — предупреждение и
 *    откат на встроенный конфиг того же кода;
 * 3) встроенные конфиги кода (`polyansky`), когда таблицы или строки нет.
 *
 * Кэш в памяти 60 с на домен, `invalidate()` — после правок в админке.
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class MethodologyRegistryService {
    private readonly logger = new Logger(MethodologyRegistryService.name);
    private readonly cache = new Map<
        string,
        { resolved: ResolvedMethodology | null; expiresAt: number }
    >();

    constructor(
        private readonly repository: MethodologyRepository,
        private readonly portalAiSettings: PortalAiSettingsService,
    ) {}

    /** Встроенная методика общего слоя по коду; нет — null. */
    builtin(code: string): Methodology | null {
        return BUILTIN_METHODOLOGIES[code] ?? null;
    }

    /**
     * Методики, доступные порталу для выбора: встроенные общего слоя плюс
     * активные строки таблицы (общие и свои); строка таблицы с тем же кодом
     * перекрывает встроенную, своя — общую. Битый конфиг строки пропускается
     * с предупреждением. Для формы в админке.
     */
    async listOptions(domain: string): Promise<MethodologyOption[]> {
        const options = new Map<string, MethodologyOption>();
        for (const methodology of Object.values(BUILTIN_METHODOLOGIES)) {
            options.set(
                methodology.code,
                optionOf(methodology, 'common', 'builtin'),
            );
        }
        // listAvailable отдаёт общий слой раньше своего: своя строка портала
        // с тем же кодом ложится поверх.
        for (const row of await this.repository.listAvailable(domain)) {
            const resolved = this.fromRow(row);
            if (resolved === null) continue;
            options.set(
                resolved.methodology.code,
                optionOf(resolved.methodology, resolved.scope, 'table'),
            );
        }
        return [...options.values()].sort((left, right) =>
            left.title.localeCompare(right.title, 'ru'),
        );
    }

    /** Действующая методика портала; null — на портале методика не выбрана или не найдена. */
    async resolve(domain: string): Promise<ResolvedMethodology | null> {
        const cached = this.cache.get(domain);
        if (cached && cached.expiresAt > Date.now()) return cached.resolved;

        const code = await this.codeOf(domain);
        const resolved =
            code === null ? null : await this.resolveByCode(domain, code);
        this.cache.set(domain, {
            resolved,
            expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return resolved;
    }

    /** Методика по коду для домена (предпросмотр и форма в админке): таблица, иначе встроенная. */
    async resolveByCode(
        domain: string,
        code: string,
    ): Promise<ResolvedMethodology | null> {
        const row = await this.repository.findActive(code, domain);
        const fromRow = row === null ? null : this.fromRow(row);
        if (fromRow) return fromRow;

        const builtin = this.builtin(code);
        if (builtin) {
            return {
                methodology: builtin,
                scope: 'common',
                source: 'builtin',
                versionTag: methodologyVersionTag(builtin),
            };
        }
        this.logger.warn(
            `Методика «${code}» для ${domain} не найдена ни в таблице, ни среди встроенных — разбор без методики`,
        );
        return null;
    }

    /** Сброс кэша после правок методик или настроек портала; без домена — весь. */
    invalidate(domain?: string): void {
        if (domain === undefined) this.cache.clear();
        else this.cache.delete(domain);
    }

    /** Код методики из настроек AI портала; ошибка чтения — как «не выбрана». */
    private async codeOf(domain: string): Promise<string | null> {
        try {
            const record = await this.portalAiSettings.getByDomain(domain);
            const code = record?.methodologyCode?.trim() ?? '';
            return code === '' ? null : code;
        } catch (error) {
            this.logger.warn(
                `Настройки AI портала ${domain} не прочитаны (${(error as Error).message}) — разбор без методики`,
            );
            return null;
        }
    }

    /** Строка таблицы → методика; колонки строки важнее полей конфига. */
    private fromRow(row: MethodologyRow): ResolvedMethodology | null {
        const parsed = parseMethodology(row.config);
        if (!parsed.ok) {
            this.logger.warn(
                `Конфиг методики «${row.code}» (${row.scope}${row.portalDomain ? `, ${row.portalDomain}` : ''}) не прошёл проверку: ${parsed.errors.join('; ')} — берём встроенный конфиг`,
            );
            return null;
        }
        const methodology: Methodology = {
            ...parsed.value,
            code: row.code,
            title: row.title,
            version: row.version,
        };
        return {
            methodology,
            scope: row.scope,
            source: 'table',
            versionTag: methodologyVersionTag(methodology),
        };
    }
}
