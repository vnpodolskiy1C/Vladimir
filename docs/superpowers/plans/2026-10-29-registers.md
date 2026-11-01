---
title: План регистров сведений в сервисе объектов и MCP-сервере
description: Задачи реализации маршрутов регистров в расширении СчетаМагазина и инструментов регистров в onec-objects по утверждённой спецификации
tags: [onec, http, mcp]
code: [docs/superpowers/specs/2026-10-29-registers-design.md]
---

# Регистры сведений Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сервис объектов и MCP-сервер `onec-objects` описывают независимые регистры сведений, читают срез и историю и записывают значение с периода.

**Architecture:** Шаблоны URL регистров уже есть в HTTP-сервисе `СчетаМагазина`; код ложится в существующие общие модули расширения (метаданные, значения, данные) и в модуль сервиса, без новых объектов метаданных. MCP-сервер заменяет заглушку регистров сборкой запроса в `execute.ts`; тексты инструментов берутся дословно из спецификации.

**Tech Stack:** встроенный язык 1С, расширение в Hierarchical XML; Node.js 24, TypeScript, `@modelcontextprotocol/sdk`, `zod` 3, `undici`; REST Client.

**Spec:** [docs/superpowers/specs/2026-10-29-registers-design.md](../specs/2026-10-29-registers-design.md)

## Global Constraints

- Работать в текущей ветке своей копии проекта. Основную конфигурацию не менять; новых объектов метаданных в расширении не заводить — меняются только `Module.bsl` трёх общих модулей и модуля сервиса.
- Загрузка расширения в свою базу после каждой задачи 1С: Конфигуратор → «Конфигурация» → «Расширения конфигурации» → `СчетаМагазина` → «Конфигурация» → «Загрузить конфигурацию из файлов…» → каталог `src/extensions/СчетаМагазина` целиком; синтаксический контроль модулей расширения без ошибок; «Обновить конфигурацию базы данных». Публикацию не менять. `.cfe` в git не добавлять.
- Проверка сервиса — запросы `src/tests/registers.http` в REST Client. Адрес и авторизация — `OBJECT_SERVICE_URL` и `OBJECT_SERVICE_AUTH` в `src/tests/.env` (образец `.env.example`, файл в git не входит). В `*.http` значения только через `{{$dotenv NAME}}`, имена переменных латиницей.
- Проверка сервера — `npm test` и `npm run build` в `src/mcp/onec-objects`. Сервер берёт адрес, пользователя и пароль из `OBJECT_SERVICE_URL`, `OBJECT_SERVICE_USER`, `OBJECT_SERVICE_PASSWORD` (README сервера); адреса и пароля нет и в записи подключения агента.
- Ни в коде, ни в документах, ни в сообщениях коммитов нет адреса публикации, порта, имени базы, пользователя и пароля.
- Текст запроса к данным собирается только из имён метаданных регистра; значения клиента — параметрами `&Отбор1…`, `&Период`, `&Дата`. Чтение — `ВЫБРАТЬ РАЗРЕШЕННЫЕ`, без привилегированного режима.
- Предел выдачи среза и истории — 100 записей, из базы запрашивается 101 (`ПЕРВЫЕ 101`), `hasMore` — была ли 101-я.
- Сбой — через существующую `НепредвиденнаяОшибка` модуля сервиса; ответы — через `ОтветJSON`, `ОшибкаJSON`, `ОтказJSON`.
- Тексты описаний и аргументов инструментов регистров — дословно из разделов «Аргументы» и «Описания» спецификации. Пометки: три читающих — `READ_ANNOTATIONS`, запись — `RECORD_ANNOTATIONS` (уже объявлены в `copy.ts`).
- Сообщения коммитов — на русском, описывают изменение проекта.

## Review Focus

- Срез с датой без времени (`date=YYYY-MM-DD` сегодня) должен показать цену, записанную сегодня в `00:00:00` и днём: дата без времени — конец дня. Иначе «курс на сегодня» теряет записи текущего дня. Проверка — задача 4, запрос `priceToday`.
- Повтор той же записи заменяет значение: `replaced=true`, история не растёт. Иначе ассистент на повторе получит дубль или отказ платформы. Проверка — задача 4, повтор `priceRecord` и `priceHistory`.
- Замена значения работника сохраняет `ТабельныйНомер`. Иначе запись «теми же ресурсами» тихо стирает реквизит. Проверка — задача 4, запрос `workerRecord`.
- Параметр с именем ресурса (`Цена=1`) — `400 invalid_parameter`, а не срез без отбора. Иначе модель уверена, что отфильтровала. Проверка — задача 2, запрос `sliceByResource`.
- Подчинённый регистр отклоняется на каждом маршруте `422 unsupported_type` и не виден в `/types`. Проверка — задачи 1, 2, 4, запросы `subordinate…`.

