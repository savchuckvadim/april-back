import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import {
    buildMethodologyCatalog,
    type MethodologyCatalog,
} from './methodology-catalog.const';
import { MethodologyRegistryService } from './methodology-registry.service';
import {
    MethodologyRepository,
    type MethodologyRow,
    type MethodologyUpsert,
} from './methodology.repository';
import {
    parseMethodology,
    type MethodologyParseResult,
} from './methodology.validator';
import {
    methodologyVersionTag,
    type Methodology,
    type MethodologyScope,
    type MethodologySource,
} from './methodology.types';
import { BUILTIN_METHODOLOGIES } from './polyansky.methodology';

/** Строка списка методик в админке: таблица или встроенная (id null). */
export interface MethodologyListItem {
    id: string | null;
    code: string;
    title: string;
    version: string;
    scope: MethodologyScope;
    portalDomain: string | null;
    source: MethodologySource;
    isActive: boolean;
    updatedAt: Date | null;
    updatedBy: string | null;
    /** Конфиг строки проходит проверку; у встроенной — всегда true. */
    valid: boolean;
    checkpoints: number;
    caps: number;
}

/** Полная методика для формы: строка (или встроенная) плюс конфиг. */
export interface MethodologyDetail extends MethodologyListItem {
    config: Methodology;
    /** Ошибки проверки конфига строки (пусто — валиден). */
    errors: string[];
    versionTag: string;
}

export interface MethodologyValidation {
    ok: boolean;
    errors: string[];
    /** Сводка валидного конфига; null при ошибках. */
    summary: {
        code: string;
        title: string;
        version: string;
        types: string[];
        checkpoints: number;
        caps: number;
        spiralsEnabled: boolean;
    } | null;
}

export interface MethodologySaveInput {
    id: string | null;
    scope: MethodologyScope;
    portalDomain: string | null;
    isActive: boolean;
    /** Конфиг методики; code/title/version берутся из него же. */
    config: unknown;
    updatedBy: string | null;
}

