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
 model (portal переименовать)
 pbx
  /types // типизация для прриложений при использовании portal
  /domain //crud в db
 konstructor
   /types // типизация для прриложений при использовании portal
  /domain //crud в db


