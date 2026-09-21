import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AI_BRIEF_FORBIDDEN } from '../contracts/ai-brief.contract';
import { EXPLANATION_FORBIDDEN_WORDS } from '../model/explanation-template';
import { AI_ANALYTICS_PARAM_CODES } from '../params/registry.const';
import {
    APP_AI_ANALYTICS_DIR,
    LIB_SRC_DIR,
    REPO_ROOT,
    paramCodeLiterals,
    stripComments,
    tsSourcesUnder,
} from './param-codes.fixture';

/**
 * Инварианты Фазы 2 (план §6, поток 19 → волна C `p2-acceptance-specs`):
 * (а) каждый строковый код параметра, переданный функциям реестра в
 *     модели, настройках и приложении, существует в `AI_ANALYTICS_PARAMS`;
 * (б) слова «значимо» (и форм «значим», «незначим», «значимая») нет в
 *     текстах пользователю — шаблонах объяснений, подписях, рычагах,
 *     константах, презентерах, доставке и DTO;
 * (в) `w ∈ [0, 1]` и `s ≤ n | mixed-sources` закреплены property-спеками
 *     библиотеки и приложения — здесь только ссылка, без дублирования.
 *
 * Сбор литералов — регулярными выражениями по исходникам через `fs`, а не
 * по памяти и не через импорт модулей: список найденных кодов печатается
 * в сообщении assert'а, а спека не зависит от состояния соседних потоков.
 */

const CODE_ROOTS = [
    join(LIB_SRC_DIR, 'model'),
    join(LIB_SRC_DIR, 'settings'),
    APP_AI_ANALYTICS_DIR,
];

/** Тексты пользователю: шаблоны модели и слои приложения, которые пишут наружу. */
const TEXT_ROOTS = [
    join(LIB_SRC_DIR, 'model'),
    join(APP_AI_ANALYTICS_DIR, 'constants'),
    join(APP_AI_ANALYTICS_DIR, 'domain', 'presenter'),
    join(APP_AI_ANALYTICS_DIR, 'delivery'),
    join(APP_AI_ANALYTICS_DIR, 'dto'),
];

/** Страховка от «зелёного по пустому списку»: на 18.09.2026 кодов ≥ 60. */
const MIN_DISTINCT_CODES = 40;

const FORBIDDEN_WORD = /значим/iu;

/** Объявления стоп-списков — единственное законное место слова в коде. */
const STOP_LIST_DECLARATION =
    /export const (?:EXPLANATION_FORBIDDEN_WORDS|AI_BRIEF_FORBIDDEN)\s*=\s*\[[\s\S]*?\]\s*as const;?/g;

/**
 * Упоминания самого запрета — не текст пользователю: инструкция LLM в
 * системном промпте резюме и описание Swagger у поля объяснения.
 */
const BAN_MENTIONS = [
    /не использу\S*\s+слова?\s+«значимо»/iu,
    /слово «значимо» не используется/iu,
];

const rel = (file: string): string =>
    relative(REPO_ROOT, file).replace(/\\/g, '/');

/** Строки текста (без комментариев и стоп-списков) с запрещённым словом. */
function forbiddenMentions(text: string): string[] {
    let source = stripComments(text).replace(STOP_LIST_DECLARATION, '');
    for (const mention of BAN_MENTIONS) {
        source = source.replace(new RegExp(mention.source, 'giu'), '');
    }
    return source
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter(({ line }) => FORBIDDEN_WORD.test(line))
        .map(({ line, number }) => `${number}: ${line}`);
}

describe('Фаза 2, инвариант (а): коды параметров из кода есть в реестре', () => {
    const registry = new Set<string>(AI_ANALYTICS_PARAM_CODES);
    const found = new Map<string, string[]>();
    for (const root of CODE_ROOTS) {
        for (const file of tsSourcesUnder(root)) {
            for (const code of paramCodeLiterals(readFileSync(file, 'utf8'))) {
                found.set(code, [...(found.get(code) ?? []), rel(file)]);
            }
        }
    }

    it('сканер видит коды в модели, настройках и приложении', () => {
        expect(CODE_ROOTS.every(root => existsSync(root))).toBe(true);
        expect(found.size).toBeGreaterThanOrEqual(MIN_DISTINCT_CODES);
        expect(found.has('n_min_none')).toBe(true);
        expect(found.has('plan_day_ceiling')).toBe(true);
    });

    it('каждый литерал кода существует в AI_ANALYTICS_PARAMS', () => {
        const unknown = [...found.entries()]
            .filter(([code]) => !registry.has(code))
            .map(([code, files]) => `${code} ← ${files.join(', ')}`);
        // Список найденных кодов — часть сравниваемого значения: при
        // падении он печатается в сообщении вместе с неизвестными кодами.
        const foundInCode = [...found.keys()].sort().join(', ');
        expect({ unknown, foundInCode }).toEqual({ unknown: [], foundInCode });
    });
});

describe('Фаза 2, инвариант (б): слова «значимо» нет в текстах пользователю', () => {
    it('стоп-списки библиотеки по-прежнему запрещают слово', () => {
        expect(EXPLANATION_FORBIDDEN_WORDS).toContain('значимо');
        expect(AI_BRIEF_FORBIDDEN).toContain('значим');
    });

    it('сканер ловит слово в строке кода и пропускает комментарии и стоп-списки', () => {
        expect(
            forbiddenMentions(`const text = 'оценка значимо выше нормы';`),
        ).toEqual([`1: const text = 'оценка значимо выше нормы';`]);
        expect(forbiddenMentions('// значимо\n/** незначимая */')).toEqual([]);
        expect(
            forbiddenMentions(
                `export const AI_BRIEF_FORBIDDEN = ['значим'] as const;`,
            ),
        ).toEqual([]);
        expect(
            forbiddenMentions(
                `'не используй слова «значимо», «статистически»'`,
            ),
        ).toEqual([]);
        expect(forbiddenMentions(`'Слово «значимо» не используется.'`)).toEqual(
            [],
        );
    });

    it('в шаблонах, константах, презентерах, доставке и DTO слова нет', () => {
        const violations: string[] = [];
        let scanned = 0;
        for (const root of TEXT_ROOTS) {
            for (const file of tsSourcesUnder(root)) {
                scanned += 1;
                for (const hit of forbiddenMentions(
                    readFileSync(file, 'utf8'),
                )) {
                    violations.push(`${rel(file)}:${hit}`);
                }
            }
        }
        expect(scanned).toBeGreaterThan(50);
        expect(violations).toEqual([]);
    });
});

describe('Фаза 2, инвариант (в): w ∈ [0, 1] и s ≤ n закреплены property-спеками', () => {
    const PROPERTY_SPECS: readonly (readonly [string, string])[] = [
        [
            'libs/sales-ai-analytics/src/__tests__/shrink.spec.ts',
            'property: w ∈ [0, 1] на 1000 случайных входов (mulberry32)',
        ],
        [
            'libs/sales-ai-analytics/src/__tests__/edge-estimand.spec.ts',
            'числитель больше знаменателя при вероятностной трактовке даёт mixed-sources',
        ],
        [
            'apps/kpi-report-sales/src/ai-analytics/__tests__/funnel-edges.assembler.spec.ts',
            's > n → confidence mixed-sources',
        ],
    ];

    it.each(PROPERTY_SPECS)('%s содержит проверку «%s»', (file, title) => {
        const path = join(REPO_ROOT, file);
        expect(existsSync(path)).toBe(true);
        expect(readFileSync(path, 'utf8')).toContain(title);
    });
});
