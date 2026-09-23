import 'reflect-metadata';

import * as agendaDto from '../dto/ai-agenda.dto';
import * as attentionDto from '../dto/ai-attention.dto';
import * as aboutModelDto from '../dto/ai-about-model.dto';
import * as aboutDto from '../dto/ai-about.dto';
import * as briefDto from '../dto/ai-brief.dto';
import * as dailyPlanPartsDto from '../dto/ai-daily-plan-parts.dto';
import * as dailyPlanDto from '../dto/ai-daily-plan.dto';
import * as dossierPartsDto from '../dto/ai-dossier-parts.dto';
import * as dossierDto from '../dto/ai-dossier.dto';
import * as feedbackListDto from '../dto/ai-feedback-list.dto';
import * as managerRowDto from '../dto/ai-manager-row.dto';
import * as managerSignalsDto from '../dto/ai-manager-signals.dto';
import * as objectionsDto from '../dto/ai-objections.dto';
import * as planFactDto from '../dto/ai-plan-fact.dto';
import * as pulseDto from '../dto/ai-pulse.dto';
import * as pushDto from '../dto/ai-push.dto';
import * as ropMarkRequestDto from '../dto/ai-rop-mark-request.dto';
import * as reviewDto from '../dto/ai-review.dto';
import * as ropMarkDto from '../dto/ai-rop-mark.dto';
import * as styleCardDto from '../dto/ai-style-card.dto';

/**
 * Находка N11 аудита (ai-phase2-audit-2026-09-14): у скалярных и enum-свойств
 * DTO вкладки не было `example`. Спек читает метаданные @nestjs/swagger у
 * реальных классов (а не текст файлов), поэтому примеры не могут тихо
 * пропасть при следующей правке декораторов. С волны C (поток 19) в списке
 * и DTO Фазы 2: резюме, план дня, карточка стиля, слепая проверка.
 */

const SWAGGER_PROPS_ARRAY = 'swagger/apiModelPropertiesArray';
const SWAGGER_PROPS = 'swagger/apiModelProperties';

/**
 * На момент закрытия N11 в восьми файлах 95 скалярных/enum-свойств.
 * Порог страхует от «зелёного по пустому списку»: если ключи метаданных
 * swagger изменятся и сбор вернёт пустоту, спек покраснеет.
 */
const MIN_SCALAR_PROPS = 60;

interface ApiPropertyMeta {
    readonly type?: unknown;
    readonly enum?: unknown;
    readonly example?: unknown;
    readonly examples?: unknown;
    readonly description?: unknown;
    readonly nullable?: unknown;
    readonly isArray?: unknown;
}

type DtoModule = Record<string, unknown>;

const MODULES: ReadonlyArray<readonly [string, DtoModule]> = [
    ['ai-agenda.dto', agendaDto],
    ['ai-attention.dto', attentionDto],
    ['ai-feedback-list.dto', feedbackListDto],
    ['ai-manager-row.dto', managerRowDto],
    ['ai-manager-signals.dto', managerSignalsDto],
    ['ai-objections.dto', objectionsDto],
    ['ai-pulse.dto', pulseDto],
    ['ai-push.dto', pushDto],
    ['ai-brief.dto', briefDto],
    ['ai-daily-plan.dto', dailyPlanDto],
    ['ai-daily-plan-parts.dto', dailyPlanPartsDto],
    ['ai-style-card.dto', styleCardDto],
    ['ai-review', reviewDto],
    ['ai-rop-mark.dto', ropMarkDto],
    ['ai-rop-mark-request.dto', ropMarkRequestDto],
    ['ai-about.dto', aboutDto],
    ['ai-about-model.dto', aboutModelDto],
    // Фаза 3, поток П2 «реконсиляция план-факт».
    ['ai-plan-fact.dto', planFactDto],
    // Фаза 3, поток П4 «досье менеджера».
    ['ai-dossier.dto', dossierDto],
    ['ai-dossier-parts.dto', dossierPartsDto],
];

const SCALAR_CTORS: readonly unknown[] = [String, Number, Boolean];

