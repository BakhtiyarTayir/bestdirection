# Эталонная вёрстка лендинга — проект курса «HTML и CSS»

Референс для преподавателя: как должен выглядеть проект студента в конце курса.
Вся страница собрана только на HTML и CSS — **без JavaScript**, всё из программы курса.

```
landing-reference/
├── index.html          — разметка целиком
├── css/style.css       — стили, разбиты на секции по этапам проекта
├── images/
│   ├── avatar.jpg      — фото для hero
│   ├── work-1.jpg      — превью «Designing Dashboards»
│   ├── work-2.jpg      — превью «Vibrant Portraits»
│   └── work-3.jpg      — превью «36 Days of Malayalam type»
└── mockup.jpg          — исходный макет для сверки
```

Открывается двойным кликом по `index.html` — сборка не нужна.
В VS Code удобнее через расширение **Live Server** (оно уже упоминается в уроке 1 CSS).

---

## Что где закреплено

Секции в `style.css` пронумерованы и подписаны этапами проекта — можно выдавать студентам
файл кусками, по мере прохождения тем.

| В коде | Тема курса |
|---|---|
| `:root` с переменными | CSS-переменные (новый урок) |
| Сброс стилей, `box-sizing` | Box Model, урок 4 |
| `clamp()` у заголовков | Единицы измерения, уроки 14–15 |
| `position: sticky` + `z-index` у шапки | Позиционирование, уроки 8–9 |
| `.nav__link::after` | Псевдоэлементы (новый урок) |
| `border-radius: 50%` + `object-fit` у аватара | Background и изображения, уроки 10–11 |
| `.badge`, тени карточек | Тени (новый урок) |
| `grid-template-columns` у постов | CSS Grid, урок 29 |
| `display: flex` у шапки, работ, футера | Flexbox, уроки 26–28 |
| `transition` на кнопке и карточках | Transitions, урок 23 |
| `@keyframes fade-in-up` + `animation-delay` | Animations, уроки 24–25 |
| `@media` в конце файла | RWD, уроки 18–19 |
| Форма в секции «Контакты» | Стилизация форм, урок 13 |

Проверочные точки для студента: шапка прилипает при прокрутке, превью работы
увеличивается под курсором, на ширине 640px всё складывается в одну колонку,
hero выезжает снизу при загрузке.

---

## Иконки

В подвале стоят иконки из **[Lucide](https://lucide.dev)** — вставлены инлайн, прямо в HTML.
Лицензия ISC, использование свободное. Ищем нужную иконку на сайте → кнопка «Copy SVG».

Инлайн-SVG удобен тем, что цвет иконки задаётся из CSS через `currentColor`:

```css
.socials__link { color: var(--color-heading); }
.socials__link:hover { color: var(--color-accent); }
```

Другие бесплатные наборы, если нужен другой стиль:

| Набор | Ссылка | Особенности |
|---|---|---|
| Lucide | https://lucide.dev | контурные, ISC, используется здесь |
| Simple Icons | https://simpleicons.org | 3000+ **логотипов брендов** (Telegram, VK, GitHub), CC0 |
| Bootstrap Icons | https://icons.getbootstrap.com | контурные и залитые, MIT |
| Feather | https://feathericons.com | предок Lucide, MIT |
| Heroicons | https://heroicons.com | от авторов Tailwind, MIT |
| Tabler Icons | https://tabler.io/icons | 5000+ иконок, MIT |
| Font Awesome Free | https://fontawesome.com/search?o=r&m=free | классика, есть бренд-иконки, CC BY 4.0 |

> Для соцсетей корректнее брать **Simple Icons** — там официальные логотипы.
> В этом эталоне взят Lucide, чтобы весь набор был в одном стиле.

---

## Картинки

`images/work-*.jpg` — это **сгенерированные заглушки** в цветах макета. Их нужно заменить
своими работами, иначе портфолио бессмысленно. Где брать бесплатные фото:

| Источник | Ссылка | Лицензия |
|---|---|---|
| Unsplash | https://unsplash.com | свободно, без обязательной атрибуции |
| Pexels | https://pexels.com | свободно |
| Pixabay | https://pixabay.com | свободно |
| Placeholder-заглушки | https://placehold.co | генерируются по ссылке, удобны на время вёрстки |

Перед загрузкой на сайт картинки стоит сжать — https://squoosh.app или https://tinypng.com.
Файл на 4 МБ в портфолио — самая частая ошибка новичка.

---

## Шрифт

Сейчас используется системный стек (`Segoe UI`, `system-ui`, `Roboto`) — страница
работает без интернета. Как в уроках 20–21, шрифт можно заменить на Google Fonts:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
```

```css
:root { --font-base: "Inter", system-ui, sans-serif; }
```

Похожие на макет варианты: **Inter**, **Poppins**, **Manrope**, **Work Sans**.

---

## Отличия от макета

- Добавлена секция **«Контакты»** с формой — в макете её нет, но на неё ведёт пункт меню
  `Contact`, и она закрывает тему стилизации форм (этап 9).
- Добавлен логотип `John.` слева в шапке — в макете шапка пустая слева, но так
  студенту проще понять, зачем в шапке `justify-content: space-between`.
- Тексты написаны по-русски: студент их всё равно заменяет своими.

---

## Публикация

Финальный шаг проекта — выложить сайт в интернет:

1. Создать репозиторий на GitHub, залить туда содержимое папки.
2. Settings → Pages → Source: `main`, папка `/root` → Save.
3. Через минуту сайт доступен по адресу `https://<логин>.github.io/<репозиторий>/`.

Альтернатива без Git: https://app.netlify.com/drop — папка перетаскивается мышью
в окно браузера, ссылка выдаётся сразу.

Перед сдачей стоит прогнать страницу через валидаторы:
https://validator.w3.org (HTML) и https://jigsaw.w3.org/css-validator (CSS).
