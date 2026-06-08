начал делать эту библиотеку в которой
юудет все что касается портала
и pbx и portal-konstructor
и типизация всех codes используемых во всех клиентских приложениях

перенести в нее все

в модулях типизации филдов везеде исправить на использование PbxFieldTypeEnum
вынести наружу через index
переписать nest cli с нескольких portal и pbx библиотек на одну эту

везде удалить дублирующие модули

все импорты где данная библиотека используется
должны вглядеть типа
import {} from '@lib/portal'

или import {} from '@lib/portal/pbx' или import {} from '@lib/portal/pbx'
или import {} from '@lib/portal/type'
или import {} from '@lib/portal/domain'

структура
portal/
 portal (portal тот который берется у online и преобразуется PortalModel для работы pbx приложений)
 portal-store (вытащил из portal-konstructor, нужен будет для работы root portal с db
 когда нибудь станет заменой portal - преимущество в том чтобы брать portal не по апи а собственный из db. проблмеа была в том что существующие ключи для портала при записи в db шифровались на другом приложении
 Сейчас задача по этому модуль
 добавил в db таблицы Portal ключи

  nestKey                String?                  @db.Text
    nestKonstructorKey     String?                  @db.Text
    nestReportKey          String?                  @db.Text
    nestEventsKey          String?                  @db.Text
    nestServiceKey         String?                  @db.Text
    nestWebhooksKey        String?                  @db.Text
    nestScheduleKey        String?                  @db.Text
    vibeKey                String?                  @db.Text

    для того чтоб их можно было отдельными admin ендпоинтами записать в портал
    при этом должно зашифроваться
    в приложении по-моему есть encrypt decrypt функции в shared

    todo организовать crud вышеперечисленных ключей в портал с шифроованием и дешифровнием при get в модуле C:\Projects\April\april-next\back\libs\portal-lib\portal-store
 )
 pbx
  /types // типизация для прриложений при использовании portal
  /domain //crud в db всех связанных с портал-битрикс сущностей и их филдов, категорий и тд. насыщенных bitrixId конкретных порталов

 konstructor
   /types // типизация для прриложений при использовании portal
  /domain //crud в db


