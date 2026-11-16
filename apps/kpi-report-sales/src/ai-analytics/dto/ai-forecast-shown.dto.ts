import { ApiProperty } from '@nestjs/swagger';
import {
    AI_FORECAST_SHOWN_NOTES,
    AI_FORECAST_SHOWN_SOURCES,
    type AiForecastShownNote,
    type AiForecastShownSource,
} from '../constants/ai-forecast.const';

/**
 * Число, которое карточка прогноза показывает всегда, когда есть журнал
 * дня: аналитику не прячем за «мало данных» — число идёт с пометкой,
 * откуда оно и насколько ему верить.
 */
export class AiForecastShownDto {
    @ApiProperty({
        description:
            'Чей расчёт показан: model — модель прогноза, naive — простой ' +
            'расчёт по темпу с начала месяца, mean3 — среднее продаж трёх ' +
            'прошлых месяцев.',
        enum: AI_FORECAST_SHOWN_SOURCES,
        example: 'naive',
    })
    source: AiForecastShownSource;

    @ApiProperty({
        description: 'Ожидаемое число продаж отдела за месяц по этому расчёту.',
        type: Number,
        example: 44,
    })
    value: number;

    @ApiProperty({
        description:
            'Почему показан именно этот расчёт (подпись — на фронте): ' +
            'confirmed — модель проверена на истории, вилка опубликована; ' +
            'stage-disabled — проверка пройдена, показ вилки не включён; ' +
            'model-unconfirmed — проверка не пройдена, но модель на истории ' +
            'точнее простых расчётов; simple-better — проверка не пройдена и ' +
            'простой расчёт на истории точнее модели; history-short — ' +
            'истории мало, проверить модель нечем; readiness-below — ' +
            'портал не готов к прогнозу модели (нет модели портала, ' +
            'календаря или подтверждения состава); no-model — журнала ' +
            'прогноза за месяц ещё нет, показан простой расчёт по месячным ' +
            'продажам отдела.',
        enum: AI_FORECAST_SHOWN_NOTES,
        example: 'simple-better',
    })
    note: AiForecastShownNote;
}
