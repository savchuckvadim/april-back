import { Module } from '@nestjs/common';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { AiAnalyticsPlanFactController } from './ai-analytics-plan-fact.controller';
import { PlanFactUseCase } from './plan-fact.use-case';

/**
 * Срез «реконсиляция план-факт» (план Фазы 3, поток П2): ручка
 * `POST ai-analytics/plan-fact` и сценарий под неё.
 *
 * Собственный `@Module` по правилу владения общими файлами (§1.6 п. 2):
 * корневой модуль фичи его только импортирует и не растёт, а потоки
 * волны не конфликтуют за один файл — образец `about/`.
 *
 * Провайдеров здесь ровно один — сценарий ручки. Настройки, ростер,
 * кэш, стор снапшотов и периметр берутся из `AiAnalyticsCoreModule` и
 * повторно не объявляются (DI-спека сборки закрепляет отсутствие
 * дублей). PBX-половина ядра не нужна: ни финансы, ни KPI напрямую не
 * читаются — факт уже лежит в месячных снапшотах, поэтому Битрикс
 * ручкой не опрашивается, а закрытый месяц отдаётся из кэша.
 */
@Module({
    imports: [AiAnalyticsCoreModule],
    controllers: [AiAnalyticsPlanFactController],
    providers: [PlanFactUseCase],
    exports: [PlanFactUseCase],
})
export class AiAnalyticsPlanFactModule {}
