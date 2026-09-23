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
            'менеджер × тип, plan/daily — план дня, brief — AI-резюме, ' +
            'manager/style — карточка стиля.',
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
        description: 'Название параметра по-русски из реестра.',
        type: String,
        example: 'Минимум наблюдений, ниже которого чисел нет',
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
        description: 'Описание из реестра — что параметр делает в расчёте.',
        type: String,
        example: 'Ниже этого числа разборов оценка ячейки не показывается.',
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
        example: 'Обзор менеджер × тип',
    })
    title: string;

    @ApiProperty({
        description: 'Что считает ручка и зачем.',
        type: String,
        example:
            'Оценки разборов по типам звонков, рёбра воронки с нормой портала.',
    })
    purpose: string;

    @ApiProperty({
        description: 'Источники данных.',
        type: [String],
        example: ['разборы звонков (ais, agent-analysis) за период'],
    })
    sources: string[];

    @ApiProperty({
        description: 'Как читать результат.',
        type: [String],
        example: ['n меньше порога n_min_none — числа нет'],
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
