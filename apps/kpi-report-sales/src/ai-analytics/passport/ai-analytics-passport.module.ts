/**
 * Модуль среза «паспорт менеджера и снимок планов» (план Фазы 2, поток
 * 14a; правило владения общими файлами §1.6 п. 2).
 *
 * Два шага конвейера:
 * - `passport` (ритмы `nightly|weekly|monthly|backfill`) — каскад даты
 *   начала работы (`UF_EMPLOYMENT_DATE → DATE_REGISTER → первое событие`),
 *   статус, полоса стажа и уровень; результат уходит в шину под ключом
 *   `passport`, откуда его читают шаги стиля, финансов и модели портала;
 *   в догоне истории паспорт берётся из кэша `user.get`, в портал не ходим;
 * - `plans` (ритм `monthly`, тик 1-го числа) — снимок целей руководителя
 *   `UF_USR_A_SALES_PLAN_*` в снапшот `ai-analytics-plan` и санити цели
 *   («план — пожелание», если его выполняют менее 30 % за 3 месяца).
 *
 * Отдельного крона у среза нет: тик 1-го числа уже есть в
 * `cron/ai-analytics-snapshot.scheduler.ts` (`AI_PIPELINE_CRON.PLANS` +
 * белый список `AI_PIPELINE_PLANS_STEPS`), второй крон дублировал бы
 * джобу того же ключа. Контроллеров нет — поверхность API не растёт.
 *
 * Общие загрузчики (настройки, ростер, кэш, стор снапшотов) — из ядра,
 * планы руководителя (PBXService) — из его PBX-половины; свой здесь
 * только загрузчик паспорта.
 */
import { Module } from '@nestjs/common';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiAnalyticsCorePbxModule } from '../core/ai-analytics-core-pbx.module';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { ManagerPassportLoader } from '../domain/loaders/manager-passport.loader';
import { PlansSnapshotUseCase } from '../domain/use-cases/plans-snapshot.use-case';
import { PassportStep } from '../steps/passport.step';
import { PlansStep } from '../steps/plans.step';

@Module({
    imports: [PBXModule, AiAnalyticsCoreModule, AiAnalyticsCorePbxModule],
    providers: [
        ManagerPassportLoader,
        PlansSnapshotUseCase,
        PassportStep,
        PlansStep,
    ],
    exports: [
        PassportStep,
        PlansStep,
        ManagerPassportLoader,
        PlansSnapshotUseCase,
    ],
})
export class AiAnalyticsPassportModule {}
