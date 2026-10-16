(() => {
  // Раздел «Курс»: список уроков, уроки (слова, тексты, грамматика, упражнения) и контрольные.
  const view = document.getElementById("view");
  const KEY = "hanyu.course";
  const PUNCT = /[，。！？、；：,.!?;:“”"'「」（）()\s]/g;
  const TABS = [
    ["words", "Слова"],
    ["text", "Текст"],
    ["grammar", "Грамматика"],
    ["practice", "Упражнения"],
  ];

  const lessons = () => window.COURSE_LESSONS || [];
  const checkpoints = () => window.COURSE_CHECKPOINTS || [];

  // ---------- Хранилище прогресса (только в браузере этого пользователя) ----------
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.done && saved.checks) return saved;
    } catch {
      /* нет доступа к хранилищу — начинаем заново */
    }
    return { done: {}, checks: {} };
  }

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* прогресс не сохранится, но курс работает */
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
      return window.pinyinPro.pinyin(text, { toneType: "mark" });
    } catch {
      return "";
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;
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

  const listenButton = (text) =>
    el("button", { class: "icon-btn", type: "button", "aria-label": "Прослушать", text: "🔊", onclick: () => speak(text) });

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function scoreFor(lesson) {
    return (state.done[lesson.id] || []).length;
  }

  function checkpointFor(lessonId) {
    return checkpoints().find((c) => Math.max(...c.after) === lessonId);
  }

  // ---------- Главная курса ----------
  function renderHome() {
    const cards = [];
    for (const les of lessons()) {
      cards.push(
        el("a", { class: "lesson-card", href: `#/lesson/${les.id}` }, [
          el("div", { class: "lesson-num", text: String(les.id) }),
          el("div", { class: "lesson-body" }, [
            el("h2", { text: les.title }),
            el("p", { class: "lesson-intro", text: les.intro }),
            el("div", {
              class: "lesson-meta",
              text: `${les.words.length} слов · упражнений выполнено ${scoreFor(les)}/${les.sentences.length}`,
            }),
          ]),
        ])
      );
      const cp = checkpointFor(les.id);
      if (cp) cards.push(checkpointCard(cp));
    }
    view.replaceChildren(
      el("h1", { class: "course-title", text: "Курс китайского" }),
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
  function renderLesson(id, tab) {
    const les = lessons().find((l) => l.id === id);
    if (!les) return renderHome();
    const current = TABS.some(([k]) => k === tab) ? tab : "words";

    const tabs = el(
      "nav",
      { class: "tabs", "aria-label": "Разделы урока" },
      TABS.map(([key, label]) =>
        el("a", {
          class: "tab" + (key === current ? " active" : ""),
          href: `#/lesson/${les.id}/${key}`,
          "aria-current": key === current ? "page" : "false",
          text: label,
        })
      )
    );

    const content = {
      words: () => wordsView(les),
      text: () => textView(les),
      grammar: () => grammarView(les),
      practice: () => practiceView(les),
    }[current]();

    view.replaceChildren(
      el("a", { class: "back", href: "#/", text: "← Все уроки" }),
      el("h1", { class: "course-title", text: `Урок ${les.id}. ${les.title}` }),
      tabs,
      content
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

  function textView(les) {
    return el("div", {}, [
      el("h2", { class: "section-title", text: les.text.title }),
      el(
        "div",
        { class: "dialog" },
        les.text.lines.map(([speaker, zh, ru]) =>
          el("div", { class: "line" }, [
            el("div", { class: "speaker", text: speaker }),
            el("div", {}, [
              el("div", { class: "line-zh", lang: "zh-CN", text: zh }),
              el("div", { class: "line-py", text: pinyinOf(zh) }),
              el("div", { class: "line-ru", text: ru }),
            ]),
            listenButton(zh),
          ])
        )
      ),
    ]);
  }

  function grammarView(les) {
    return el(
      "div",
      { class: "gram" },
      les.grammar.map((g) =>
        el("section", { class: "gram-card" }, [
          el("h2", { text: g.title }),
          el("p", { text: g.body }),
          ...g.examples.map(([zh, ru]) =>
            el("div", { class: "example" }, [
              el("div", { class: "zh", lang: "zh-CN", text: zh }),
              el("div", { class: "ru", text: ru }),
            ])
          ),
        ])
      )
    );
  }

  // Упражнение: собрать предложение из слов
  function practiceView(les) {
    const doneSet = new Set(state.done[les.id] || []);
    const onSolved = (i) => {
      const list = new Set(state.done[les.id] || []);
      list.add(i);
      state.done[les.id] = [...list];
      saveState();
    };
    return el(
      "div",
      { class: "exercises" },
      les.sentences.map((s, i) => sentenceExercise(i, s, doneSet.has(i), () => onSolved(i)))
    );
  }

  // Сборка предложения. onSolved вызывается один раз, когда предложение собрано верно.
  function sentenceExercise(index, sentence, isDone, onSolved) {
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
          el("button", {
            class: "tok",
            type: "button",
            text: item.t,
            onclick: () => {
              if (solved) return;
              answer.splice(answer.indexOf(item), 1);
              bank.push(item);
              redraw();
            },
          })
        )
      );
      bankBox.replaceChildren(
        ...bank.map((item) =>
          el("button", {
            class: "tok",
            type: "button",
            text: item.t,
            onclick: () => {
              if (solved) return;
              bank.splice(bank.indexOf(item), 1);
              answer.push(item);
              redraw();
            },
          })
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
        reveal.textContent = sentence.zh.join("");
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
    const questionNodes = cp.questions.map((q, i) => {
      if (q.type === "choice") return choiceQuestion(q, i, (ok) => onAnswer(i, ok));
      return assembleQuestion(q, i, (ok) => onAnswer(i, ok));
    });

    function onAnswer(i, ok) {
      results[i] = ok;
      if (results.filter((r) => r !== undefined).length === total) {
        const score = results.filter(Boolean).length;
        state.checks[cp.id] = { score, total };
        saveState();
        finishBox.replaceChildren(
          el("div", { class: "result-box" }, [
            el("div", { class: "big", text: `${score} / ${total}` }),
            el("p", { text: score === total ? "Отличная работа!" : "Вернитесь к урокам и повторите слова." }),
          ])
        );
      }
    }

    view.replaceChildren(
      el("a", { class: "back", href: "#/", text: "← Все уроки" }),
      el("h1", { class: "course-title", text: cp.title }),
      ...questionNodes,
      finishBox
    );
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
    return el("section", { class: "check-q" }, [
      el("div", { class: "q", text: `${i + 1}. ${q.q}` }),
      el("div", { class: "opts" }, buttons),
    ]);
  }

  // Задание на сборку в контрольной: засчитываем, когда предложение собрано верно.
  // В прогресс урока ничего не пишем.
  function assembleQuestion(q, i, done) {
    const ex = sentenceExercise(i, { ru: q.ru, zh: q.zh }, false, () => done(true));
    ex.classList.add("check-q");
    return ex;
  }

  // ---------- Маршрутизация ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "lesson" && parts[1]) return renderLesson(Number(parts[1]), parts[2]);
    if (parts[0] === "check" && parts[1]) return renderCheck(Number(parts[1]));
    renderHome();
  }

  window.addEventListener("hashchange", route);
  route();
})();