/**
 * Админ-операции над методиками: список (таблица + встроенные), карточка,
 * проверка конфига, сохранение строки таблицы с проверкой и сбросом кэша
 * реестра, каталог для формы-брифа. `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class MethodologyAdminService {
    private readonly logger = new Logger(MethodologyAdminService.name);

    constructor(
        private readonly repository: MethodologyRepository,
        private readonly registry: MethodologyRegistryService,
    ) {}

    catalog(): MethodologyCatalog {
        return buildMethodologyCatalog();
    }

    /** Все строки таблицы (общие и портала, включая выключенные) плюс встроенные без строки с тем же кодом в общем слое. */
    async list(domain: string | null): Promise<MethodologyListItem[]> {
        const rows = await this.repository.listRows(domain);
        const items = rows.map(row => this.itemOf(row));
        const commonCodes = new Set(
            rows.filter(row => row.scope === 'common').map(row => row.code),
        );
        for (const methodology of Object.values(BUILTIN_METHODOLOGIES)) {
            if (commonCodes.has(methodology.code)) continue;
            items.push(builtinItem(methodology));
        }
        return items.sort(
            (left, right) =>
                left.scope.localeCompare(right.scope) ||
                left.title.localeCompare(right.title, 'ru'),
        );
    }

    /** Карточка строки по id; встроенная — по коду с id null. */
    async detail(
        id: string | null,
        code: string | null,
    ): Promise<MethodologyDetail> {
        if (id !== null) {
            const row = await this.repository.findById(id);
            if (!row) throw new NotFoundException(`Методика ${id} не найдена`);
            return this.detailOf(row);
        }
        const builtin =
            code === null ? null : (BUILTIN_METHODOLOGIES[code] ?? null);
        if (!builtin) {
            throw new NotFoundException(
                `Встроенной методики «${code ?? ''}» нет`,
            );
        }
        return {
            ...builtinItem(builtin),
            config: builtin,
            errors: [],
            versionTag: methodologyVersionTag(builtin),
        };
    }

    validate(config: unknown): MethodologyValidation {
        const parsed = parseMethodology(config);
        if (!parsed.ok)
            return { ok: false, errors: parsed.errors, summary: null };
        const value = parsed.value;
        return {
            ok: true,
            errors: [],
            summary: {
                code: value.code,
                title: value.title,
                version: value.version,
                types: [...value.types],
                checkpoints: value.checkpoints.length,
                caps: value.caps.length,
                spiralsEnabled: value.spirals.enabled,
            },
        };
    }

    /**
     * Сохранить строку: конфиг обязан пройти проверку; своя методика портала
     * требует домен; кэш реестра сбрасывается, чтобы разбор увидел правку
     * сразу. Дубль кода в слое — 409.
     */
    async save(input: MethodologySaveInput): Promise<MethodologyDetail> {
        const parsed = parseMethodology(input.config);
        if (!parsed.ok) {
            throw new ConflictException({
                message: 'Конфиг методики не прошёл проверку',
                errors: parsed.errors,
            });
        }
        if (input.scope === 'portal' && !input.portalDomain) {
            throw new ConflictException(
                'Своей методике портала нужен домен портала',
            );
        }
        const upsert: MethodologyUpsert = {
            id: input.id,
            code: parsed.value.code,
            title: parsed.value.title,
            version: parsed.value.version,
            scope: input.scope,
            portalDomain: input.scope === 'portal' ? input.portalDomain : null,
            config: JSON.parse(JSON.stringify(parsed.value)) as unknown,
            isActive: input.isActive,
            updatedBy: input.updatedBy,
        };
        const row = await this.repository.upsert(upsert);
        this.registry.invalidate();
        this.logger.log(
            `Методика «${row.code}» ${row.version} (${row.scope}${row.portalDomain ? `, ${row.portalDomain}` : ''}) сохранена ${input.updatedBy ?? ''}`.trim(),
        );
        return this.detailOf(row);
    }

    private itemOf(row: MethodologyRow): MethodologyListItem {
        const parsed = parseMethodology(row.config);
        return {
            id: row.id,
            code: row.code,
            title: row.title,
            version: row.version,
            scope: row.scope,
            portalDomain: row.portalDomain,
            source: 'table',
            isActive: row.isActive,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
            valid: parsed.ok,
            checkpoints: parsed.ok ? parsed.value.checkpoints.length : 0,
            caps: parsed.ok ? parsed.value.caps.length : 0,
        };
    }

    private detailOf(row: MethodologyRow): MethodologyDetail {
        const parsed: MethodologyParseResult = parseMethodology(row.config);
        const config: Methodology = parsed.ok
            ? {
                  ...parsed.value,
                  code: row.code,
                  title: row.title,
                  version: row.version,
              }
            : (BUILTIN_METHODOLOGIES[row.code] ?? emptyMethodology(row));
        return {
            ...this.itemOf(row),
            config,
            errors: parsed.ok ? [] : parsed.errors,
            versionTag: methodologyVersionTag(config),
        };
    }
}

const builtinItem = (methodology: Methodology): MethodologyListItem => ({
    id: null,
    code: methodology.code,
    title: methodology.title,
    version: methodology.version,
    scope: 'common',
    portalDomain: null,
    source: 'builtin',
    isActive: true,
    updatedAt: null,
    updatedBy: null,
    valid: true,
    checkpoints: methodology.checkpoints.length,
    caps: methodology.caps.length,
});

/** Каркас методики для формы, когда конфиг строки битый и встроенного нет. */
const emptyMethodology = (row: MethodologyRow): Methodology => ({
    code: row.code,
    title: row.title,
    version: row.version,
    types: [],
    principles: [],
    checkpoints: [],
    caps: [],
    spirals: { enabled: false, minFull: 0, types: [] },
});
