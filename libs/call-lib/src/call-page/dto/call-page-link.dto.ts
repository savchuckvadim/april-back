import { ApiProperty } from '@nestjs/swagger';

export class CallPageLinkDto {
    @ApiProperty({
        description:
            'Адрес страницы разбора звонка на сайте «Отчёта»: открывается без ' +
            'входа у любого, у кого есть ссылка. null — ссылки не выпускаются ' +
            '(в окружении нет секрета подписи) либо адрес сайта задан неверно.',
        example:
            'https://next.april-app.ru/call/1g9gd-3q2x8Yk0mXo1p7cT5vB9nW4sZ6aQeR',
        type: String,
        nullable: true,
    })
    url: string | null;
}
