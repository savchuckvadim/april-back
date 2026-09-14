import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { AI_QUALITY_FORM_FEATURES } from './registry.enums.const';
import type { ParamDescriptor } from './registry.types';

/** Разделы и признаки, допустимые как «форма» разбора (quality_form_sections). */
export const AI_QUALITY_FORM_CODES: readonly string[] = [
    ...CALL_REPORT_SECTION_CODES,
    ...AI_QUALITY_FORM_FEATURES,
];

/** Дефолт «формы»: приветствие, потребности, закрытие + три признака. */
export const AI_QUALITY_FORM_DEFAULT = [
    'GREETING',
    'NEEDS',
    'CLOSING',
    ...AI_QUALITY_FORM_FEATURES,
].join(',');

/** Узлы монотонного сплайна p(S) по умолчанию. */
export const AI_SPLINE_KNOTS_DEFAULT = [4, 6, 8].join(',');

/** Сезон не оценён: индекс 1,0 на каждый из 12 месяцев. */
export const AI_SEASON_INDEX_DEFAULT = JSON.stringify(
    Array.from({ length: 12 }, () => 1),
);

/**
 * Часть реестра: слой качества — потолки и стоп-слова оценивания, «форма»
 * разбора, надёжность оценщика, гипотеза портала, β продажи и разделов,
 * сплайн, сезон, чек и страты базы (план §2.1–2.2). Собирается в
 * `registry.const.ts`.
 */