## File map

| Файл | Ответственность |
| --- | --- |
| `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаМетаданные/Ext/Module.bsl` | разрешение имени регистра, описание, операции, регистры в поиске типов |
| `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаЗначения/Ext/Module.bsl` | момент среза, начало периода, значение отбора из строки URL |
| `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаДанные/Ext/Module.bsl` | запросы среза и истории, подготовка и набор записей |
| `src/extensions/СчетаМагазина/HTTPServices/СчетаМагазина/Ext/Module.bsl` | четыре обработчика регистров и разбор параметров |
| `src/tests/registers.http` | запросы маршрутов и отказов |
| `docs/superpowers/specs/2026-10-25-object-service-design.md` | ссылка на спецификацию регистров |
| `src/mcp/onec-objects/src/client.ts` | пути регистров в `ServiceRequest` |
| `src/mcp/onec-objects/src/execute.ts` | сборка запросов регистров, фразы отбора |
| `src/mcp/onec-objects/src/copy.ts` | тексты инструментов, `find_types`, ресурса |
| `src/mcp/onec-objects/src/*.test.ts` | проверки клиента, вызова, сервера |
| `src/mcp/onec-objects/README.md` | без абзаца о заглушке |
| `docs/superpowers/specs/2026-10-29-onec-objects-mcp-design.md` | текст `find_types` |

## Task 1: Регистр в поиске типов и описание регистра

**Files:**
- Modify: `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаМетаданные/Ext/Module.bsl`
- Modify: `src/extensions/СчетаМагазина/HTTPServices/СчетаМагазина/Ext/Module.bsl` (`ОписатьРегистр`)
- Modify: `src/tests/registers.http`
- Modify: `docs/superpowers/specs/2026-10-25-object-service-design.md`

**Interfaces:**
- Consumes: `РазрешитьТип`, `ОписаниеТипа`, `ПараметрURL` того же модуля.
- Produces (экспорт `СчетаМагазинаМетаданные`):
  - `РазрешитьРегистр(ПолноеИмя)` → `Неопределено`, если `РазрешитьТип` имени не знает; иначе `Структура` `name, kind, metadata, independent, periodicity`. `kind` — `register` для объекта из `Метаданные.РегистрыСведений`, иначе `unsupported`. `independent` — `РежимЗаписи = Независимый`. `periodicity` — `nonperiodic|second|day|month|quarter|year`.
  - `ОписаниеРегистра(Регистр)` → структура ответа `GET /register` по спецификации; описание поля — `name, title, required, readable, writable, reason, types`.
  - `ОперацииРегистра(Регистр)` → `Структура` `slice, history, record`, каждая `allowed, reason`.
  - `ИменаИзмерений(Регистр)` → `Массив` имён измерений без `name` и `date`.
- Produces (модуль сервиса): `РегистрИзПараметра(Имя)` → `Структура` `value, error`; `error` — готовый ответ `400 invalid_parameter` (нет имени), `400 invalid_type`, `422 unsupported_type` с текстом из раздела «Ошибки» спецификации, путь `name`.

- [ ] **Step 1: Write the failing requests**

В `src/tests/registers.http` после описаний добавить:

```http
### Описание: непериодический регистр
# @name nonperiodicSchema
GET {{$dotenv OBJECT_SERVICE_URL}}/register?name=РегистрСведений._ДемоОтветственныеЛица
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Отказ: описание подчинённого регистра
# @name subordinateSchema
GET {{$dotenv OBJECT_SERVICE_URL}}/register?name=РегистрСведений.ОтветыНаВопросыАнкет
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Поиск: подчинённый регистр не выдаётся
# @name subordinateTypes
GET {{$dotenv OBJECT_SERVICE_URL}}/types?q=ОтветыНаВопросыАнкет
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Отказ: описание справочника маршрутом регистра
# @name catalogAsRegister
GET {{$dotenv OBJECT_SERVICE_URL}}/register?name=Справочник._ДемоНоменклатура
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
```

- [ ] **Step 2: Run requests to verify they fail**

С текущим расширением в базе: `registerTypes` — нет элемента `РегистрСведений._ДемоЦеныНоменклатуры`; `pricesSchema`, `nonperiodicSchema`, `subordinateSchema` — `501 not_implemented`.

