import { AiAboutReliabilityDto } from './ai-about-reliability.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type {
    ParamPrimitive,
    ParamResolveReason,
    ParamResolveSource,
    ParamSource,
} from '@lib/sales-ai-analytics';
import {
    AI_ABOUT_ENDPOINTS,
    AI_ABOUT_PARAM_CLASSES,
    AI_ABOUT_PARAM_LAYERS,
    AI_ABOUT_RESOLVE_REASONS,
    type AiAboutEndpoint,
} from '../about/ai-analytics-about.const';
import { AiAboutModelDto } from './ai-about-model.dto';
import { AiAboutRecommendationsEffectDto } from './ai-about-phase4-effect.dto';
import {
    AiAboutForecastAccuracyDto,
    AiAboutPoolDto,
} from './ai-about-phase4-pool.dto';
import { AiAboutQualityLinkDto } from './ai-about-phase4.dto';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/**
 * Блок «Как считаем» (план Фазы 2 §6): запрос по ручке витрины, параметр
 * реестра с действующим значением, сам блок и конверт ответа. Часть про
 * модель портала — в `ai-about-model.dto.ts`.
 */

/** Запрос блока «Как считаем» для одной ручки витрины. */
export class AiAboutRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Ручка витрины, для которой нужен блок: overview — обзор ' +
            'менеджеров и типов звонков, plan/daily — план дня, brief — ' +
            'краткое резюме, plan-fact — план и факт, dossier — досье, ' +
            'manager/style — карточка стиля, forecast — прогноз отдела.',
        enum: AI_ABOUT_ENDPOINTS,
        example: 'overview',
    })
    @IsIn(AI_ABOUT_ENDPOINTS)
    endpoint: AiAboutEndpoint;
}

/** Параметр реестра в том виде, в каком его видит ручка на этом портале. */
export class AiAboutParamDto {
    @ApiProperty({
        description: 'Код параметра в реестре (snake_case).',
        type: String,
        example: 'n_min_none',
    })
    code: string;

    @ApiProperty({
        description:
            'Название параметра для руководителя простыми словами (из реестра).',
        type: String,
        example: 'Сколько наблюдений нужно, чтобы показать число',
    })
    title: string;

    @ApiProperty({
        description: 'Единица измерения по-русски.',
        type: String,
        example: 'разборов',
    })
    unit: string;

    @ApiProperty({
        description:
            'Действующее значение после разрешения слоёв менеджер → полоса ' +
            'стажа → портал → глобальный дефолт.',
        oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
        example: 8,
    })
    value: ParamPrimitive;

    @ApiProperty({
        description:
            'Слой, давший значение: default — реестр, portal / tenure / ' +
            'manager — настройки, hybrid — смесь настройки и данных по весу w.',
        enum: AI_ABOUT_PARAM_LAYERS,
        example: 'default',
    })
    layer: ParamResolveSource;

    @ApiProperty({
        description:
            'Класс параметра: configured — решение человека, estimated — ' +
            'оценка из данных, hybrid — настроенный прайор, вытесняемый данными.',
        enum: AI_ABOUT_PARAM_CLASSES,
        example: 'configured',
    })
    kind: ParamSource;

    @ApiProperty({
        description:
            'Описание для руководителя простыми словами — что параметр делает в расчёте.',
        type: String,
        example:
            'Если наблюдений меньше, вместо числа пишем «мало данных»: одна презентация из двух — это ещё не половина.',
    })
    description: string;

    @ApiProperty({
        description:
            'Смена значения рвёт сравнимость рядов (сдвигает comparableFrom).',
        type: Boolean,
        example: false,
    })
    breaksSeries: boolean;

    @ApiPropertyOptional({
        description:
            'Почему значение слоя портала не применено и взят дефолт: вне ' +
            'диапазона, чужой тип, не из словаря, неизвестный код.',
        enum: AI_ABOUT_RESOLVE_REASONS,
        example: 'out-of-range',
    })
    reason?: ParamResolveReason;
}

/** Блок «Как считаем» одной ручки: тексты, параметры и модель портала. */
export class AiAboutDto {
    @ApiProperty({
        description: 'Ручка, для которой собран блок.',
        enum: AI_ABOUT_ENDPOINTS,
        example: 'overview',
    })
    endpoint: AiAboutEndpoint;

    @ApiProperty({
        description: 'Заголовок блока.',
        type: String,
        example: 'Обзор: менеджеры и типы звонков',
    })
    title: string;

