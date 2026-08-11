import { Module } from '@nestjs/common';
import { SkapFileParseService } from './skap-file-parse.service';

/**
 * Формат-гвард выгрузок СКАП: header-map парсинг трёх видов файлов с
 * защитой от смены формата (эталоны V1 в skap-format-v1.const).
 */
@Module({
    providers: [SkapFileParseService],
    exports: [SkapFileParseService],
})
export class SkapFormatModule {}