- [ ] **Step 3: Implement**

`НайтиТипы` добавляет к справочникам и документам независимые регистры из `Метаданные.РегистрыСведений` с правом `Чтение` или `Изменение`; элемент — `name, title, kind=register, descriptionUrl="/register?name="+ПараметрURL(name), operations=ОперацииРегистра`. Сортировка и `hasMore` — общие для всех видов. `ОписаниеРегистра` обходит `Измерения`, `Ресурсы`, `Реквизиты` метаданных; `types` — через `ОписаниеТипа(Тип, МетаПоля.Тип)`; `required` — `ПроверкаЗаполнения = ВыдаватьОшибку` или, у измерения, `ЗапрещатьНезаполненныеЗначения`; у реквизита `writable=false` с причиной из спецификации. `ОперацииРегистра`: непериодический — три `allowed=false` с причиной «Регистр непериодический: срез на дату, история и запись с периода не применимы»; иначе `slice` и `history` по праву `Чтение`, `record` по праву `Изменение`. `ОписатьРегистр`: `ПроверитьПараметры(Запрос, "name")`, `РегистрИзПараметра`, право `Чтение` или `Изменение` (иначе `403 forbidden`), `ОтветJSON(200, ОписаниеРегистра(...))`. `РазрешитьТип` и маршруты `/type`, `/search`, `/object` не менять.