    @ApiProperty({
        description: 'Что считает ручка и зачем.',
        type: String,
        example:
            'Оценки разборов по типам звонков, конверсия шагов воронки в сравнении с нормой по порталу.',
    })
    purpose: string;

    @ApiProperty({
        description: 'Источники данных.',
        type: [String],
        example: ['разборы звонков за период'],
    })
    sources: string[];

    @ApiProperty({
        description: 'Как читать результат (числа подставлены из реестра).',
        type: [String],
        example: [
            'если разборов меньше 8, число не показываем — пишем «мало данных»',
        ],
    })
    howToRead: string[];

    @ApiProperty({
        description: 'Чего ручка не делает.',
        type: [String],
        example: ['не ставит менеджерам рейтинг'],
    })
    notDoing: string[];

    @ApiProperty({
        description:
            'Параметры реестра, которые ручка использует, с действующими значениями.',
        type: [AiAboutParamDto],
    })
    params: AiAboutParamDto[];

    @ApiProperty({
        description:
            'Текущая версия набора параметров портала (sha256 слоёв + версия реестра).',
        type: String,
        example: 'pv-3f9a…',
    })
    paramsVersion: string;

    @ApiProperty({
        description:
            'Начало сравнимой истории YYYY-MM-DD по журналу событий портала; пусто — ряд не рвался.',
        type: String,
        example: '',
    })
    comparableFrom: string;

    @ApiProperty({
        description:
            'Модель портала; null — модели нет, причина в modelReason.',
        type: AiAboutModelDto,
        nullable: true,
    })
    model: AiAboutModelDto | null;

    @ApiProperty({
        description: 'Почему модели нет; null — модель есть.',
        type: String,
        nullable: true,
        example: null,
    })
    modelReason: string | null;

    @ApiProperty({
        description:
            'Надёжность оценщика по последнему отчёту согласия test-retest ' +
            '(Фаза 3, П7): σ_llm с источником, каппа по полям разбора ' +
            'против golden_kappa_min, F1 по возражениям; null — прогона ' +
            'на портале ещё не было.',
        type: AiAboutReliabilityDto,
        nullable: true,
    })
    reliability: AiAboutReliabilityDto | null;

    @ApiPropertyOptional({
        description:
            'Связь качества разговора с результатом (Фаза 4): оценки с ' +
            'интервалами, согласие с фактом, проверка «не объясняется ' +
            'будущим», сколько месяцев подряд проверка пройдена; null — ' +
            'оценки ещё не было.',
        type: AiAboutQualityLinkDto,
        nullable: true,
    })
    qualityLink?: AiAboutQualityLinkDto | null;

    @ApiPropertyOptional({
        description:
            'Точность прогноза отдела на прошлых месяцах (Фаза 4): месяцы ' +
            'без показа, попадания в вилку и отношение ошибок с ' +
            'интервалами; null — проверки ещё не было.',
        type: AiAboutForecastAccuracyDto,
        nullable: true,
    })
    forecastAccuracy?: AiAboutForecastAccuracyDto | null;

    @ApiPropertyOptional({
        description:
            'Обезличенный пул порталов (Фаза 4): участники, общая связь и ' +
            'что из пула попало в расчёт; null — пула нет.',
        type: AiAboutPoolDto,
        nullable: true,
    })
    pool?: AiAboutPoolDto | null;

    @ApiPropertyOptional({
        description:
            'Эффект советов (Фаза 4): выполнение, несогласия и шаги ' +
            'воронки до/после с интервалами; null — оценки ещё не было.',
        type: AiAboutRecommendationsEffectDto,
        nullable: true,
    })
    recommendationsEffect?: AiAboutRecommendationsEffectDto | null;

    @ApiProperty({
        description:
            'Запрос от менеджера в режиме self_view (роль manager при ' +
            'включённой ai_analytics_self_view_enabled). Блок менеджеру ' +
            'отдаётся целиком (решение 22.09.2026, B13); по этому признаку ' +
            'фронт сворачивает детали параметров. false — руководитель.',
        type: Boolean,
        example: false,
    })
    selfView: boolean;
}

/** Конверт ответа ручки about: всегда ready, данные в data. */
export class AiAboutResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiProperty({ description: 'Блок «Как считаем».', type: AiAboutDto })
    data: AiAboutDto;
}
