# Курс «JavaScript 2» — исходники уроков

Курс `javascript-2` в LMS ([[deploy-server-45]]). На проде уроки хранятся в БД
(`Lesson.content`), здесь — источник правды для правок.

## Что где

| Папка | Что внутри |
|-------|-----------|
| `html/` | то, что залито на прод: `contentFormat = HTML`, рендерится в песочнице |
| `markdown/` | первая, markdown-версия тех же уроков — на прод больше не заливается |

Готовые `html/NN.html` собираются скриптом из двух частей — не правьте их руками:

```
cd html
./assemble.sh 01 "Замыкания и функции высшего порядка — интерактивный урок JavaScript"
./assemble.sh 02 "this и контекст вызова — интерактивный урок JavaScript"
./assemble.sh 03 "Таймеры и планирование — интерактивный урок JavaScript"
```

Скрипт склеивает `_shared.css.html` (общие стили всех уроков курса)
с `NN.body.html` в готовый документ `NN.html`. Правки вносятся в `NN.body.html`
(содержание и демо) или в `_shared.css.html` (оформление сразу всех уроков).

## Как это рендерится

`HtmlLessonRenderer` кладёт документ в `<iframe srcdoc>` с песочницей
`allow-scripts allow-forms allow-popups allow-downloads`. Следствия:

- **скрипты работают** — интерактивные демо в уроках именно на этом и построены;
- **нет `allow-same-origin`** — из урока не видно куки, `localStorage` и DOM самой LMS;
- **нет `allow-modals`** — `alert()`, `confirm()`, `prompt()` внутри урока подвесили бы вкладку, поэтому их в демо нет;
- тему LMS шим прокидывает внутрь как `data-theme="dark|light"` на `<html>` — стили уроков её поддерживают;
- высота iframe считается автоматически, оглавление строится по `h2`/`h3` (`parseHtmlHeadings`).

Эталон стиля, от которого отталкивались, — `potok-i-pozicionirovanie.html` в корне репозитория.

## Заливка на прод

Уроки обновляются SQL-скриптом: dollar-quoted `UPDATE "Lesson" SET "contentFormat" = 'HTML',
content = $tag$…$tag$` по фиксированным id `js2lsn0N20260820prod45`.
Перед заливкой — бэкап БД, прогон на локальной базе внутри `BEGIN; … ROLLBACK;`.