В спецификации сервиса объектов в «Границах универсальности» фразу «Регистры, константы, отчёты и обработки вне контракта.» заменить на «Независимые регистры сведений — в [спецификации регистров](2026-10-29-registers-design.md); прочие регистры, константы, отчёты и обработки вне контракта.»; в «Найти тип» после перечня `kind` добавить «Элементы регистров — по [спецификации регистров](2026-10-29-registers-design.md#найти-тип).»

- [ ] **Step 4: Load extension and run requests**

Загрузить расширение (Global Constraints). Ожидание:
- `registerTypes` — `200`, среди `items` элемент `name=РегистрСведений._ДемоЦеныНоменклатуры`, `kind=register`, `title=Демо: Цены номенклатуры`, у `operations` ключи `slice, history, record`. `subordinateTypes` — `200`, элемента `РегистрСведений.ОтветыНаВопросыАнкет` в `items` нет.
- `pricesSchema`, `ratesSchema`, `workersSchema` — `200`, `periodicity` и состав `dimensions`, `resources`, `attributes` с типами, квалификаторами и `required` — как в таблицах «Демо-регистры» спецификации. У `ТабельныйНомер` `writable=false`.
- `nonperiodicSchema` — `200`, `periodicity=nonperiodic`, три операции `allowed=false`.
- `subordinateSchema` — `422 unsupported_type`, текст про подчинение регистратору, путь `name`; `catalogAsRegister` — `422 unsupported_type`, «Поддерживаются только независимые регистры сведений».

- [ ] **Step 5: Commit**

```bash
git add src/extensions/СчетаМагазина src/tests/registers.http docs/superpowers/specs/2026-10-25-object-service-design.md
git commit -m "Сервис объектов описывает независимые регистры сведений и находит их в поиске типов.

Подчинённые регистратору регистры отклоняются, непериодические описываются без операций."
```

## Task 2: Срез последних

**Files:**
- Modify: `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаЗначения/Ext/Module.bsl`
- Modify: `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаДанные/Ext/Module.bsl`
- Modify: `src/extensions/СчетаМагазина/HTTPServices/СчетаМагазина/Ext/Module.bsl` (`ПолучитьСрезРегистра`)
- Modify: `src/tests/registers.http`

**Interfaces:**
- Consumes: `РазрешитьРегистр`, `ОписаниеРегистра`, `ОперацииРегистра`, `ИменаИзмерений`, `РегистрИзПараметра` (задача 1); `ИзJSON`, `ВJSON`, `НайтиОписание`.
- Produces:
  - `СчетаМагазинаЗначения.МоментСреза(Строка)` → `Дата` или `Неопределено`: `YYYY-MM-DDTHH:mm:ss` как есть, `YYYY-MM-DD` — `КонецДня`.
  - `СчетаМагазинаЗначения.ЗначениеОтбораИзСтроки(Строка, Поле, ТипыПоля, Путь, Ошибки)` → значение 1С; строку URL приводит к значению JSON по таблице «Отбор по измерениям» спецификации (число — разбор `ПрочитатьJSON` с проверкой, что это число; `true`/`false`; составной — разбор JSON-объекта) и передаёт в `ИзJSON` с ролью `ordinary`.
  - `СчетаМагазинаДанные.ЗаписиРегистра(Регистр, Описание, Момент, Отбор, ЭтоСрез, Ошибки)` → `Структура` `items, hasMore`. `Отбор` — `Соответствие` имя измерения → значение 1С. `ЭтоСрез` — `СрезПоследних(&Дата, …)`, иначе основная таблица с `УПОРЯДОЧИТЬ ПО Период УБЫВ`. Элемент — `period, dimensions, resources, attributes`; значения через `ВJSON`, ошибки чтения с путём `items[<i>].<раздел>.<Имя>`.
  - Модуль сервиса: `ПараметрыРегистра(Запрос, Регистр, Описание, СДатой)` → `Структура` `date, filter, error`; допустимые параметры — `name`, `date` при `СДатой`, `ИменаИзмерений`.

- [ ] **Step 1: Write the failing requests**

Добавить в `registers.http`:

```http
### Отказ: отбор по ресурсу
# @name sliceByResource
GET {{$dotenv OBJECT_SERVICE_URL}}/register/slice?name=РегистрСведений._ДемоЦеныНоменклатуры&Цена=1
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Отказ: срез непериодического регистра
# @name nonperiodicSlice
GET {{$dotenv OBJECT_SERVICE_URL}}/register/slice?name=РегистрСведений._ДемоОтветственныеЛица
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Отказ: срез подчинённого регистра
# @name subordinateSlice
GET {{$dotenv OBJECT_SERVICE_URL}}/register/slice?name=РегистрСведений.ОтветыНаВопросыАнкет
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Отказ: неверная дата среза
# @name sliceBadDate
GET {{$dotenv OBJECT_SERVICE_URL}}/register/slice?name=РегистрСведений.КурсыВалют&date=2026-13-01
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
```

- [ ] **Step 2: Run requests to verify they fail**

`priceNow`, `rateToday`, `workerNow`, `sliceByResource` — `501 not_implemented`.

- [ ] **Step 3: Implement**

`ПолучитьСрезРегистра`: `РегистрИзПараметра`; право `Чтение` (иначе `403`); операция `slice` (иначе `422 unsupported_operation` с её `reason`); `ПараметрыРегистра(..., Истина)`; нет `date` — `ТекущаяДатаСеанса()`; `ЗаписиРегистра(..., Истина, Ошибки)`; ошибки чтения — `422 unsupported_value`; ответ `200` `name, date, items, hasMore`, `date` в форме `YYYY-MM-DDTHH:mm:ss`. Неизвестный параметр, неверная дата, неверное значение отбора — `400 invalid_parameter` с путём — именем параметра. Условия отбора — `<Измерение> = &ОтборN` в параметрах виртуальной таблицы; порядок — по измерениям в порядке метаданных.

- [ ] **Step 4: Load extension and run requests**

- `priceNow`, `priceMonthAgo` — `200`, `name`, `date`, `items` (каждый элемент — `period`, `dimensions.Номенклатура` равен `REGISTER_PRODUCT`, `resources.Цена` число), `hasMore=false`. Пустой `items` допустим, если у товара нет цены на дату.
- `rateToday` — `200`, у элемента `resources.Курс` и `resources.Кратность`; `date` — сегодня `T23:59:59`.
- `workerNow` — `200`, у элемента `resources.ПодразделениеОрганизации` и `attributes.ТабельныйНомер`.
- `sliceByResource` — `400 invalid_parameter`, путь `Цена`. `sliceBadDate` — `400 invalid_parameter`, путь `date`.
- `nonperiodicSlice` — `422 unsupported_operation`; `subordinateSlice` — `422 unsupported_type`.

- [ ] **Step 5: Commit**

```bash
git add src/extensions/СчетаМагазина src/tests/registers.http
git commit -m "Сервис объектов отдаёт срез последних значений регистра на дату с отбором по измерениям.

Параметр не из измерений регистра отклоняется, дата без времени берётся на конец дня."
```

## Task 3: История по ключу

**Files:**
- Modify: `src/extensions/СчетаМагазина/HTTPServices/СчетаМагазина/Ext/Module.bsl` (`ПолучитьИсториюРегистра`)
- Modify: `src/tests/registers.http`

**Interfaces:**
- Consumes: `РегистрИзПараметра`, `ПараметрыРегистра(..., Ложь)`, `ЗаписиРегистра(..., Ложь, ...)` (задачи 1–2).
- Produces: обработчик `GET /register/history`.

- [ ] **Step 1: Write the failing request**

```http
### Отказ: история с датой
# @name historyWithDate
GET {{$dotenv OBJECT_SERVICE_URL}}/register/history?name=РегистрСведений._ДемоЦеныНоменклатуры&date=2026-01-01
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
```

- [ ] **Step 2: Run requests to verify they fail**

`priceHistory`, `historyWithDate` — `501 not_implemented`.

- [ ] **Step 3: Implement**

Как срез, но операция `history`, без `date`, ответ `200` `name, items, hasMore`, порядок — период по убыванию, затем измерения.

- [ ] **Step 4: Load extension and run requests**

`priceHistory` — `200`, у всех элементов `dimensions.Номенклатура` равен `REGISTER_PRODUCT`, периоды не возрастают. Первый элемент совпадает с элементом `priceNow`, если у товара нет цен с будущим периодом. `historyWithDate` — `400 invalid_parameter`, путь `date`.

- [ ] **Step 5: Commit**

```bash
git add src/extensions/СчетаМагазина src/tests/registers.http
git commit -m "Сервис объектов отдаёт историю значений регистра по ключу измерений, от новых к старым."
```

## Task 4: Запись значения

**Files:**
- Modify: `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаЗначения/Ext/Module.bsl`
- Modify: `src/extensions/СчетаМагазина/CommonModules/СчетаМагазинаДанные/Ext/Module.bsl`
- Modify: `src/extensions/СчетаМагазина/HTTPServices/СчетаМагазина/Ext/Module.bsl` (`ЗаписатьЗначениеРегистра`, удалить `НеРеализовано`)
- Modify: `src/tests/registers.http`

**Interfaces:**
- Consumes: задачи 1–2; `ДопустимыйТипСодержимого`, разбор JSON и транзакционная схема `СоздатьОбъект` модуля сервиса.
- Produces:
  - `СчетаМагазинаЗначения.НачалоПериода(Строка, Периодичность)` → `Дата` или `Неопределено`: разбор `YYYY-MM-DD` или `YYYY-MM-DDTHH:mm:ss`, затем `НачалоДня`/`НачалоМесяца`/`НачалоКвартала`/`НачалоГода` по `periodicity`, `second` — как есть.
  - `СчетаМагазинаДанные.ПодготовитьЗаписьРегистра(Данные, Регистр, Описание, Ошибки)` → `Структура` `period, dimensions, resources` (`Соответствие` имя → значение 1С). Проверяет ключи корня, наличие всех измерений и ресурсов, неизвестные имена, пустое обязательное измерение; пути — `period`, `dimensions.<Имя>`, `resources.<Имя>`.
  - `СчетаМагазинаДанные.НаборЗаписиРегистра(Регистр, Подготовленные)` → `Структура` `set, replaced`: набор с отбором по `Период` и всем измерениям, прочитанный; ресурсы заменены в найденной записи или добавлена новая.
  - Ответ — первая запись `ЗаписиРегистра` по тому же ключу на основной таблице с отбором `Период = &Период` плюс `name` и `replaced`.

- [ ] **Step 1: Write the failing requests**

Добавить в `registers.http` после `priceRecord`:

```http
### Срез: цена товара на сегодня без времени
# @name priceToday
GET {{$dotenv OBJECT_SERVICE_URL}}/register/slice?name=РегистрСведений._ДемоЦеныНоменклатуры&date={{$datetime "YYYY-MM-DD"}}&Номенклатура={{$dotenv REGISTER_PRODUCT}}
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}

### Запись: работник теми же значениями — табельный номер сохраняется
# Выполнять после workerNow: период и ресурсы берутся из его ответа.
# @name workerRecord
POST {{$dotenv OBJECT_SERVICE_URL}}/register/record
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
Content-Type: application/json; charset=utf-8

{
  "name": "РегистрСведений._ДемоРаботникиОрганизаций",
  "period": "{{workerNow.response.body.$.items[0].period}}",
  "dimensions": { "Организация": "{{$dotenv REGISTER_ORGANIZATION}}", "ФизическоеЛицо": "{{$dotenv REGISTER_PERSON}}" },
  "resources": {
    "ПодразделениеОрганизации": "{{workerNow.response.body.$.items[0].resources['ПодразделениеОрганизации']}}",
    "ЗанимаемыхСтавок": {{workerNow.response.body.$.items[0].resources['ЗанимаемыхСтавок']}}
  }
}

### Отказ: запись без ресурса
# @name recordMissingResource
POST {{$dotenv OBJECT_SERVICE_URL}}/register/record
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
Content-Type: application/json; charset=utf-8

{
  "name": "РегистрСведений._ДемоЦеныНоменклатуры",
  "period": "{{$datetime "YYYY-MM-DD"}}",
  "dimensions": { "Номенклатура": "{{$dotenv REGISTER_PRODUCT}}" },
  "resources": {}
}

### Отказ: запись в подчинённый регистр
# @name subordinateRecord
POST {{$dotenv OBJECT_SERVICE_URL}}/register/record
Authorization: {{$dotenv OBJECT_SERVICE_AUTH}}
Content-Type: application/json; charset=utf-8

{
  "name": "РегистрСведений.ОтветыНаВопросыАнкет",
  "period": "{{$datetime "YYYY-MM-DD"}}",
  "dimensions": {},
  "resources": {}
}
```

Если REST Client не подставил значение из ответа `workerNow` (в теле остался текст `{{…}}`), подставить период и ресурсы из ответа `workerNow` руками и отправить тот же запрос.

- [ ] **Step 2: Run requests to verify they fail**

`priceRecord`, `workerRecord`, `recordMissingResource`, `subordinateRecord` — `501 not_implemented`.

- [ ] **Step 3: Implement**

`ЗаписатьЗначениеРегистра` повторяет схему `СоздатьОбъект`: `ПроверитьПараметры(Запрос, "")`, `415` по `ДопустимыйТипСодержимого`, разбор JSON без хвоста (`400 invalid_json`), корень — `400 invalid_data`; имя — `РазрешитьРегистр` (`400 invalid_type` / `422 unsupported_type`, путь `name`); право `Изменение` (`403`); операция `record` (`422 unsupported_operation`); `ПодготовитьЗаписьРегистра` (ошибки — `400 invalid_data` все сразу). Затем транзакция: `НаборЗаписиРегистра`; `ПолучитьСообщенияПользователю(Истина)`; `ПроверитьЗаполнение()` набора — отказ: отмена и `422 validation_failed` с сообщениями (путь `null`, если не сопоставлен); `Записать(Истина)`; перечитать запись; `ОтветJSON(200, …)` до `ЗафиксироватьТранзакцию()`; исключение — отмена и `НепредвиденнаяОшибка`. Функцию `НеРеализовано` удалить: вызовов не осталось.

- [ ] **Step 4: Load extension and run requests**

По порядку:
1. `priceRecord` — `200`, `period` — сегодня `T00:00:00`, `resources.Цена=1500`, `replaced` — `false`, если цены на этот период не было.
2. `priceNow` и `priceToday` — элемент с `period` сегодня `T00:00:00` и `Цена=1500`. `priceMonthAgo` — без этой записи.
3. `priceHistory` — первый элемент с этим периодом; запомнить число элементов.
4. Повтор `priceRecord` — `200`, `replaced=true`; `priceHistory` — то же число элементов.
5. `workerNow`, затем `workerRecord` — `200`, `replaced=true`, `attributes.ТабельныйНомер` равен значению из `workerNow`.
6. `recordMissingResource` — `400 invalid_data`, деталь с путём `resources.Цена`. `subordinateRecord` — `422 unsupported_type`.
7. Ни один маршрут регистров не отвечает `501`.

- [ ] **Step 5: Commit**

```bash
git add src/extensions/СчетаМагазина src/tests/registers.http
git commit -m "Сервис объектов записывает значение регистра с периода, заменяя запись того же периода и ключа.

Реквизиты заменённой записи сохраняются, неполный ключ или пропущенный ресурс отклоняются до записи."
```

## Task 5: Запросы инструментов регистров

**Files:**
- Modify: `src/mcp/onec-objects/src/client.ts`
- Modify: `src/mcp/onec-objects/src/execute.ts`
- Test: `src/mcp/onec-objects/src/execute.test.ts`
- Test: `src/mcp/onec-objects/src/client.test.ts`
- Test: `src/mcp/onec-objects/src/server.test.ts`

**Interfaces:**
- Consumes: `ServiceClient`, `ServiceRequest`, `ToolResult`; `missingArg`, `stringArg`, `objectArg`.
- Produces:
  - `ServiceRequest.path` дополнен `"/register" | "/register/slice" | "/register/history" | "/register/record"`.
  - `filterValueArg(key: string): string` → `Неверный вызов инструмента. Значение отбора ${key} должно быть строкой, числом, булевым или объектом.`
  - `filterKeyArg(key: string): string` → `Неверный вызов инструмента. Ключ отбора ${key} совпадает с параметром запроса.`
  - `notConnected` и список `REGISTER_TOOLS` удалены.

- [ ] **Step 1: Write the failing test**

В `execute.test.ts`, подставной клиент как в файле:
- `описание регистра — GET /register с name`: `describe_register` `{ name: "РегистрСведений.КурсыВалют" }` → `GET /register`, `query` `[["name", "РегистрСведений.КурсыВалют"]]`.
- `срез собирает name, date и отбор по порядку`: `read_register_slice` `{ name: "Р", date: "2026-10-29", filter: { Номенклатура: "u", Количество: 2, Флаг: true, Составное: { type: "CatalogRef.А", value: "v" } } }` → `GET /register/slice`, `query` `[["name","Р"],["date","2026-10-29"],["Номенклатура","u"],["Количество","2"],["Флаг","true"],["Составное",'{"type":"CatalogRef.А","value":"v"}']]`. Без `date` — пары `date` нет; без `filter` — одна пара `name`.
- `история без date`: `read_register_history` `{ name: "Р", filter: { Валюта: "u" } }` → `GET /register/history`, `[["name","Р"],["Валюта","u"]]`.
- `запись шлёт одно тело из четырёх ключей`: `write_register_record` `{ name: "Р", period: "2026-10-29", dimensions: { А: "u" }, resources: { Цена: 1500 }, лишний: 1 }` → `POST /register/record`, `contentType` `application/json; charset=utf-8`, `body` равно `JSON.stringify({ name: "Р", period: "2026-10-29", dimensions: { А: "u" }, resources: { Цена: 1500 } })`.
- `неверные вызовы регистров не ходят в сервис`: `filter: { А: null }` и `filter: { А: [1] }` → `filterValueArg("А")`; `filter: { date: "x" }` → `filterKeyArg("date")`; `filter: { name: "x" }` у истории → `filterKeyArg("name")`; `filter: []` → `objectArg("filter")`; `date: 1` → `stringArg("date")`; запись без `period` → `missingArg("period")`; `resources: []` → `objectArg("resources")`. `requests.length === 0`.

В `server.test.ts` тест `инструмент регистра пока отвечает заглушкой и не ходит в сервис` заменить на `describe_register доходит до сервиса одним запросом`: подставной клиент с текстом `{"name":"РегистрСведений.КурсыВалют"}` — результат тот же текст, `isError` не `true`, `requests.length === 1`, `requests[0].path === "/register"`. Импорт `notConnected` убрать.

В `client.test.ts`: `кодирует кириллицу в имени параметра` — `path: "/register/slice"`, `query: [["name", "РегистрСведений.КурсыВалют"], ["Валюта", "u"]]` → сервер получил путь `…/register/slice` и строку запроса из `encodeURIComponent` имён и значений.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test` в `src/mcp/onec-objects`
Expected: FAIL — регистровые инструменты отвечают `notConnected`, `filterValueArg` нет.

- [ ] **Step 3: Implement**

`buildRegisterGet(path, args, withDate)` и `buildRecord(args)` в `execute.ts` рядом с `buildGet` и `buildCreate`; порядок проверок — `name`, `date`, `filter`, затем ключи отбора по порядку. Преобразование значения отбора — по разделу «MCP-сервер» спецификации. Ключи `name` и `date` запрещены у среза и у истории.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` и `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/mcp/onec-objects/src
git commit -m "Инструменты регистров собирают запросы сервиса объектов вместо заглушки.

Отбор становится параметрами с именами измерений, тело записи — четыре ключа без преобразования."
```

## Task 6: Тексты инструментов регистров

**Files:**
- Modify: `src/mcp/onec-objects/src/copy.ts`
- Modify: `src/mcp/onec-objects/src/server.test.ts`
- Modify: `src/mcp/onec-objects/README.md`
- Modify: `docs/superpowers/specs/2026-10-29-onec-objects-mcp-design.md`

**Interfaces:**
- Consumes: `createMcpServer`, `READ_ANNOTATIONS`, `RECORD_ANNOTATIONS`.
- Produces: `DESCRIPTIONS.describe_register`, `.read_register_slice`, `.read_register_history`, `.write_register_record` — тексты оград раздела «Описания» спецификации регистров; `DESCRIPTIONS.find_types` и `TYPES_RESOURCE_DESCRIPTION` — тексты ниже. `ARGUMENT_DESCRIPTIONS` не меняются.

- [ ] **Step 1: Write the failing test**

В `server.test.ts`:
- Константа `REGISTER_SPEC` — чтение `docs/superpowers/specs/2026-10-29-registers-design.md` тем же способом, что `SPEC`. Помощники `fenceAfter`, `specDescription`, `specTitle` принимают текст спецификации параметром.
- Тест `объявляет четыре инструмента регистров с дословными текстами и пометками`: для каждого из `REGISTER_NAMES` `title` равен заголовку из таблицы `REGISTER_SPEC`, `description` — ограде после `` `<имя>`: `` в разделе `### Описания` `REGISTER_SPEC`; каждое описание аргумента входит в `REGISTER_SPEC` как `«<описание>»`; `required`: `describe_register`, `read_register_slice`, `read_register_history` — `["name"]`, `write_register_record` — `["dimensions","name","period","resources"]` после сортировки; пометки — как в существующем тесте регистров; `outputSchema` нет.
- `TYPES_DESCRIPTION` в тесте равна новому тексту ресурса.

Новый текст ограды `find_types` в спецификации MCP-сервера и в `DESCRIPTIONS.find_types`:

```text
Ищет типы справочников, документов и независимых регистров сведений по вхождению слова в техническое имя или синоним. Вызывать, когда нужно узнать, какие типы есть в базе. q — искомое слово; брать основу слова без окончания, например «цен», а не «цена». limit необязателен: без него сервис сам ограничивает выдачу. Ответ сервиса приходит как есть. items — найденные типы, kind register у регистра; hasMore true значит, что найдено не всё. Отказ сервиса приходит его JSON.
```

Новый `TYPES_RESOURCE_DESCRIPTION`:

```text
Список типов справочников, документов и независимых регистров сведений из сервиса объектов для контекста приложения. Это ответ сервиса без переработки: поиск по точке в полном имени, предел 100. hasMore true значит, что типов больше.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — описания регистров в `copy.ts` не совпадают с оградами спецификации, `find_types` не совпадает с оградой спецификации MCP-сервера после её правки.

- [ ] **Step 3: Implement**

Заменить ограду `find_types` в `docs/superpowers/specs/2026-10-29-onec-objects-mcp-design.md` (раздел «Описания») текстом выше. В `copy.ts` вписать дословно четыре описания регистров из спецификации регистров, новый `find_types` и `TYPES_RESOURCE_DESCRIPTION`. `server.ts` не трогать: схемы и пометки уже объявлены. В README убрать абзац о заглушке и написать одной фразой, что инструменты регистров ходят в маршруты `/register…` сервиса объектов, со ссылкой на спецификацию регистров.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test` и `npm run build`
Expected: PASS, `dist/index.js` собран.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/onec-objects/src/copy.ts src/mcp/onec-objects/src/server.test.ts src/mcp/onec-objects/README.md docs/superpowers/specs/2026-10-29-onec-objects-mcp-design.md
git commit -m "MCP-сервер описывает инструменты регистров дословно по спецификации.

Поиск типов называет регистры сведений и подсказывает искать по основе слова."
```

## Task 7: Приёмка

**Files:** нет изменений в git.

- [ ] **Step 1: Прогон файла запросов**

Все запросы `src/tests/registers.http` сверху вниз дают ответы задач 1–4; ни одного `501`.

- [ ] **Step 2: Выгрузка расширения**

Конфигуратор → «Расширения конфигурации» → `СчетаМагазина` → «Сохранить в файл…» → `.cfe` в каталоге вне git (`*.cfe` закрыт `.gitignore`). `git status` не показывает `.cfe`.

- [ ] **Step 3: Проверка из чата агента**

Собрать сервер (`npm ci`, `npm run build` в `src/mcp/onec-objects`), задать в окружении клиента агента `OBJECT_SERVICE_URL`, `OBJECT_SERVICE_USER`, `OBJECT_SERVICE_PASSWORD`, открыть новый чат в корне проекта. Просьбы:
1. «Какая цена у товара «1С:Бухгалтерия 8» сейчас и месяц назад?» — ожидание: вызовы `find_types` (основа слова), `describe_register`, `find_objects` для товара, два `read_register_slice` с `filter.Номенклатура` и датами сейчас и месяц назад; ответ называет обе цены или их отсутствие.
2. «Установи цену 1600 с сегодняшнего дня.» — ожидание: перед `write_register_record` клиент спрашивает подтверждение; ответ инструмента — `200` с сегодняшним периодом и `Цена=1600`.

- [ ] **Step 4: Проверка в 1С**

Человек открывает в клиенте 1С список регистра «Демо: Цены номенклатуры» и видит запись товара с сегодняшним периодом и ценой 1600. Исполнитель этот пункт не объявляет выполненным без подтверждения человека.
