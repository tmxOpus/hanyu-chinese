// Транскрипция на странице правил.
// Пиньинь ставится везде, где есть китайский текст: в примерах, в тексте объяснений,
// в глоссарии и в заголовках. Считает его библиотека pinyin-pro.
(() => {
  const HAN = /[㐀-䶿一-鿿]/;
  const HAN_RUN = /[㐀-䶿一-鿿]+/g;

  function pinyinOf(text) {
    if (!window.pinyinPro) return "";
    try {
      // Без пробелов рядом с китайскими знаками и кавычками: «píng guǒ、xiāng jiāo»
      return window.pinyinPro
        .pinyin(text, { toneType: "mark" })
        .replace(/\s+([。，、！？；：”’》）,.!?;:])/g, "$1")
        .replace(/([“‘《（])\s+/g, "$1")
        .replace(/([。，、！？；：”’》）])\s+/g, "$1");
    } catch {
      return "";
    }
  }

  const root = document.querySelector(".course");
  if (!root) return;

  // 1. Примеры-блоки: пиньинь строкой под иероглифами
  root.querySelectorAll(".example .zh").forEach((zh) => {
    const text = zh.textContent;
    if (!HAN.test(text)) return; // чистая латиница уже записана пиньинем
    const py = document.createElement("div");
    py.className = "py";
    py.textContent = pinyinOf(text);
    zh.insertAdjacentElement("afterend", py);
  });

  // 2. Все остальные китайские фрагменты в тексте: пиньинь в скобках сразу после них
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    const text = node.nodeValue;
    if (!HAN.test(text)) continue;
    // Уже обработанное пропускаем: примеры, готовые пиньиньные строки и сами пиньиньные вставки
    if (node.parentElement.closest(".zh, .py, .py-inline")) continue;

    const frag = document.createDocumentFragment();
    let last = 0;
    HAN_RUN.lastIndex = 0;
    let match;
    while ((match = HAN_RUN.exec(text))) {
      const end = match.index + match[0].length;
      frag.append(text.slice(last, end));
      const py = document.createElement("span");
      py.className = "py-inline";
      py.textContent = `(${pinyinOf(match[0])})`;
      frag.append(py);
      last = end;
    }
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
})();
