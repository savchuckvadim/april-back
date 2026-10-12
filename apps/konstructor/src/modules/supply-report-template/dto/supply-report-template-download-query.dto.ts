import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { IsBooleanFlag } from './is-boolean-flag.decorator';

/**
 * Query ручки скачивания.
 *
 * Отдельный DTO, а не `@Query('demo')`: без класса с `@ApiPropertyOptional`
 * параметр не попадает в OpenAPI, и Orval-клиент админки не умеет скачать
 * демо-файл; без валидатора `whitelist: true` молча выбросил бы поле, и
 * `?demo=1` отдавал бы основной шаблон вместо демонстрационного.
 *
 * Разбор строки — через общий `@IsBooleanFlag()`: одного `@Transform`
 * здесь НЕ хватает, потому что глобальный пайп включает
 * `enableImplicitConversion`, и приведение по `design:type` (`Boolean`)
 * выигрывает у пользовательского трансформера — `?demo=0` отдавал бы
 * демо-файл. Подробности — в `is-boolean-flag.decorator.ts`.
 */
export class SupplyReportTemplateDownloadQueryDto {
    @ApiPropertyOptional({
        description:
            'Скачать демонстрационный (заполненный) файл вместо шаблона. ' +
            'Принимаются 1/true/yes. Если демо не загружено — 404.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    demo?: boolean;
}
