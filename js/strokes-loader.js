// Загрузка порядка черт одного иероглифа.
// Сначала берём свой файл strokes/<код>.json (он грузится только когда нужен),
// при отсутствии файла пробуем CDN с тем же набором данных.
(() => {
  const CDN_SOURCES = [
    "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/",
    "https://unpkg.com/hanzi-writer-data@2.0/",
  ];
  const cache = new Map();

  // Имя файла по коду символа: 学 → strokes/5b66.json
  function localUrl(ch) {
    return `strokes/${ch.codePointAt(0).toString(16).padStart(4, "0")}.json`;
  }

  function loadStrokeData(ch, onLoad, onError) {
    if (cache.has(ch)) return onLoad(cache.get(ch));

    const urls = [localUrl(ch), ...CDN_SOURCES.map((base) => base + ch + ".json")];
    let i = 0;

    const tryNext = () => {
      if (i >= urls.length) return onError(new Error("no char data"));
      const url = urls[i++];
      // Ошибки сети и битый ответ переходят к следующему источнику;
      // ошибки в onLoad сюда не попадают
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null)
        .then((data) => {
          if (data) {
            cache.set(ch, data);
            onLoad(data);
          } else {
            tryNext();
          }
        });
    };

    tryNext();
  }

  window.loadStrokeData = loadStrokeData;
})();
