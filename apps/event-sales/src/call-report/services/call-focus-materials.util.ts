/**
 * Материалы базы знаний в промптах разбора звонка: какой вид в какой проход
 * идёт и под каким заголовком. Сколько знаков вида читать — решает общая
 * таблица бюджетов (`@lib/call-lib`, knowledge-budgets.ts).
 *
 * Каждый вид получает СВОЙ бюджет и СВОЮ точку подмешивания:
 * - общий слой (все проходы и итог): профиль типа, скрипт разговора,
 *   устаревший `call-analysis-base`, общие материалы компании, инструкция
 *   типа звонка;
 * - «содержание продажи» дополнительно получает плейбук возражений;
 * - проходы «возражения и цена» и «закрытие и следующий шаг» — регламент
 *   отдела (оба);
 * - итог — эталонные разборы РОПа (калибровка шкалы оценок);
 * - проход методики — виды, которые методика портала объявила в `knowledge`
 *   (факты о продукте, плейбуки, регламент).
 *
 * ПРЕЗЕНТАЦИИ — отдельный усиленный контур (требование владельца
 * 27.08.2026): методология показа, хвоста и 5К идёт во ВСЕ проходы.
 *
 * Чистые функции: без DI и чтения базы.
 */
import { KNOWLEDGE_KINDS } from '@lib/ai-rag';
import {
    FOCUS_SHARED_BUDGET_CHARS,
    KNOWLEDGE_USES,
    renderMaterialBlock,
    type KnowledgeBudgetLine,
    type KnowledgeMaterialBlock,
} from '@lib/call-lib';
import type { CallFocusKey } from '../contracts/call-focus-analysis.contract';

/** Материалы разбора: общий слой и добавки конкретных проходов. */
export interface FocusMaterials {
    /** Идёт во все проходы и в итог. */
    shared: string;
    /** Плейбук возражений — проход «содержание продажи». */
    content: string;
    /** Регламент отдела — проходы «возражения и цена» и «закрытие». */
    movement: string;
    /** Эталонные разборы — итог (калибровка оценок). */
    synthesis: string;
    /** Материалы, объявленные методикой портала, — проход методики. */
    methodology: string;
    /** Верхняя норма доли речи менеджера для типа; null — не нормируется. */
    talkRatioMax: number | null;
}

const OBJECTION_HEADING = 'ПЛЕЙБУК ОТРАБОТКИ ВОЗРАЖЕНИЙ:';
const REGULATION_HEADING = 'РЕГЛАМЕНТ ОТДЕЛА (обещания, сроки, что запрещено):';

/** Заголовки видов в проходе методики. */
const METHODOLOGY_HEADINGS: Readonly<Record<string, string>> = {
    [KNOWLEDGE_KINDS.productFacts]:
        'ФАКТЫ О ПРОДУКТЕ, КОМПЛЕКТАХ И ЦЕНАХ (источник правды: что продукт ' +
        'умеет и чего не умеет):',
    [KNOWLEDGE_KINDS.objectionPlaybook]: OBJECTION_HEADING,
    [KNOWLEDGE_KINDS.salesRegulation]: REGULATION_HEADING,
    [KNOWLEDGE_KINDS.presentationPlaybook]:
        'МЕТОДОЛОГИЯ ПРЕЗЕНТАЦИИ (показ под задачи, хвост, 5К):',
};

const joinBlocks = (blocks: readonly string[]): string =>
    blocks.filter(Boolean).join('\n\n');

/**
 * Общий слой под потолок: страховка на случай, когда профиль типа и
 * заголовки вместе с материалами превысили запас.
 */
export function fitSharedMaterials(text: string): {
    text: string;
    cutChars: number;
} {
    if (text.length <= FOCUS_SHARED_BUDGET_CHARS) {
        return { text, cutChars: 0 };
    }
    return {
        text:
            `${text.slice(0, FOCUS_SHARED_BUDGET_CHARS)}\n\n` +
            '… материалы усечены по размеру контекста',
        cutChars: text.length - FOCUS_SHARED_BUDGET_CHARS,
    };
}

