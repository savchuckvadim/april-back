import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_SECTION_CODES,
    type CallReportCallTypeCode,
    type CallReportSectionCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { toCondition, validateCondition } from './methodology-condition';
import {
    ANCHOR_BANDS,
    CAP_MAX_MAX,
    CAP_MAX_MIN,
    CHECKPOINT_CODE_PATTERN,
    CHECKPOINT_EVIDENCE_KINDS,
    METHODOLOGY_CAP_TARGETS,
    METHODOLOGY_CODE_PATTERN,
    METHODOLOGY_VERSION_PATTERN,
    type Methodology,
    type MethodologyAnchors,
    type MethodologyCap,
    type MethodologyCheckpoint,
    type MethodologyRelevance,
} from './methodology.types';

/** Результат проверки конфига: методика либо список ошибок на русском. */
export type MethodologyParseResult =
    | { ok: true; value: Methodology }
    | { ok: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const isCallType = (value: unknown): value is CallReportCallTypeCode =>
    typeof value === 'string' &&
    (CALL_REPORT_CALL_TYPE_CODES as readonly string[]).includes(value);

const isSection = (value: unknown): value is CallReportSectionCode =>
    typeof value === 'string' &&
    (CALL_REPORT_SECTION_CODES as readonly string[]).includes(value);

/** Коды типов из массива: ошибки на чужие коды, пустой список — ошибка. */
function parseTypes(
    input: unknown,
    path: string,
    allowed: ReadonlySet<string> | null,
    errors: string[],
): CallReportCallTypeCode[] {
    if (!Array.isArray(input) || input.length === 0) {
        errors.push(`${path}: нужен непустой список типов звонков`);
        return [];
    }
    const types: CallReportCallTypeCode[] = [];
    for (const item of input) {
        if (!isCallType(item)) {
            errors.push(`${path}: неизвестный тип звонка «${String(item)}»`);
        } else if (allowed !== null && !allowed.has(item)) {
            errors.push(`${path}: тип «${item}» не входит в типы методики`);
        } else {
            types.push(item);
        }
    }
    return types;
}

function parseCheckpoints(
    input: unknown,
    allowedTypes: ReadonlySet<string>,
    errors: string[],
): MethodologyCheckpoint[] {
    if (!Array.isArray(input)) {
        errors.push('checkpoints: нужен список пунктов');
        return [];
    }
    const seen = new Set<string>();
    const codes = new Set(
        input.map(item =>
            isRecord(item) && typeof item.code === 'string' ? item.code : '',
        ),
    );
    const result: MethodologyCheckpoint[] = [];
    input.forEach((item, index) => {
        const path = `checkpoints[${index}]`;
        if (!isRecord(item)) {
            errors.push(`${path}: пункт должен быть объектом`);
            return;
        }
        const code = text(item.code);
        if (code === null || !CHECKPOINT_CODE_PATTERN.test(code)) {
            errors.push(
                `${path}.code: код пункта — латиница, цифры, точка, подчёркивание, дефис`,
            );
            return;
        }
        if (seen.has(code))
            errors.push(`${path}.code: пункт «${code}» повторяется`);
        seen.add(code);
        const title = text(item.title);
        if (title === null)
            errors.push(`${path}.title: нужна формулировка пункта`);
        const evidence = typeof item.evidence === 'string' ? item.evidence : '';
        if (
            !(CHECKPOINT_EVIDENCE_KINDS as readonly string[]).includes(evidence)
        ) {
            errors.push(
                `${path}.evidence: quote (с цитатой) или fact (факт разговора)`,
            );
        }
        if (typeof item.mandatory !== 'boolean') {
            errors.push(`${path}.mandatory: укажите true или false`);
        }
        const types = parseTypes(
            item.types,
            `${path}.types`,
            allowedTypes,
            errors,
        );
        const rule =
            item.rule === undefined
                ? undefined
                : parseConditions(item.rule, `${path}.rule`, codes, errors);
        const checkpoint: MethodologyCheckpoint = {
            code,
            title: title ?? '',
            types,
            evidence: evidence as MethodologyCheckpoint['evidence'],
            mandatory: item.mandatory === true,
        };
        const hint = text(item.hint);
        if (hint !== null) checkpoint.hint = hint;
        const product = text(item.product);
        if (product !== null) checkpoint.product = product;
        if (rule !== undefined) checkpoint.rule = rule;
        result.push(checkpoint);
    });
    return result;
}

function parseConditions(
    input: unknown,
    path: string,
    checkpointCodes: ReadonlySet<string>,
    errors: string[],
): MethodologyCap['when'] {
    if (!Array.isArray(input) || input.length === 0) {
        errors.push(`${path}: нужен непустой список условий`);
        return [];
    }
    const result: MethodologyCap['when'] = [];
    input.forEach((item, index) => {
        const found = validateCondition(
            item,
            `${path}[${index}]`,
            checkpointCodes,
        );
        if (found.length) errors.push(...found);
        else result.push(toCondition(item as Record<string, unknown>));
    });
    return result;
}

function parseCaps(
    input: unknown,
    allowedTypes: ReadonlySet<string>,
    checkpointCodes: ReadonlySet<string>,
    errors: string[],
): MethodologyCap[] {
    if (input === undefined) return [];
    if (!Array.isArray(input)) {
        errors.push('caps: нужен список ограничителей');
        return [];
    }
    const seen = new Set<string>();
    const result: MethodologyCap[] = [];
    input.forEach((item, index) => {
        const path = `caps[${index}]`;
        if (!isRecord(item)) {
            errors.push(`${path}: ограничитель должен быть объектом`);
            return;
        }
        const code = text(item.code);
        if (code === null || !CHECKPOINT_CODE_PATTERN.test(code)) {
            errors.push(
                `${path}.code: код ограничителя — латиница, цифры, точка, подчёркивание, дефис`,
            );
            return;
        }
        if (seen.has(code))
            errors.push(`${path}.code: ограничитель «${code}» повторяется`);
        seen.add(code);
        const title = text(item.title);
        if (title === null)
            errors.push(`${path}.title: нужна формулировка ограничителя`);
        const target = typeof item.target === 'string' ? item.target : '';
        if (!(METHODOLOGY_CAP_TARGETS as readonly string[]).includes(target)) {
            errors.push(
                `${path}.target: раздел (${CALL_REPORT_SECTION_CODES.join(', ')}) или total`,
            );
        }
        const max = item.max;
        if (
            typeof max !== 'number' ||
            !Number.isInteger(max) ||
            max < CAP_MAX_MIN ||
            max > CAP_MAX_MAX
        ) {
            errors.push(
                `${path}.max: целое от ${CAP_MAX_MIN} до ${CAP_MAX_MAX}`,
            );
        }
        const when = parseConditions(
            item.when,
            `${path}.when`,
            checkpointCodes,
            errors,
        );
        const cap: MethodologyCap = {
            code,
            title: title ?? '',
            when,
            target: target as MethodologyCap['target'],
            max: typeof max === 'number' ? max : CAP_MAX_MAX,
        };
        if (item.types !== undefined) {
            cap.types = parseTypes(
                item.types,
                `${path}.types`,
                allowedTypes,
                errors,
            );
        }
        result.push(cap);
    });
    return result;
}

function parseSpirals(
    input: unknown,
    allowedTypes: ReadonlySet<string>,
    errors: string[],
): Methodology['spirals'] {
    if (input === undefined) return { enabled: false, minFull: 0, types: [] };
    if (!isRecord(input) || typeof input.enabled !== 'boolean') {
        errors.push('spirals: нужен объект с полем enabled (true/false)');
        return { enabled: false, minFull: 0, types: [] };
    }
    const minFull = input.minFull ?? 0;
    if (
        typeof minFull !== 'number' ||
        !Number.isInteger(minFull) ||
        minFull < 0 ||
        minFull > 10
    ) {
        errors.push('spirals.minFull: целое от 0 до 10');
    }
    const types = input.enabled
        ? parseTypes(input.types, 'spirals.types', allowedTypes, errors)
        : [];
    return {
        enabled: input.enabled,
        minFull: typeof minFull === 'number' ? minFull : 0,
        types,
    };
}

function parseAnchors(
    input: unknown,
    errors: string[],
): MethodologyAnchors | undefined {
    if (input === undefined) return undefined;
    if (!isRecord(input)) {
        errors.push('sectionAnchors: нужен объект «раздел → полосы»');
        return undefined;
    }
    const anchors: MethodologyAnchors = {};
    for (const [section, bands] of Object.entries(input)) {
        if (!isSection(section)) {
            errors.push(`sectionAnchors: неизвестный раздел «${section}»`);
            continue;
        }
        if (!isRecord(bands)) {
            errors.push(
                `sectionAnchors.${section}: нужен объект «полоса → описание»`,
            );
            continue;
        }
        const parsed: Partial<Record<(typeof ANCHOR_BANDS)[number], string>> =
            {};
        for (const [band, value] of Object.entries(bands)) {
            if (!(ANCHOR_BANDS as readonly string[]).includes(band)) {
                errors.push(
                    `sectionAnchors.${section}: неизвестная полоса «${band}»`,
                );
            } else if (text(value) === null) {
                errors.push(
                    `sectionAnchors.${section}.${band}: нужно описание полосы`,
                );
            } else {
                parsed[band as (typeof ANCHOR_BANDS)[number]] =
                    text(value) ?? '';
            }
        }
        anchors[section] = parsed;
    }
    return anchors;
}

function parseRelevance(
    input: unknown,
    allowedTypes: ReadonlySet<string>,
    errors: string[],
): MethodologyRelevance | undefined {
    if (input === undefined) return undefined;
    if (!isRecord(input)) {
        errors.push('relevance: нужен объект «тип звонка → раздел → 0–100»');
        return undefined;
    }
    const relevance: MethodologyRelevance = {};
    for (const [type, sections] of Object.entries(input)) {
        if (!isCallType(type) || !allowedTypes.has(type)) {
            errors.push(`relevance: тип «${type}» не входит в типы методики`);
            continue;
        }
        if (!isRecord(sections)) {
            errors.push(`relevance.${type}: нужен объект «раздел → 0–100»`);
            continue;
        }
        const parsed: Partial<Record<CallReportSectionCode, number>> = {};
        for (const [section, value] of Object.entries(sections)) {
            if (!isSection(section)) {
                errors.push(
                    `relevance.${type}: неизвестный раздел «${section}»`,
                );
            } else if (
                typeof value !== 'number' ||
                !Number.isInteger(value) ||
                value < 0 ||
                value > 100
            ) {
                errors.push(`relevance.${type}.${section}: целое от 0 до 100`);
            } else {
                parsed[section] = value;
            }
        }
        relevance[type] = parsed;
    }
    return relevance;
}

function parseKnowledge(
    input: unknown,
    errors: string[],
): Record<string, string> | undefined {
    if (input === undefined) return undefined;
    if (!isRecord(input)) {
        errors.push('knowledge: нужен объект «kind базы знаний → слой»');
        return undefined;
    }
    const knowledge: Record<string, string> = {};
    for (const [kind, layer] of Object.entries(input)) {
        if (!CHECKPOINT_CODE_PATTERN.test(kind) || text(layer) === null) {
            errors.push(
                `knowledge.${kind}: kind и слой — латиница, цифры, дефис`,
            );
        } else {
            knowledge[kind] = text(layer) ?? '';
        }
    }
    return knowledge;
}

/**
 * Разбор и проверка JSON-конфига методики. Ошибки копятся все сразу — админ
 * правит форму за один заход. Лишние поля отбрасываются.
 */
export function parseMethodology(input: unknown): MethodologyParseResult {
    if (!isRecord(input)) {
        return { ok: false, errors: ['конфиг методики должен быть объектом'] };
    }
    const errors: string[] = [];
    const code = text(input.code);
    if (code === null || !METHODOLOGY_CODE_PATTERN.test(code)) {
        errors.push(
            'code: код методики — латиница, цифры и дефис, от 2 до 64 знаков',
        );
    }
    const title = text(input.title);
    if (title === null) errors.push('title: нужно название методики');
    const version = text(input.version) ?? '1.0.0';
    if (!METHODOLOGY_VERSION_PATTERN.test(version)) {
        errors.push('version: вид major.minor.patch, например 1.0.0');
    }
    const types = parseTypes(input.types, 'types', null, errors);
    const allowedTypes = new Set<string>(types);
    const principles = Array.isArray(input.principles)
        ? input.principles
              .filter((item): item is string => text(item) !== null)
              .map(item => item.trim())
        : [];
    if (input.principles !== undefined && !Array.isArray(input.principles)) {
        errors.push('principles: нужен список коротких правил');
    }
    const checkpoints = parseCheckpoints(
        input.checkpoints,
        allowedTypes,
        errors,
    );
    const checkpointCodes = new Set(
        checkpoints.map(checkpoint => checkpoint.code),
    );
    const caps = parseCaps(input.caps, allowedTypes, checkpointCodes, errors);
    const spirals = parseSpirals(input.spirals, allowedTypes, errors);
    const sectionAnchors = parseAnchors(input.sectionAnchors, errors);
    const relevance = parseRelevance(input.relevance, allowedTypes, errors);
    const knowledge = parseKnowledge(input.knowledge, errors);
    if (checkpoints.length === 0 && caps.length === 0 && !spirals.enabled) {
        errors.push(
            'методика пуста: нужен хотя бы один пункт, ограничитель или спирали',
        );
    }
    if (errors.length) return { ok: false, errors };

    const value: Methodology = {
        code: code ?? '',
        title: title ?? '',
        version,
        types,
        principles,
        checkpoints,
        caps,
        spirals,
    };
    if (sectionAnchors !== undefined) value.sectionAnchors = sectionAnchors;
    if (relevance !== undefined) value.relevance = relevance;
    if (knowledge !== undefined) value.knowledge = knowledge;
    return { ok: true, value };
}
