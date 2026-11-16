/**
 * Ответ админ-ручки `GET admin/ai-analytics/forecast-breakdown` (Фаза 4,
 * п. 4.1): разложение прогноза отдела на слагаемые по отделу и менеджерам.
 */
import { ApiProperty } from '@nestjs/swagger';
import type {
    ForecastBreakdownDepartmentView,
    ForecastBreakdownEpisodeView,
    ForecastBreakdownManagerView,
    ForecastBreakdownView,
} from '../services/ai-analytics-forecast-breakdown.types';

const PIPELINE_DESCRIPTION =
    'Ожидаемых продаж от открытых сделок до конца месяца; null — слагаемое ' +
    'не сохранено (запись до 16.11.2026) или истории стадий нет.';
const NEW_FLOW_DESCRIPTION =
    'Ожидаемых продаж от новых встреч до конца месяца; null — слагаемое не ' +
    'сохранено (запись до 16.11.2026).';

export class AiForecastBreakdownEpisodeDto
    implements ForecastBreakdownEpisodeView
{
    @ApiProperty({
        description: 'Ключ эпизода сделки; null — у эпизода нет ключа.',
        example: 'deal:90412',
        type: String,
        nullable: true,
    })
    id: string | null;

    @ApiProperty({
        description: 'Сколько дней сделка открыта.',
        example: 34,
        type: Number,
    })
    ageDays: number;

    @ApiProperty({
        description:
            'Вероятность продажи из стадии сделки (0–1); null — не задана.',
        example: 0.42,
        type: Number,
        nullable: true,
    })
    theta: number | null;

    @ApiProperty({
        description: 'Вклад сделки в ожидание: продаж до конца месяца.',
        example: 0.18,
        type: Number,
    })
    expected: number;
}

export class AiForecastBreakdownDepartmentDto
    implements ForecastBreakdownDepartmentView
{
    @ApiProperty({
        description: 'День журнала, за который показано разложение.',
        example: '2026-11-16',
        type: String,
    })
    day: string;

    @ApiProperty({
        description: 'Месяц прогноза (YYYY-MM).',
        example: '2026-11',
        type: String,
    })
    monthKey: string;

    @ApiProperty({
        description: 'Середина прогноза продаж отдела за месяц.',
        example: 46,
        type: Number,
    })
    p50: number;

    @ApiProperty({
        description: 'Нижняя граница вилки.',
        example: 38,
        type: Number,
    })
    low: number;

    @ApiProperty({
        description: 'Верхняя граница вилки.',
        example: 55,
        type: Number,
    })
    high: number;

    @ApiProperty({
        description: 'Закрытых продаж с начала месяца.',
        example: 21,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: PIPELINE_DESCRIPTION,
        example: 9.5,
        type: Number,
        nullable: true,
    })
    pipeline: number | null;

    @ApiProperty({
        description: NEW_FLOW_DESCRIPTION,
        example: 15.5,
        type: Number,
        nullable: true,
    })
    newFlow: number | null;

    @ApiProperty({
        description: 'Простой расчёт по темпу с начала месяца — для сравнения.',
        example: 44,
        type: Number,
    })
    naive: number;

    @ApiProperty({
        description:
            'Среднее продаж трёх прошлых месяцев — для сравнения; null — ' +
            'истории нет.',
        example: 41.3,
        type: Number,
        nullable: true,
    })
    mean3: number | null;

    @ApiProperty({
        description: 'Менеджеров в расчёте.',
        example: 12,
        type: Number,
    })
    managers: number;

    @ApiProperty({
        description:
            'У скольких из них нет истории стадий: ожидание от открытых ' +
            'сделок у них не считалось.',
        example: 0,
        type: Number,
    })
    pipelineUnknown: number;
}

export class AiForecastBreakdownManagerDto
    implements ForecastBreakdownManagerView
{
    @ApiProperty({
        description: 'Id сотрудника в Битрикс24.',
        example: '15',
        type: String,
    })
    managerId: string;

    @ApiProperty({
        description: 'Середина прогноза продаж менеджера за месяц.',
        example: 5.4,
        type: Number,
    })
    p50: number;

    @ApiProperty({
        description: 'Закрытых продаж менеджера с начала месяца.',
        example: 2,
        type: Number,
    })
    done: number;

    @ApiProperty({
        description: PIPELINE_DESCRIPTION,
        example: 1.1,
        type: Number,
        nullable: true,
    })
    pipeline: number | null;

    @ApiProperty({
        description: NEW_FLOW_DESCRIPTION,
        example: 2.3,
        type: Number,
        nullable: true,
    })
    newFlow: number | null;

    @ApiProperty({
        description: 'Простой расчёт по темпу менеджера — для сравнения.',
        example: 4,
        type: Number,
    })
    naive: number;

    @ApiProperty({
        description: 'Цель менеджера на месяц; null — не задана.',
        example: 6,
        type: Number,
        nullable: true,
    })
    target: number | null;

    @ApiProperty({
        description:
            'Сделано входной активности с начала месяца; null — запись до ' +
            '16.11.2026, входы расчёта не сохранялись.',
        example: 38,
        type: Number,
        nullable: true,
    })
    entryDone: number | null;

    @ApiProperty({
        description: 'Темп входной активности в рабочий день.',
        example: 3.5,
        type: Number,
        nullable: true,
    })
    entryRate: number | null;

    @ApiProperty({
        description:
            'Конверсия входной активности в продажу (0–1) по нормам портала ' +
            'и менеджера.',
        example: 0.06,
        type: Number,
        nullable: true,
    })
    conversion: number | null;

    @ApiProperty({
        description:
            'Какая доля будущих продаж успеет закрыться до конца месяца ' +
            '(0–1).',
        example: 0.55,
        type: Number,
        nullable: true,
    })
    fBar: number | null;

    @ApiProperty({
        description: 'Открытых сделок менеджера в расчёте ожидания.',
        example: 27,
        type: Number,
        nullable: true,
    })
    openEpisodes: number | null;

    @ApiProperty({
        description:
            'До пяти открытых сделок с наибольшим вкладом в ожидание, ' +
            'крупные первыми; пусто — истории стадий нет или запись старая.',
        type: [AiForecastBreakdownEpisodeDto],
    })
    topEpisodes: AiForecastBreakdownEpisodeDto[];
}

export class AiForecastBreakdownResultDto implements ForecastBreakdownView {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'День, за который показано разложение; null — прогноз ещё не ' +
            'считался.',
        example: '2026-11-16',
        type: String,
        nullable: true,
    })
    day: string | null;

    @ApiProperty({
        description: 'Разложение по отделу; null — журнала прогноза нет.',
        type: AiForecastBreakdownDepartmentDto,
        nullable: true,
    })
    department: AiForecastBreakdownDepartmentDto | null;

    @ApiProperty({
        description:
            'Разложение по менеджерам за тот же день, крупные прогнозы ' +
            'первыми.',
        type: [AiForecastBreakdownManagerDto],
    })
    managers: AiForecastBreakdownManagerDto[];
}
