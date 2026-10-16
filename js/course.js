(() => {
  // Курс «от звуков к иероглифам»: звуки, уроки с иероглифами, грамматика, упражнения и контрольные.
  const view = document.getElementById("view");
  const KEY = "hanyu.course";
  const PUNCT = /[，。！？、；：,.!?;:“”"'「」（）()\s]/g;
  const HAN = /[㐀-䶿一-鿿]/;

  const lessons = () => window.COURSE_LESSONS || [];
  const checkpoints = () => window.COURSE_CHECKPOINTS || [];

  // ---------- Прогресс (только в браузере пользователя) ----------
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.done && saved.checks) return saved;
    } catch {
      /* нет доступа к хранилищу */
    }
    return { done: {}, checks: {} };
  }

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* прогресс не сохранится, курс работает */
    }
  }

  let state = loadState();

  // ---------- Помощники ----------
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

  function pinyinOf(text) {
    if (!window.pinyinPro) return "";
    try {
      return window.pinyinPro
        .pinyin(text, { toneType: "mark" })
        .replace(/\s+([。，、！？；：,.!?;:])/g, "$1");
    } catch {
      return "";
    }
  }

  // Громкость озвучки упражнений (от 0 до 1), запоминается в браузере
  function volume() {
    return typeof state.volume === "number" ? state.volume : 1;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.8;
      u.volume = volume();
      speechSynthesis.speak(u);
    } catch {
      /* озвучка необязательна */
    }
  }

  const listenButton = (text) =>
    el("button", { class: "icon-btn", type: "button", "aria-label": "Прослушать", text: "🔊", onclick: () => speak(text) });

  // Кнопка запуска звуковой дорожки упражнения
  const playButton = (text) =>
    el("button", { class: "play-btn", type: "button", text: "▶ Прослушать", onclick: () => speak(text) });

  // Регулятор громкости для всех упражнений урока
  function volumeBar() {
    const percent = Math.round(volume() * 100);
    const label = el("span", { class: "vol-value", text: `${percent}%` });
    const input = el("input", {
      type: "range",
      min: "0",
      max: "100",
      step: "5",
      value: String(percent),
      "aria-label": "Громкость озвучки упражнений",
    });
    input.addEventListener("input", () => {
      state.volume = Number(input.value) / 100;
      label.textContent = `${input.value}%`;
      saveState();
    });
    return el("div", { class: "volume-bar" }, [
      el("span", { class: "vol-label", text: "🔈 Громкость" }),
      input,
      label,
      el("button", { class: "btn-ghost small", type: "button", text: "▶ Проверить звук", onclick: () => speak("你好") }),
    ]);
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // Короткий перевод для карточек: до первой запятой или точки с запятой
  const shortRu = (ru) => ru.split(/[,;]/)[0].trim();

  function lessonById(id) {
    return lessons().find((l) => l.id === id);
  }

  function checkpointFor(lessonId) {
    return checkpoints().find((c) => c.afterId === lessonId);
  }

  function strokeColors() {
    return { strokeColor: "#e6f2f5", outlineColor: "#1f3b5a", radicalColor: "#2dd4bf" };
  }

  // Кнопка «Порядок черт»: создаёт анимацию иероглифа по первому нажатию
  function strokeBox(ch) {
    const stage = el("div", { class: "stroke-stage" });
    const box = el("div", { class: "stroke-box" });
    let writer = null;
    const button = el("button", {
      class: "btn-ghost small",
      type: "button",
      text: "✍ Черты",
      onclick: () => {
        if (!window.HanziWriter) {
          stage.textContent = "Библиотека анимации не загрузилась";
          return;
        }
        if (writer) return writer.animateCharacter();
        try {
          writer = window.HanziWriter.create(stage, ch, {
            width: 120,
            height: 120,
            padding: 8,
            showOutline: true,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 250,
            ...strokeColors(),
            charDataLoader: window.loadStrokeData,
            onLoadCharDataError: () => {
              stage.replaceChildren(el("span", { class: "tile-error", text: "нет данных для черт" }));
              writer = null;
            },
          });
          writer.animateCharacter();
        } catch {
          stage.textContent = "Не удалось показать черты";
        }
      },
    });
    box.append(button, stage);
    return box;
  }

  // ---------- Главная курса ----------
  function renderHome() {
    const cards = [];
    for (const les of lessons()) {
      const done = (state.done[les.id] || []).length;
      const total = (les.sentences || []).length || (les.exercises || []).length;
      const meta =
        les.kind === "phonetics"
          ? `звуки · упражнений выполнено ${done}/${total}`
          : `${les.chars.length} иероглифов · ${les.words.length} слов · упражнений ${done}/${total}`;
      cards.push(
        el("a", { class: "lesson-card", href: `#/lesson/${les.id}` }, [
          el("div", { class: "lesson-num", text: les.kind === "phonetics" ? "🔤" : les.id }),
          el("div", { class: "lesson-body" }, [
            el("h2", { text: les.title }),
            el("p", { class: "lesson-intro", text: les.intro }),
            el("div", { class: "lesson-meta", text: meta }),
          ]),
        ])
      );
      const cp = checkpointFor(les.id);
      if (cp) cards.push(checkpointCard(cp));
    }
    const phonetics = lessons().filter((l) => l.kind === "phonetics").length;
    const charLessons = lessons().filter((l) => l.kind !== "phonetics");
    const chars = charLessons.reduce((n, l) => n + l.chars.length, 0);
    view.replaceChildren(
      el("h1", { class: "course-title", text: "Курс китайского" }),
      el("p", {
        class: "lesson-meta",
        text: `Звуков: ${phonetics} · уроков: ${charLessons.length} · иероглифов: ${chars} · контрольных: ${checkpoints().length}`,
      }),
      el("div", { class: "lesson-list" }, cards)
    );
  }

  function checkpointCard(cp) {
    const saved = state.checks[cp.id];
    return el("a", { class: "lesson-card checkpoint", href: `#/check/${cp.id}` }, [
      el("div", { class: "lesson-num", text: "✓" }),
      el("div", { class: "lesson-body" }, [
        el("h2", { text: cp.title }),
        el("div", {
          class: saved ? "lesson-meta score" : "lesson-meta",
          text: saved ? `Результат: ${saved.score} из ${saved.total}` : `${cp.questions.length} заданий`,
        }),
      ]),
    ]);
  }

  // ---------- Урок ----------
  function tabsFor(les) {
    if (les.kind === "phonetics") {
      return [
        ["sounds", "Звуки"],
        ["practice", "Упражнения"],
      ];
    }
    return [
      ["chars", "Иероглифы"],
      ["words", "Слова"],
      ["grammar", "Грамматика"],
      ["practice", "Упражнения"],
    ];
  }

  function renderLesson(id, tab) {
    const les = lessonById(id);
    if (!les) return renderHome();
    const tabs = tabsFor(les);
    const current = tabs.some(([k]) => k === tab) ? tab : tabs[0][0];

    const nav = el(
      "nav",
      { class: "tabs", "aria-label": "Разделы урока" },
      tabs.map(([key, label]) =>
        el("a", {
          class: "tab" + (key === current ? " active" : ""),
          href: `#/lesson/${les.id}/${key}`,
          "aria-current": key === current ? "page" : "false",
          text: label,
        })
      )
    );

    const views = {
      chars: () => charsView(les),
      words: () => wordsView(les),
      grammar: () => grammarView(les.grammar || []),
      sounds: () => soundsView(les),
      practice: () => practiceView(les),
    };

    view.replaceChildren(
      el("a", { class: "back", href: "#/", text: "← Все уроки" }),
      el("h1", { class: "course-title", text: les.title }),
      el("p", { class: "lesson-meta", text: les.intro }),
      nav,
      views[current]()
    );
  }

  // Иероглифы урока: крупно, пиньинь, перевод, озвучка и порядок черт
  function charsView(les) {
    return el(
      "div",
      { class: "char-grid" },
      les.chars.map(([ch, py, ru]) =>
        el("div", { class: "char-card" }, [
          el("div", { class: "char-glyph", lang: "zh-CN", text: ch }),
          el("div", { class: "char-py", text: py }),
          el("div", { class: "char-ru", text: ru }),
          el("div", { class: "char-actions" }, [listenButton(ch), strokeBox(ch)]),
        ])
      )
    );
  }

  function wordsView(les) {
    return el(
      "div",
      { class: "word-grid" },
      les.words.map(([zh, py, ru]) =>
        el("div", { class: "word" }, [
          listenButton(zh),
          el("div", { class: "word-zh-c", lang: "zh-CN", text: zh }),
          el("div", { class: "word-py", text: py }),
          el("div", { class: "word-ru", text: ru }),
        ])
      )
    );
  }

  function grammarView(items) {
    if (!items.length) {
      return el("p", { class: "empty", text: "В этом уроке новой грамматики нет." });
    }
    return el(
      "div",
      { class: "gram" },
      items.map((g) =>
        el("section", { class: "gram-card" }, [
          el("h2", { text: g.title }),
          el("p", { text: g.body }),
          ...g.examples.map(([zh, ru]) =>
            el("div", { class: "example" }, [
              el("div", { class: "zh", lang: "zh-CN", text: zh }),
              el("div", { class: "py", text: pinyinOf(zh) }),
              el("div", { class: "ru", text: ru }),
            ])
          ),
        ])
      )
    );
  }

  // Звуки: таблица с озвучкой и правила (для уроков звуков)
  function soundsView(les) {
    const table = les.table.length
      ? el(
          "div",
          { class: "sound-table" },
          les.table.map(([ch, py, ru]) =>
            el("div", { class: "sound-row" }, [
              el("div", { class: "char-glyph small", lang: "zh-CN", text: ch }),
              el("div", { class: "sound-info" }, [
                el("div", { class: "char-py", text: py }),
                el("div", { class: "char-ru", text: ru }),
              ]),
              listenButton(ch),
            ])
          )
        )
      : null;
    return el("div", {}, [table, grammarView(les.grammar || [])]);
  }

  // ---------- Упражнения ----------
  function practiceView(les) {
    const wrap = el("div", { class: "exercises" });
    wrap.append(volumeBar());
    const doneSet = new Set(state.done[les.id] || []);

    // Звуки и иероглифы: вопросы с выбором, генерируются из таблицы или из иероглифов урока
    const autoQuestions = les.kind === "phonetics" ? soundQuestions(les) : charQuestions(les);
    if (autoQuestions.length) {
      wrap.append(el("h2", { class: "section-title", text: les.kind === "phonetics" ? "Слушайте и выбирайте" : "Узнай иероглиф" }));
      autoQuestions.forEach((q, i) => wrap.append(choiceQuestion(q, i, () => {})));
    }

    if (les.exercises && les.exercises.length) {
      wrap.append(el("h2", { class: "section-title", text: "Выберите правильное чтение" }));
      les.exercises.forEach((q, i) => wrap.append(choiceQuestion(q, i, () => {})));
    }

    if (les.sentences && les.sentences.length) {
      wrap.append(el("h2", { class: "section-title", text: "Соберите предложение" }));
      const onSolved = (i) => {
        const list = new Set(state.done[les.id] || []);
        list.add(i);
        state.done[les.id] = [...list];
        saveState();
      };
      les.sentences.forEach((s, i) =>
        wrap.append(sentenceExercise(i, s, doneSet.has(i), () => onSolved(i), true))
      );
    }
    return wrap;
  }

  // Для урока с иероглифами: 6 вопросов «какой иероглиф» и «как читается»
  function charQuestions(les) {
    const picks = shuffle(les.chars).slice(0, Math.min(6, les.chars.length));
    const pool = les.chars;
    return picks.map(([ch, py, ru], i) => {
      if (i % 2 === 0) {
        const others = shuffle(pool.filter((c) => c[0] !== ch)).slice(0, 3).map((c) => c[0]);
        const options = shuffle([ch, ...others]);
        return {
          type: "choice",
          q: `Какой иероглиф значит «${shortRu(ru)}»?`,
          options,
          answer: options.indexOf(ch),
        };
      }
      const others = shuffle(pool.filter((c) => c[1] !== py)).slice(0, 3).map((c) => c[1]);
      const options = shuffle([py, ...others]);
      return {
        type: "choice",
        q: `Как читается «${ch}»?`,
        speak: ch,
        options,
        answer: options.indexOf(py),
      };
    });
  }

  // Для урока звуков: слушаем иероглиф и выбираем нужную характеристику
  function soundQuestions(les) {
    const keys = les.table.map((r) => r[3]);
    return shuffle(les.table).map(([ch, py, ru, key]) => {
      const others = shuffle(keys.filter((k) => k !== key)).slice(0, 3);
      const options = shuffle([key, ...others]);
      return {
        type: "choice",
        q: `Слушайте и выберите ${les.ask}`,
        speak: ch,
        options,
        answer: options.indexOf(key),
      };
    });
  }

  function choiceQuestion(q, i, done) {
    const buttons = q.options.map((opt, k) =>
      el("button", {
        class: "opt",
        type: "button",
        text: opt,
        onclick: (e) => {
          const all = e.currentTarget.parentNode.querySelectorAll(".opt");
          all.forEach((b, n) => {
            b.disabled = true;
            if (n === q.answer) b.classList.add("right");
          });
          if (k !== q.answer) e.currentTarget.classList.add("wrong");
          done(k === q.answer);
        },
      })
    );
    const head = [el("div", { class: "q", text: `${i + 1}. ${q.q}` })];
    if (q.speak) head.push(playButton(q.speak));
    return el("section", { class: "check-q" }, [...head, el("div", { class: "opts" }, buttons)]);
  }

  // Сборка предложения. onSolved вызывается один раз, когда предложение собрано верно.
  function tokContent(text, showPy) {
    return [
      el("span", { class: "tok-zh", text }),
      showPy ? el("span", { class: "tok-py", text: pinyinOf(text) }) : null,
    ];
  }

  function sentenceExercise(index, sentence, isDone, onSolved, showPy = false) {
    const bank = shuffle(sentence.zh.map((t, j) => ({ t, j })));
    const answer = [];
    const answerBox = el("div", { class: "answer" });
    const bankBox = el("div", { class: "bank" });
    const msg = el("div", { class: "msg" });
    const reveal = el("div", { class: "reveal" });
    const card = el("div", { class: isDone ? "ex done" : "ex" });
    let solved = isDone;

    function redraw() {
      answerBox.replaceChildren(
        ...answer.map((item) =>
          el(
            "button",
            {
              class: "tok",
              type: "button",
              onclick: () => {
                if (solved) return;
                answer.splice(answer.indexOf(item), 1);
                bank.push(item);
                redraw();
              },
            },
            tokContent(item.t, showPy)
          )
        )
      );
      bankBox.replaceChildren(
        ...bank.map((item) =>
          el(
            "button",
            {
              class: "tok",
              type: "button",
              onclick: () => {
                if (solved) return;
                bank.splice(bank.indexOf(item), 1);
                answer.push(item);
                redraw();
              },
            },
            tokContent(item.t, showPy)
          )
        )
      );
    }

    function markSolved() {
      solved = true;
      card.classList.add("done");
      msg.textContent = "Верно!";
      msg.className = "msg ok";
      onSolved();
    }

    const check = el("button", {
      class: "btn-primary",
      type: "button",
      text: "Проверить",
      onclick: () => {
        if (solved) return;
        const got = answer.map((x) => x.t).join("").replace(PUNCT, "");
        const want = sentence.zh.join("").replace(PUNCT, "");
        if (got === want) markSolved();
        else {
          msg.textContent = "Пока не совпадает. Попробуйте переставить слова.";
          msg.className = "msg bad";
        }
      },
    });

    const showBtn = el("button", {
      class: "btn-ghost",
      type: "button",
      text: "Показать ответ",
      onclick: () => {
        const full = sentence.zh.join("");
        reveal.textContent = showPy ? `${full}\n${pinyinOf(full)}` : full;
      },
    });

    redraw();
    if (isDone) {
      msg.textContent = "Выполнено";
      msg.className = "msg ok";
    }

    card.append(
      el("div", { class: "ex-prompt", text: `${index + 1}. ${sentence.ru}` }),
      answerBox,
      bankBox,
      playButton(sentence.zh.join("")),
      el("div", { class: "ex-actions" }, [check, showBtn, msg]),
      reveal
    );
    return card;
  }

  // ---------- Контрольная ----------
  function renderCheck(id) {
    const cp = checkpoints().find((c) => c.id === id);
    if (!cp) return renderHome();

    const results = [];
    const total = cp.questions.length;
    const finishBox = el("div", {});

    function onAnswer(i, ok) {
      results[i] = ok;
      if (results.filter((r) => r !== undefined).length === total) {
        const score = results.filter(Boolean).length;
        state.checks[cp.id] = { score, total };
        saveState();
        finishBox.replaceChildren(
          el("div", { class: "result-box" }, [
            el("div", { class: "big", text: `${score} / ${total}` }),
            el("p", { text: score === total ? "Отличная работа!" : "Вернитесь к урокам и повторите иероглифы." }),
          ])
        );
      }
    }

    const questionNodes = cp.questions.map((q, i) => {
      if (q.type === "choice") return choiceQuestion(q, i, (ok) => onAnswer(i, ok));
      return assembleCard(q, i, (ok) => onAnswer(i, ok));
    });

    view.replaceChildren(
      el("a", { class: "back", href: "#/", text: "← Все уроки" }),
      el("h1", { class: "course-title", text: cp.title }),
      ...questionNodes,
      finishBox
    );
  }

  function assembleCard(q, i, done) {
    const ex = sentenceExercise(i, { ru: q.ru, zh: q.zh }, false, () => done(true), false);
    ex.classList.add("check-q");
    return ex;
  }

  // ---------- Маршрутизация ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "lesson" && parts[1]) return renderLesson(parts[1], parts[2]);
    if (parts[0] === "check" && parts[1]) return renderCheck(parts[1]);
    renderHome();
  }

  window.addEventListener("hashchange", route);
  route();
})();