function isScalarType(type: unknown): boolean {
    if (SCALAR_CTORS.includes(type)) {
        return true;
    }
    return (
        Array.isArray(type) &&
        type.length === 1 &&
        SCALAR_CTORS.includes(type[0])
    );
}

function matchesScalar(type: unknown, value: unknown): boolean {
    if (type === String) {
        return typeof value === 'string';
    }
    if (type === Number) {
        return typeof value === 'number';
    }
    if (type === Boolean) {
        return typeof value === 'boolean';
    }
    return true;
}

interface ScalarProp {
    readonly path: string;
    readonly meta: ApiPropertyMeta;
}

function collectScalarProps(): ScalarProp[] {
    const collected: ScalarProp[] = [];
    for (const [file, mod] of MODULES) {
        for (const [exportName, value] of Object.entries(mod)) {
            if (typeof value !== 'function') {
                continue;
            }
            const proto = (value as { prototype?: object }).prototype;
            if (!proto) {
                continue;
            }
            const names = (Reflect.getMetadata(SWAGGER_PROPS_ARRAY, proto) ??
                []) as readonly string[];
            for (const raw of names) {
                const prop = raw.replace(/^:/, '');
                const meta = (Reflect.getMetadata(SWAGGER_PROPS, proto, prop) ??
                    {}) as ApiPropertyMeta;
                if (isScalarType(meta.type) || meta.enum !== undefined) {
                    collected.push({
                        path: `${file} ${exportName}.${prop}`,
                        meta,
                    });
                }
            }
        }
    }
    return collected;
}

/** Значения примера: у массивного свойства — каждый элемент, иначе само. */
function exampleItems(meta: ApiPropertyMeta): unknown[] {
    if (meta.isArray === true && Array.isArray(meta.example)) {
        return meta.example as unknown[];
    }
    return [meta.example];
}

describe('Swagger-примеры DTO вкладки ai-analytics (находка N11)', () => {
    const scalars = collectScalarProps();

    it('метаданные swagger читаются: скаляров не меньше порога', () => {
        expect(scalars.length).toBeGreaterThanOrEqual(MIN_SCALAR_PROPS);
    });

    it('каждый файл из списка даёт хотя бы одно скалярное или enum-свойство', () => {
        const silent = MODULES.map(([file]) => file).filter(
            file => !scalars.some(({ path }) => path.startsWith(`${file} `)),
        );
        expect(silent).toEqual([]);
    });

    it('у каждого скалярного и enum-свойства есть example', () => {
        const without = scalars
            .filter(
                ({ meta }) =>
                    meta.example === undefined && meta.examples === undefined,
            )
            .map(({ path }) => path);
        expect(without).toEqual([]);
    });

    it('у каждого скалярного и enum-свойства есть описание по-русски', () => {
        const without = scalars
            .filter(
                ({ meta }) =>
                    typeof meta.description !== 'string' ||
                    !/[а-яё]/i.test(meta.description),
            )
            .map(({ path }) => path);
        expect(without).toEqual([]);
    });

    it('тип example совпадает с объявленным скалярным типом', () => {
        const mismatched = scalars
            .filter(({ meta }) => {
                if (meta.example === undefined) {
                    return false;
                }
                if (meta.example === null) {
                    return meta.nullable !== true;
                }
                // type: [String] swagger нормализует в type: String + isArray
                if (meta.isArray === true) {
                    return (
                        !Array.isArray(meta.example) ||
                        meta.example.some(
                            (item: unknown) => !matchesScalar(meta.type, item),
                        )
                    );
                }
                return !matchesScalar(meta.type, meta.example);
            })
            .map(({ path }) => path);
        expect(mismatched).toEqual([]);
    });

    it('значения example у enum-свойств входят в свой перечень (у массивов — каждый элемент)', () => {
        const outside = scalars
            .filter(({ meta }) => {
                if (meta.example === undefined || !Array.isArray(meta.enum)) {
                    return false;
                }
                if (meta.example === null) {
                    return meta.nullable !== true;
                }
                const allowed = meta.enum as readonly unknown[];
                return exampleItems(meta).some(item => !allowed.includes(item));
            })
            .map(({ path }) => path);
        expect(outside).toEqual([]);
    });
});