/**
 * @param input.profileBlock профиль типа звонка (нормы речи, актуальность разделов)
 * @param input.typedKind вид с инструкцией типа звонка
 * @param input.presentation звонок презентационного контура
 * @param input.lines строки таблицы бюджетов этого звонка
 * @param input.blocks прочитанные материалы
 * @returns материалы по проходам и сколько знаков общего слоя не поместилось
 */
export function renderFocusMaterials(input: {
    profileBlock: string;
    typedKind: string;
    presentation: boolean;
    lines: readonly KnowledgeBudgetLine[];
    blocks: readonly KnowledgeMaterialBlock[];
    talkRatioMax: number | null;
}): { materials: FocusMaterials; sharedCutChars: number } {
    const byKind = new Map(input.blocks.map(block => [block.kind, block]));
    const shared = fitSharedMaterials(
        joinBlocks([
            input.profileBlock,
            renderMaterialBlock(
                'СТАНДАРТЫ КОМПАНИИ (скрипт разговора) — обязательны к ' +
                    'применению в любом разборе:',
                byKind.get(KNOWLEDGE_KINDS.salesScript),
            ),
            renderMaterialBlock(
                'СТАНДАРТЫ КОМПАНИИ (базовый слой):',
                byKind.get(KNOWLEDGE_KINDS.callAnalysisBase),
            ),
            renderMaterialBlock(
                'ОБЩИЕ МАТЕРИАЛЫ КОМПАНИИ:',
                byKind.get(KNOWLEDGE_KINDS.general),
            ),
            // Тип может ссылаться на базовый вид — он уже стоит выше.
            input.typedKind === KNOWLEDGE_KINDS.callAnalysisBase
                ? ''
                : renderMaterialBlock(
                      'МАТЕРИАЛЫ ПО ЭТОМУ ТИПУ ЗВОНКА (критерии оценки):',
                      byKind.get(input.typedKind),
                  ),
            input.presentation
                ? renderMaterialBlock(
                      'МЕТОДОЛОГИЯ ПРЕЗЕНТАЦИИ (показ под задачи, хвост, 5К) — ' +
                          'по ней судим этот звонок:',
                      byKind.get(KNOWLEDGE_KINDS.presentationPlaybook),
                  )
                : '',
        ]),
    );
    const methodology = joinBlocks(
        input.lines
            .filter(item => item.use === KNOWLEDGE_USES.methodology)
            .map(item =>
                renderMaterialBlock(
                    METHODOLOGY_HEADINGS[item.kind] ??
                        `МАТЕРИАЛЫ МЕТОДИКИ (${item.kind}):`,
                    byKind.get(item.kind),
                ),
            ),
    );

    return {
        materials: {
            shared: shared.text,
            content: renderMaterialBlock(
                OBJECTION_HEADING,
                byKind.get(KNOWLEDGE_KINDS.objectionPlaybook),
            ),
            movement: renderMaterialBlock(
                REGULATION_HEADING,
                byKind.get(KNOWLEDGE_KINDS.salesRegulation),
            ),
            synthesis: renderMaterialBlock(
                'ЭТАЛОННЫЕ РАЗБОРЫ (калибровка шкалы оценок):',
                byKind.get(KNOWLEDGE_KINDS.callEtalon),
            ),
            methodology,
            talkRatioMax: input.talkRatioMax,
        },
        sharedCutChars: shared.cutChars,
    };
}

const withExtra = (shared: string, extra: string): string =>
    extra ? `${shared}\n\n${extra}` : shared;

/**
 * Контекст прохода разбора: общий слой + слой этого прохода. Оба прохода
 * «движения сделки» — «возражения и цена» и «закрытие и следующий шаг» —
 * читают один регламент отдела.
 */
export function focusContextFor(
    materials: FocusMaterials,
    key: CallFocusKey,
): string {
    const extra =
        key === 'content'
            ? materials.content
            : key === 'movement' || key === 'closing'
              ? materials.movement
              : '';
    return withExtra(materials.shared, extra);
}

/** Контекст итоговой оценки: общий слой + эталонные разборы. */
export function synthesisContextOf(materials: FocusMaterials): string {
    return withExtra(materials.shared, materials.synthesis);
}

/** Контекст прохода методики: общий слой + материалы, объявленные методикой. */
export function methodologyContextOf(materials: FocusMaterials): string {
    return withExtra(materials.shared, materials.methodology);
}
