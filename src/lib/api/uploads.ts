import { apiUpload } from "./client";

// Загрузка файлов в api: картинки лендинга и обложек, видео уроков.
// Оба маршрута пишут файл на диск потоком и возвращают адрес вида
// /uploads/images/... — его и раздаёт web (src/app/uploads/[...path]).

export const uploadImage = (file: File) => apiUpload<{ url: string }>("/uploads/image", file);

export const uploadVideo = (file: File) => apiUpload<{ url: string }>("/uploads/video", file);

/** Адрес загрузки видео для XHR: он нужен там, где показывают ход отправки. */
export const VIDEO_UPLOAD_URL = "/api/v2/uploads/video";
