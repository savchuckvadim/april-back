import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Ответ портальной анкеты, адресованный полю элемента смарта.
 *
 * Адресуется КОДАМИ каталога — «анкета, вопрос, значение». Ни UF-имени
 * поля, ни идентификатора элемента справочника, ни id самого элемента
 * фрейм не шлёт и знать не должен: элемента на момент ответа ещё не
 * существует (его создаёт или закрывает поток ЭТОГО отчёта), а адреса
 * чужой системы меняются без нашего ведома. Резолвит их бэк — по каталогу
 * и по живому смарту портала.
 */
export class QuestionnaireAnswerDto {
    @ApiProperty({
        description: 'Код анкеты портального каталога.',
        example: 'presentation_result',
    })
    @IsString()
    questionnaire: string;

    @ApiProperty({
        description: 'Код вопроса внутри анкеты.',
        example: 'decision_maker',
    })
    @IsString()
    item: string;

    @ApiProperty({
        description:
            'Ответ В КАНОНЕ КАТАЛОГА: текст как есть, число строкой, ' +
            '`YYYY-MM-DD` у даты, `YYYY-MM-DDTHH:mm` у даты со временем, ' +
            '`Y`/`N` у «да/нет», КОД варианта у списка. Перевод в формат ' +
            'Битрикса (`DD.MM.YYYY`, `1`/`0`, числовой id элемента списка) ' +
            'делает бэк по живому полю смарта. Пустых ответов не шлём.',
        example: 'Y',
    })
    @IsString()
    value: string;
}
