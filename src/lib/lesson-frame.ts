import { parseHtmlHeadings } from "@/lib/toc";

/** Один урок на страницу, поэтому id фиксированный — по нему его находит оглавление. */
export const LESSON_FRAME_ID = "lesson-content-frame";

/** DOM-событие для оглавления: iframe пересчитал высоту и позиции заголовков. */
export const LESSON_FRAME_LAYOUT_EVENT = "lesson-frame-layout";

/** Сообщения, которыми обмениваются страница и iframe с HTML-уроком. */
export const FRAME_MESSAGE = {
  /** iframe → страница: контент перерисовался, вот новая высота и позиции заголовков. */
  layout: "lesson-frame:layout",
  /** страница → iframe: сменилась тема LMS. */
  theme: "lesson-frame:theme",
} as const;

export interface FrameLayoutMessage {
  type: typeof FRAME_MESSAGE.layout;
  frameId: string;
  height: number;
  /** offsetTop заголовков внутри документа урока — для оглавления. */
  headings: { id: string; top: number }[];
}

/** Потолок высоты: страховка от урока с `height: 100vh`, который иначе растёт бесконечно. */
const MAX_FRAME_HEIGHT = 40000;

/**
 * Скрипт-шим, который добавляется в конец документа урока.
 *
 * Живёт в изолированном origin (sandbox без allow-same-origin), поэтому
 * общается со страницей только через postMessage и ничего не знает про LMS.
 */
function buildShim(frameId: string, headings: { id: string; domIndex: number }[]): string {
  return `
(function(){
  'use strict';
  var FRAME_ID = ${JSON.stringify(frameId)};
  var HEADINGS = ${JSON.stringify(headings)};
  var MAX_H = ${MAX_FRAME_HEIGHT};

  // Находим заголовки по номеру в исходнике. Сопоставлять по тексту нельзя:
  // скрипт урока успевает отработать раньше нас и может заполнить пустой
  // заголовок, сбив любую нумерацию «на лету».
  var headingNodes = [];
  (function(){
    var all = document.querySelectorAll('h2, h3');
    for (var i = 0; i < HEADINGS.length; i++) {
      var el = all[HEADINGS[i].domIndex];
      if (!el) continue;
      if (!el.id) el.id = HEADINGS[i].id;
      headingNodes.push(el);
    }
  })();

  function docHeight(){
    var b = document.body, d = document.documentElement;
    return Math.min(MAX_H, Math.max(
      b ? b.scrollHeight : 0, b ? b.offsetHeight : 0,
      d ? d.scrollHeight : 0, d ? d.offsetHeight : 0
    ));
  }

  function absoluteTop(el){
    var top = 0;
    while (el) { top += el.offsetTop; el = el.offsetParent; }
    return top;
  }

  // Позиции заголовков меняются и без изменения общей высоты, поэтому
  // отправляем их всегда; от лишних срабатываний спасает rAF-троттлинг.
  var scheduled = false;
  function schedule(){
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function(){ scheduled = false; report(); });
  }

  function report(){
    var height = docHeight();
    var headings = [];
    for (var i = 0; i < headingNodes.length; i++) {
      headings.push({ id: headingNodes[i].id, top: absoluteTop(headingNodes[i]) });
    }
    parent.postMessage({
      type: ${JSON.stringify(FRAME_MESSAGE.layout)},
      frameId: FRAME_ID,
      height: height,
      headings: headings
    }, '*');
  }

  if (typeof ResizeObserver === 'function') {
    var ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  }
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
  // Картинки и веб-шрифты догружаются позже и меняют высоту.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(function(){});
  document.addEventListener('load', schedule, true);
  setTimeout(schedule, 0);
  setTimeout(schedule, 300);
  setTimeout(schedule, 1200);

  window.addEventListener('message', function(e){
    var d = e.data;
    if (!d || d.type !== ${JSON.stringify(FRAME_MESSAGE.theme)}) return;
    document.documentElement.setAttribute('data-theme', d.theme === 'dark' ? 'dark' : 'light');
    schedule();
  });
})();
`;
}

/**
 * Правила для документа урока: он рендерится во всю свою высоту, поэтому
 * собственного скролла у него нет — вертикальный скроллбар только помешает.
 */
const FRAME_RESET = `
<style>
  html, body { overflow-y: visible; }
  html { scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
</style>
`;

/**
 * Готовит srcdoc для iframe: автор сохраняет обычный HTML-документ,
 * а мы дописываем к нему шим для авто-высоты и оглавления.
 *
 * Base URL наследуется от родительской страницы (так работает about:srcdoc),
 * поэтому пути вида /uploads/images/... резолвятся сами — <base> не нужен
 * и только сломал бы якорные ссылки внутри урока.
 */
export function buildLessonFrameSrcdoc(content: string, frameId: string): string {
  const items = parseHtmlHeadings(content).map((h) => ({
    id: h.id,
    domIndex: h.domIndex,
  }));
  const shim = `${FRAME_RESET}<script>${buildShim(frameId, items)}</script>`;

  // Фрагмент без обёртки (автор вставил только разметку тела) — достраиваем документ.
  if (!/<html[\s>]/i.test(content)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${content}${shim}</body></html>`;
  }

  if (/<\/body\s*>/i.test(content)) {
    return content.replace(/<\/body\s*>/i, `${shim}</body>`);
  }
  if (/<\/html\s*>/i.test(content)) {
    return content.replace(/<\/html\s*>/i, `${shim}</html>`);
  }
  return content + shim;
}
