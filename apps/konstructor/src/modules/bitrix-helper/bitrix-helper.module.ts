import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { BitrixHelperController } from './controllers/bitrix-helper.controller';
import { BitrixMethodUseCase } from './use-cases/bitrix-method.use-case';

/**
 * Прокси REST-вызовов Bitrix24 для dev-режима легаси-фронта — замена
 * `helper/bitrix/method` старой сборки back.april-app.ru.
 */
@Module({
    imports: [PBXModule],
    controllers: [BitrixHelperController],
    providers: [BitrixMethodUseCase],
})
export class BitrixHelperModule {}
