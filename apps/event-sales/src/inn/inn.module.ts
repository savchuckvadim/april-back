import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { InnController } from './controllers/inn.controller';
import { InnUseCase } from './use-cases/inn.use-case';

/**
 * Вкладка «ИНН» карточки сделки: снимок, выбор, скрытие варианта.
 *
 * Модуль приложения, а не библиотеки: ручки нужны именно фрейму отдела
 * продаж, и в Swagger других приложений им делать нечего
 * (ai/rules/app-api-surface.md). Доменная логика и единственный писатель
 * `op_inn` / `op_inn_pool` живут в `@lib/portal-lib/pbx-inn` — админка
 * сможет выставить те же сервисы своими эндпоинтами, не копируя код.
 */
@Module({
    imports: [PBXModule],
    controllers: [InnController],
    providers: [InnUseCase],
})
export class InnModule {}
