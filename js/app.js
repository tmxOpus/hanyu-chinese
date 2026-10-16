(() => {
  // ---------- Константы и DOM ----------
  const HAN = /[㐀-䶿一-鿿]/;
  const CYRILLIC = /[а-яё]/i;
  const LATIN_PINYIN = /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü\s'’-]+$/i;
  const HISTORY_KEY = "hanyu.history";
  const MAX_HISTORY = 12;
  const EXAMPLES = ["привет", "你好", "школа", "学习", "nǐ hǎo", "кошка", "пельмени"];

  const $ = (sel) => document.querySelector(sel);
  const form = $("#searchForm");
  const input = $("#query");
  const resultBox = $("#result");
  const suggestBox = $("#suggest");
  const historyBox = $("#historyBox");
  const historyList = $("#history");

  let searchId = 0;      // защита от устаревших ответов сети

  // ---------- Утилиты ----------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.append(child instanceof Node ? child : document.createTextNode(child));
    }
    return node;
  }

  const normRu = (s) => s.toLowerCase().replace(/ё/g, "е").trim();

  // Пиньинь без тонов и пробелов — для поиска по латинице
  const stripTones = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s'’-]/g, "");

  // Тон по диакритике: 1–4, либо 5 (нейтральный)
  function toneOf(syllable) {
    const marks = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };
    for (const ch of syllable.normalize("NFD")) {
      if (marks[ch]) return marks[ch];
    }
    return 5;
  }

  // Пиньинь: каждый слог окрашивается по своему тону
  function pinyinNode(text) {
    const parts = text.split(/\s+/).filter(Boolean).map((syl) =>
      el("span", { class: `syl t${toneOf(syl)}`, text: syl })
    );
    return el("div", { class: "pinyin" }, parts.flatMap((p, i) => (i ? [" ", p] : [p])));
  }

  // Ряд пиньиня на основе pinyin-pro (массив слогов по одному на иероглиф)
  function syllablesFor(text) {
    if (!window.pinyinPro) return [];
    try {
      return window.pinyinPro.pinyin(text, { toneType: "mark", type: "array" });
    } catch {
      return [];
    }
  }

  // Цвета штрихов в тон интерфейсу: тёмно-синий фон, бирюзовый акцент
  function strokeColors() {
    return { strokeColor: "#e6f2f5", outlineColor: "#1f3b5a", radicalColor: "#2dd4bf" };
  }

  // ---------- Поиск по словарю ----------
  const ruTokens = (entry) =>
    entry[2].replace(/\([^)]*\)/g, "").split(/[,;]/).map(normRu).filter(Boolean);

  function findExact(q) {
    const dict = window.DICTIONARY || [];
    if (HAN.test(q)) {
      const hit = dict.find((e) => e[0] === q);
      return hit ? toEntry(hit) : null;
    }
    if (CYRILLIC.test(q)) {
      const n = normRu(q);
      const hit = dict.find((e) => ruTokens(e).includes(n));
      return hit ? toEntry(hit) : null;
    }
    if (LATIN_PINYIN.test(q)) {
      const n = stripTones(q);
      const hit = dict.find((e) => stripTones(e[1]) === n);
      return hit ? toEntry(hit) : null;
    }
    return null;
  }

  function findSuggestions(q) {
    const dict = window.DICTIONARY || [];
    let match;
    if (HAN.test(q)) match = (e) => e[0].includes(q);
    else if (CYRILLIC.test(q)) {
      const n = normRu(q);
      match = (e) => ruTokens(e).some((t) => t.startsWith(n));
    } else if (LATIN_PINYIN.test(q)) {
      const n = stripTones(q);
      match = (e) => n.length > 0 && stripTones(e[1]).startsWith(n);
    } else return [];
    return dict.filter((e) => e[0] !== q && match(e)).slice(0, 8);
  }

  function toEntry([zh, pinyin, translation]) {
    return { zh, pinyin, translation, source: "dict" };
  }

  // ---------- Онлайн-перевод (фолбэк) ----------
  async function translateOnline(q) {
    const langpair = HAN.test(q) ? "zh-CN|ru" : "ru|zh-CN";
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(q) +
      "&langpair=" +
      encodeURIComponent(langpair);
    // Ограничиваем ожидание сети, чтобы зависший запрос не блокировал интерфейс
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal, referrerPolicy: "no-referrer" });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("http " + res.status);
    const json = await res.json();
    if (json.responseStatus !== 200) throw new Error("api");
    const text = (json.responseData?.translatedText || "").trim();
    if (!text || normRu(text) === normRu(q)) throw new Error("empty");
    if (HAN.test(q)) return text;

    // Для ru → zh берём только иероглифы: «电视 (diànshì)» → «电视»
    const hanOnly = text.replace(/\([^)]*\)/g, "").replace(/[^㐀-䶿一-鿿]/g, "");
    if (!hanOnly) throw new Error("no-chinese");
    return hanOnly;
  }

  function onlineEntry(q, translated) {
    if (HAN.test(q)) {
      return {
        zh: q,
        pinyin: syllablesFor(q).join(" "),
        translation: translated,
        source: "online",
      };
    }
    return {
      zh: translated,
      pinyin: syllablesFor(translated).join(" "),
      translation: q,
      source: "online",
    };
  }

  // ---------- Анимация иероглифов ----------
  // Данные черт берём с CDN по очереди: если первый недоступен, пробуем второй
  const CHAR_DATA_SOURCES = [
    "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/",
    "https://unpkg.com/hanzi-writer-data@2.0/",
  ];

  function loadCharData(ch, onLoad, onError) {
    // Сначала локальные данные из js/strokes.js — не зависят от сети
    const local = window.STROKE_DATA && window.STROKE_DATA[ch];
    if (local) return onLoad(local);

    let i = 0;
    const tryNext = () => {
      if (i >= CHAR_DATA_SOURCES.length) return onError(new Error("no char data"));
      const url = CHAR_DATA_SOURCES[i++] + ch + ".json";
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error("http " + res.status);
          return res.json();
        })
        .then(onLoad)
        .catch(tryNext);
    };
    tryNext();
  }

  function makeTile(ch, syllable) {
    const stage = el("div", { class: "stage", title: "Нажмите, чтобы посмотреть порядок черт" });
    const replayBtn = el("button", {
      class: "tile-replay",
      type: "button",
      title: "Повторить",
      "aria-label": "Повторить анимацию",
      text: "↻",
    });
    const tile = el("div", { class: "tile" }, [
      stage,
      el("div", { class: "tile-foot" }, [
        syllable
          ? el("span", { class: `tile-py syl t${toneOf(syllable)}`, text: syllable })
          : el("span", { class: "tile-py", text: " " }),
        replayBtn,
      ]),
      el("div", { class: "tile-meta", text: ch }),
    ]);

    let writer = null;
    // Если данных для иероглифа нет — показываем сам символ без анимации
    const fallback = () => {
      stage.replaceChildren(
        el("span", { class: "tile-error", text: ch }),
        el("span", { class: "tile-error", text: "нет анимации" })
      );
      writer = null;
    };

    if (window.HanziWriter) {
      try {
        writer = window.HanziWriter.create(stage, ch, {
          width: 140,
          height: 140,
          padding: 10,
          showOutline: true,
          strokeAnimationSpeed: 1,
          delayBetweenStrokes: 280,
          ...strokeColors(),
          charDataLoader: loadCharData,
          onLoadCharDataError: fallback,
        });
      } catch {
        fallback();
      }
    } else {
      fallback();
    }

    const play = () => writer && writer.animateCharacter();
    // Плитка доступна с клавиатуры: Enter или пробел запускают анимацию
    stage.setAttribute("role", "button");
    stage.setAttribute("tabindex", "0");
    stage.setAttribute("aria-label", `Иероглиф ${ch}: показать порядок черт`);
    stage.addEventListener("click", play);
    stage.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        play();
      }
    });
    replayBtn.addEventListener("click", play);
    tile._writer = writer;
    return tile;
  }

  // Последовательно проигрывает все иероглифы слова
  let playRun = 0;
  function playAll(tiles) {
    const run = ++playRun;
    const writers = tiles.map((t) => t._writer).filter(Boolean);
    (async () => {
      for (const writer of writers) {
        if (run !== playRun) return;
        await new Promise((resolve) => writer.animateCharacter({ onComplete: resolve }));
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })();
  }

  // ---------- Озвучка ----------
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    // Озвучка доступна не во всех браузерах
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.85;
      speechSynthesis.speak(u);
    } catch {
      /* озвучка необязательна */
    }
  }

  // ---------- Отрисовка ----------
  function renderResult(entry) {
    const isChinese = HAN.test(entry.zh);
    const chars = Array.from(entry.zh).filter((c) => HAN.test(c));
    let syllables = syllablesFor(entry.zh);
    if (syllables.length !== chars.length) {
      // Для иероглифов берём слоги, если они совпали по количеству, иначе без подписи
      syllables = chars.map(() => "");
      const parsed = (entry.pinyin || "").split(/\s+/).filter(Boolean);
      if (parsed.length === chars.length) syllables = parsed;
    }

    const tiles = el("div", { class: "tiles" });
    const tileNodes = chars.map((ch, i) => makeTile(ch, syllables[i]));
    tileNodes.forEach((t) => tiles.append(t));

    const speakBtn = el("button", {
      class: "btn-ghost speak",
      type: "button",
      "aria-label": "Произнести",
      text: "🔊",
      onclick: () => speak(entry.zh),
    });

    const card = el("article", { class: "result-card" }, [
      el("div", { class: "result-top" }, [
        el("span", {
          class: "badge",
          text: isChinese ? "Китайский → русский" : "Русский → китайский",
        }),
        entry.source === "online"
          ? el("span", { class: "source online", text: "Автоперевод" })
          : el("span", { class: "source", text: "Словарь" }),
      ]),
      el("div", { class: "word-row" }, [
        el("div", { class: "word-zh", lang: "zh-CN", text: entry.zh }),
        speakBtn,
      ]),
      entry.pinyin ? pinyinNode(entry.pinyin) : null,
      el("div", { class: "meaning" }, [
        el("span", { class: "meaning-label", text: "Перевод" }),
        el("div", { class: "meaning-text", text: entry.translation }),
      ]),
      entry.source === "online"
        ? el("p", { class: "note", text: "Перевод автоматический, сверьтесь со словарём." })
        : null,
      chars.length
        ? el("section", { class: "strokes" }, [
            el("div", { class: "strokes-head" }, [
              el("h2", { class: "section-title", text: "Порядок черт" }),
              el("button", {
                class: "btn-ghost",
                type: "button",
                text: "▶ Все черты",
                onclick: () => playAll(tileNodes),
              }),
            ]),
            window.HanziWriter
              ? tiles
              : el("p", { class: "note", text: "Библиотека анимации не загрузилась." }),
          ])
        : null,
    ]);

    resultBox.replaceChildren(card);
    resultBox.hidden = false;

    // Первый показ сразу проигрывается — так сразу видно, как пишется
    if (tileNodes.length) {
      setTimeout(() => playAll(tileNodes), 350);
    }
  }

  function renderMessage(title, text) {
    resultBox.replaceChildren(
      el("div", { class: "empty" }, [el("strong", { text: title }), el("div", { text })])
    );
    resultBox.hidden = false;
  }

  function renderLoading() {
    resultBox.replaceChildren(
      el("div", { class: "loading" }, [el("span", { class: "spinner" }), el("span", { text: "Ищем…" })])
    );
    resultBox.hidden = false;
  }

  function renderSuggestions(matches) {
    if (!matches.length) {
      suggestBox.hidden = true;
      suggestBox.replaceChildren();
      return;
    }
    suggestBox.replaceChildren(
      el("span", { class: "suggest-label", text: "Похожие" }),
      el(
        "div",
        { class: "chips" },
        matches.map((e) =>
          el("button", {
            class: "chip",
            type: "button",
            onclick: () => runSearch(e[0]),
          }, [el("span", { class: "zh-chip", text: e[0] }), e[2].split(/[,;]/)[0]])
        )
      )
    );
    suggestBox.hidden = false;
  }

  // ---------- История ----------
  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function writeHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {
      /* приватный режим — просто не сохраняем */
    }
  }

  function remember(q) {
    const list = [q, ...readHistory().filter((x) => x !== q)].slice(0, MAX_HISTORY);
    writeHistory(list);
    renderHistory();
  }

  function renderHistory() {
    const list = readHistory();
    historyBox.hidden = list.length === 0;
    historyList.replaceChildren(
      ...list.map((q) =>
        el("button", { class: "chip", type: "button", text: q, onclick: () => runSearch(q) })
      )
    );
  }

  function renderExamples() {
    $("#examples").replaceChildren(
      ...EXAMPLES.map((q) =>
        el("button", { class: "chip", type: "button", text: q, onclick: () => runSearch(q) })
      )
    );
  }

  // ---------- Главный сценарий ----------
  // Убираем управляющие символы и обрезаем длину: длинный ввод не уходит во внешний сервис
  const MAX_QUERY_LENGTH = 100;
  function cleanQuery(raw) {
    return String(raw)
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
  }

  // Пасхалка: при поиске имени «Кира» поднимаются сердечки
  const HEART_NAMES = ["кира", "kira"];
  function floatHearts() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const hearts = ["💖", "💕", "💗", "❤️"];
    for (let i = 0; i < 26; i++) {
      const heart = document.createElement("span");
      heart.className = "heart";
      heart.textContent = hearts[i % hearts.length];
      heart.style.left = `${Math.random() * 100}%`;
      heart.style.animationDelay = `${Math.random() * 1.2}s`;
      heart.style.fontSize = `${14 + Math.random() * 18}px`;
      document.body.append(heart);
      heart.addEventListener("animationend", () => heart.remove());
    }
  }

  async function runSearch(raw) {
    const q = cleanQuery(raw);
    if (!q) return;
    input.value = q;
    const id = ++searchId;
    if (HEART_NAMES.includes(normRu(q).replace(/\s+/g, ""))) floatHearts();

    const url = new URL(location.href);
    url.searchParams.set("q", q);
    history.replaceState(null, "", url);

    const exact = findExact(q);
    if (exact) {
      renderSuggestions([]);
      renderResult(exact);
      remember(q);
      return;
    }

    const suggestions = findSuggestions(q);
    renderSuggestions(suggestions);

    // Латиница (пиньинь) ищется только по словарю — онлайн-перевода для неё нет
    if (!HAN.test(q) && !CYRILLIC.test(q)) {
      if (suggestions.length) resultBox.hidden = true;
      else renderMessage("Не найдено", "Введите слово по-русски или иероглифами.");
      return;
    }

    renderLoading();
    try {
      const translated = await translateOnline(q);
      if (id !== searchId) return; // пришёл ответ на старый запрос
      renderResult(onlineEntry(q, translated));
      remember(q);
    } catch {
      if (id !== searchId) return;
      renderMessage("Не найдено", "Проверьте написание или попробуйте другое слово.");
    }
  }

  // ---------- Запуск ----------
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(input.value);
  });

  renderExamples();
  renderHistory();

  const initial = new URL(location.href).searchParams.get("q");
  if (initial) runSearch(initial);
})();
