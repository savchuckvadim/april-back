/**
 * «Итоги разговора» страницы звонка: строки «показатель — значение» из
 * разбора. Показателя нет в разборе — строки нет. Строки потребностей,
 * показа, цены и следующего шага ссылаются на свою подсветку в расшифровке,
 * если она есть. Чистые функции.
 */
import type { CallPageTone } from './call-page.const';
import type { CallPageFactHighlightIds } from './call-page-highlights.presenter';
import {
    NO_POINT_ITEMS,
    type CallPagePointItems,
} from './call-page-points.presenter';
import {
    callPageTitleOf,
    callPageTitlesOf,
    rubTitle,
} from './call-page-titles.util';
import type {
    CallPageAnalysisView,
    CallPageNextStepView,
    CallPagePriceView,
} from './call-page.types';
import type {
    CallPageFactDto,
    CallPageFactItemDto,
} from './dto/call-page-fact.dto';

type Fact = CallPageFactDto | null;

const NO_FACT_HIGHLIGHTS: CallPageFactHighlightIds = {
    needs: null,
    presentation: null,
    nextStep: null,
    price: null,
};

const fact = (
    label: string,
    value: string | null,
    tone: CallPageTone = 'neutral',
    highlightId: string | null = null,
    items: CallPageFactItemDto[] = [],
): Fact =>
    value === null || value === ''
        ? null
        : { label, value, tone, highlightId, items };

const joined = (parts: readonly (string | null)[], glue: string): string =>
    parts.filter((part): part is string => Boolean(part)).join(glue);

/** «2026-11-19» → «19.11.2026»; другой формат — как есть. */
function dateTitle(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : date;
}

const OUTCOME_TONES: Readonly<Record<string, CallPageTone>> = {
    advanced: 'good',
    refused: 'bad',
};

const SENTIMENT_TONES: Readonly<Record<string, CallPageTone>> = {
    positive: 'good',
    negative: 'bad',
};

function needsFact(
    view: CallPageAnalysisView,
    highlightId: string | null,
    items: CallPageFactItemDto[],
): Fact {
    if (view.needsFound === null) return null;
    return view.needsFound
        ? fact(
              'Потребности',
              view.needs.join('; ') || 'выявлены',
              'good',
              highlightId,
              items,
          )
        : fact('Потребности', 'не выявлены', 'bad', highlightId);
}

function priceTitle(price: CallPagePriceView): string {
    const period = price.periodMonths ? ` за ${price.periodMonths} мес.` : '';
    const promo = price.kind === 'promo' ? ', по акции' : '';
    const product = price.product ? ` — ${price.product}` : '';
    return `${rubTitle(price.amount)}${period}${promo}${product}`;
}

function priceFact(
    view: CallPageAnalysisView,
    highlightId: string | null,
): Fact {
    if (view.prices.length > 0) {
        return fact(
            'Цена',
            view.prices.map(priceTitle).join('; '),
            'neutral',
            highlightId,
        );
    }
    if (view.priceDiscussed === null) return null;
    return fact('Цена', view.priceDiscussed ? 'обсуждалась' : 'не обсуждалась');
}

function nextStepFact(
    step: CallPageNextStepView | null,
    highlightId: string | null,
): Fact {
    if (step === null) return null;
    if (!step.set) return fact('Следующий шаг', 'не назначен', 'warn');
    const when = joined(
        [step.date ? dateTitle(step.date) : null, step.time],
        ' в ',
    );
    const what = joined(
        [callPageTitleOf('nextStepKind', step.kind), step.description],
        ': ',
    );
    return fact(
        'Следующий шаг',
        joined([what, when], ', ') || 'назначен',
        'good',
        highlightId,
    );
}

function upsellFact(view: CallPageAnalysisView): Fact {
    if (!view.upsell?.attempted) return null;
    return fact(
        'Допродажа',
        joined(
            [callPageTitleOf('upsell', view.upsell.kind), view.upsell.what],
            ': ',
        ) || 'предложена',
        'good',
    );
}

function dealProgressFact(view: CallPageAnalysisView): Fact {
    const progress = view.dealProgress;
    if (progress === null) return null;
    const moved = joined([progress.before, progress.after], ' → ');
    const tone: CallPageTone =
        progress.score >= 4 ? 'good' : progress.score <= 2 ? 'bad' : 'neutral';
    return fact(
        'Продвижение сделки',
        joined([`${progress.score} из 5`, moved, progress.why], '. '),
        tone,
    );
}

/**
 * Итог чек-листа и разбор: разбор в несколько строк (по блоку на строку) —
 * с новой строки после итога, одна строка — через точку. Своей кнопки у
 * строки нет: места в разговоре — у пунктов (items, focus-v3.4).
 */
function checklistFact(
    label: string,
    done: boolean | null,
    analysis: string | null,
    items: CallPageFactItemDto[],
): Fact {
    if (done === null) return null;
    const glue = analysis?.includes('\n') ? '.\n' : '. ';
    return fact(
        label,
        joined([done ? 'выполнен' : 'не выполнен', analysis], glue),
        done ? 'good' : 'bad',
        null,
        items,
    );
}

export function buildCallPageFacts(
    view: CallPageAnalysisView,
    highlightIds: CallPageFactHighlightIds = NO_FACT_HIGHLIGHTS,
    items: CallPagePointItems = NO_POINT_ITEMS,
): CallPageFactDto[] {
    const facts: Fact[] = [
        fact(
            'Результат звонка',
            callPageTitleOf('outcome', view.outcome),
            OUTCOME_TONES[view.outcome ?? ''] ?? 'neutral',
        ),
        fact(
            'Собеседник',
            joined(
                [
                    callPageTitleOf('interlocutor', view.interlocutorRole),
                    callPageTitleOf('specialist', view.specialist),
                ],
                ', ',
            ),
        ),
        fact(
            'Настрой клиента',
            callPageTitleOf('sentiment', view.sentiment),
            SENTIMENT_TONES[view.sentiment ?? ''] ?? 'neutral',
        ),
        needsFact(view, highlightIds.needs, items.needs),
        view.presentationDone === null
            ? null
            : fact(
                  'Показ',
                  view.presentationDone ? 'был' : 'не было',
                  'neutral',
                  highlightIds.presentation,
              ),
        fact('Что предлагали', view.productsOffered.join(', ')),
        priceFact(view, highlightIds.price),
        fact(
            'Конкуренты',
            callPageTitlesOf('competitor', view.competitors).join(', '),
        ),
        nextStepFact(view.nextStep, highlightIds.nextStep),
        upsellFact(view),
        fact(
            'Отказ',
            joined(
                [
                    callPageTitleOf('refusal', view.refusalCategory),
                    view.refusalReason,
                ],
                '. ',
            ),
            'bad',
        ),
        dealProgressFact(view),
        view.talkRatioPct === null
            ? null
            : fact('Доля речи менеджера', `${Math.round(view.talkRatioPct)} %`),
        view.questionsCount === null
            ? null
            : fact('Вопросов менеджера', String(view.questionsCount)),
        checklistFact(
            'Чек-лист ХВОСТ',
            view.hvostDone,
            view.hvostAnalysis,
            items.hvost,
        ),
        checklistFact(
            'Чек-лист 5К',
            view.fiveKDone,
            view.fiveKAnalysis,
            items.fiveK,
        ),
        fact('Сверка с отчётом менеджера', view.reportComparison),
        fact('Речь менеджера', view.speechAnalysis),
    ];
    return facts.filter((item): item is CallPageFactDto => item !== null);
}