export const AI_ANALYTICS_QUALITY_PARAMS = [
    {
        code: 'scoring_applicability',
        title: 'Применимость разделов по типу звонка',
        scope: 'portal',
        source: 'configured',
        unit: 'JSON-карта «тип → {раздел: флаг}»',
        defaultValue: '{}',
        phase: 1,
        breaksSeries: true,
        kind: 'json',
        description:
            'Бинарная таблица «раздел считаем / не считаем» по типу звонка; пустая карта — автоматически из CALL_REPORT_TYPE_PROFILES (relevance ≥ 30, cold × PRESENTATION = false). Санити: ≥ 3 разделов на тип. Смена меняет шкалу оценки и рвёт ряды.',
    },
    {
        code: 'scoring_caps',
        title: 'Потолки и красные линии оценивания',
        scope: 'portal',
        source: 'configured',
        unit: 'JSON-массив правил {ruleCode, condition, section, maxScore, flag}',
        defaultValue: '[]',
        phase: 1,
        breaksSeries: true,
        kind: 'json',
        description:
            'Правила руководителя, применяемые кодом после модели (нет даты → CLOSING ≤ 5, цена без комплекта → PRICE ≤ 4 и т. п.): не более 20 правил, maxScore 1–9. Потолки меняют шкалу, поэтому смена рвёт сравнимость рядов качества.',
    },
    {
        code: 'scoring_stop_words',
        title: 'Стоп-фразы оценивания',
        scope: 'portal',
        source: 'configured',
        unit: 'JSON-массив фраз',
        defaultValue: '[]',
        phase: 1,
        breaksSeries: false,
        kind: 'json',
        description:
            'Запрещённые обещания и формулировки («гарантирую», «сделаю скидку, я договорюсь»), которые ловятся регулярками и выставляют флаг разбора; не более 100 фраз, ряд оценок не рвут.',
    },
    {
        code: 'quality_form_sections',
        title: 'Разделы и признаки «формы» разбора',
        scope: 'global',
        source: 'configured',
        unit: 'коды разделов и признаков через запятую',
        defaultValue: AI_QUALITY_FORM_DEFAULT,
        phase: 2,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_QUALITY_FORM_CODES,
        description:
            'Что менеджер контролирует сам и что допустимо как предиктор в каузальных моделях: приветствие, потребности, закрытие, число вопросов, доля речи, договорённость о следующем шаге. Остальные разделы зависят от клиента и в «форму» не входят.',
    },
    {
        code: 'icc_quality',
        title: 'Надёжность оценщика ICC(2,1)',
        scope: 'global',
        source: 'estimated',
        unit: 'коэффициент',
        defaultValue: 0.7,
        range: [0.5, 0.95],
        phase: 3,
        breaksSeries: false,
        estimator:
            'ICC(2,1) между версиями и повторными прогонами на golden set (test-retest на retest_budget_calls)',
        minN: 300,
        gate: 'golden set размечен; до него — «не оценено», эффекты качества скрыты',
        description:
            'Согласованность оценок одного звонка между прогонами: гейт показа эффектов качества (≥ dq_score_icc_min) и поправка β на ослабление β/ICC. До golden set значение — ожидание 0,7 с подписью «не оценено».',
    },
    {
        code: 'icc_form',
        title: 'Надёжность оценки «формы»',
        scope: 'global',
        source: 'estimated',
        unit: 'коэффициент',
        defaultValue: 0.7,
        range: [0.5, 0.95],
        phase: 3,
        breaksSeries: false,
        estimator:
            'ICC(2,1) по разделам «формы» отдельно от общего балла на том же golden set',
        minN: 300,
        gate: 'golden set размечен',
        description:
            'Надёжность именно тех разделов, которые идут предикторами в каузальные модели (quality_form_sections): без неё β_section и рычаг quality остаются «не оценено».',
    },
    {
        code: 'portal_quality_hypothesis',
        title: 'Гипотеза портала «качество → объём»',
        scope: 'portal',
        source: 'configured',
        unit: 'JSON-массив пар {s, n}',
        defaultValue: '[]',
        phase: 2,
        breaksSeries: false,
        kind: 'json',
        description:
            'Явная гипотеза руководителя «при качестве S нужно N презентаций» (≥ 2 пар, S ∈ [3; 10]); видна только руководителю с пометкой «гипотеза», в планы и советы не входит и проверяется β̂ данных. Пустой массив — не задана (betaSource: none).',
    },
    {
        code: 'beta_quality_sale',
        title: 'Наклон «качество → продажа»',
        scope: 'global',
        source: 'estimated',
        unit: 'логит на балл качества',
        defaultValue: 0,
        range: [0, 0.4],
        phase: 4,
        breaksSeries: false,
        estimator:
            'logit дальнего исхода по пулу порталов, портал — random slope при ≥ 3 порталах',
        minN: 700,
        gate: 'pool_min_portals_beta порталов с согласием; на одном портале не оценивается',
        description:
            'Связь качества с продажей (дальний исход); ноль — «не оценено», а не «эффекта нет»: до пула карточки показывают только ближний исход.',
    },
    {
        code: 'beta_section',
        title: 'Наклон раздела в модели ближнего исхода',
        scope: 'global',
        source: 'estimated',
        unit: 'логит на балл раздела',
        defaultValue: 0,
        range: [-0.2, 0.4],
        phase: 4,
        breaksSeries: false,
        estimator:
            'ridge-логит по семи разделам с усадкой к нулю, prior σ = 0,1',
        minN: 700,
        gate: 'beta_gate_se по объединённому β и ICC формы ≥ dq_score_icc_min',
        description:
            'Коэффициенты разделов рубрики в модели ближнего исхода; общий шаблон значений по умолчанию для семи разделов — ноль с усадкой, чтобы редкий раздел не получал большой вес по шуму.',
    },
    {
        code: 'spline_knots_s',
        title: 'Узлы сплайна p(S)',
        scope: 'global',
        source: 'configured',
        unit: 'баллы шкалы 1–10 через запятую',
        defaultValue: AI_SPLINE_KNOTS_DEFAULT,
        phase: 4,
        breaksSeries: false,
        kind: 'csv',
        description:
            'Узлы монотонного сплайна связи качества с исходом (анкета Ж, spline_knots_S): 2–4 узла на шкале 1–10; при нехватке данных модель откатывается к линейному логиту.',
    },
    {
        code: 'season_index',
        title: 'Сезонный индекс по месяцам',
        scope: 'portal',
        source: 'estimated',
        unit: 'JSON-массив из 12 множителей',
        defaultValue: AI_SEASON_INDEX_DEFAULT,
        phase: 4,
        breaksSeries: false,
        kind: 'json',
        estimator:
            'STL по пулу (≥ 3 портала × 24 мес.) и портальный индекс с усадкой κ_s = kappa_season_years',
        minN: 36,
        gate: 'портальный индекс признаётся при ≥ 36 месяцах истории',
        description:
            'Множители сезона к нормам объёма по месяцам года ∈ [0,5; 1,5]; единицы означают «сезон не оценён». Ручного ввода нет — индекс только оценивается.',
    },
    {
        code: 'kappa_season_years',
        title: 'Сила усадки сезонного индекса',
        scope: 'global',
        source: 'configured',
        unit: 'лет истории',
        defaultValue: 2,
        range: [1, 5],
        phase: 4,
        breaksSeries: false,
        description:
            'Псевдонаблюдения в годах для усадки портального сезона к пулу: при двух годах портал с двумя годами истории берёт половину веса от собственных чисел.',
    },
    {
        code: 'tau_prior_sd',
        title: 'Прайор разброса β между порталами',
        scope: 'global',
        source: 'configured',
        unit: 'логит на балл',
        defaultValue: 0.1,
        range: [0.02, 0.3],
        phase: 4,
        breaksSeries: false,
        description:
            'СКО слабоинформативного half-normal прайора τ на гетерогенность наклонов β между порталами, пока порталов меньше pool_min_portals_beta.',
    },
    {
        code: 'kappa_beta',
        title: 'Сила усадки β портала к пулу',
        scope: 'global',
        source: 'configured',
        unit: 'псевдонаблюдений',
        defaultValue: 20,
        range: [5, 100],
        phase: 4,
        breaksSeries: false,
        description:
            'Сколько эффективных наблюдений весит прайор пула при усадке портального β̂: при 20 портал с 20 исходами делит вес поровну с пулом.',
    },
    {
        code: 'check_lognormal_m',
        title: 'Логнормальный чек: медиана в логарифме',
        scope: 'portal',
        source: 'estimated',
        unit: 'ln(₽ в месяц)',
        defaultValue: 9.6686,
        range: [6.2146, 13.1224],
        phase: 4,
        breaksSeries: false,
        estimator:
            'среднее ln(monthlyAmount) по продажам портала с усадкой κ = 20 к пулу линейки',
        minN: 20,
        gate: '≥ 20 продаж с суммой',
        description:
            'Параметр m_p месячного чека для перевода продаж в деньги (расщепление check_lognormal): диапазон — ln[500; 500 000] ₽, дефолт — середина шкалы (геометрическое среднее границ), пока данных нет.',
    },
    {
        code: 'check_lognormal_v',
        title: 'Логнормальный чек: дисперсия логарифма',
        scope: 'portal',
        source: 'estimated',
        unit: 'ln²',
        defaultValue: 1,
        range: [0.01, 4],
        phase: 4,
        breaksSeries: false,
        estimator:
            'дисперсия ln(monthlyAmount) по продажам портала с усадкой κ = 20',
        minN: 20,
        gate: '≥ 20 продаж с суммой',
        description:
            'Параметр v_p месячного чека (расщепление check_lognormal): ширина распределения сумм; единица в логарифме означает «типичный разброс в e раз» до оценки.',
    },
] as const satisfies readonly ParamDescriptor[];
