// Транскрипция к примерам на странице правил.
// Китайский текст в примерах переводится в пиньинь библиотекой pinyin-pro.
(() => {
  const HAN = /[㐀-䶿一-鿿]/;

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

  // Примеры в отдельных блоках: пиньинь ставим под иероглифами
  document.querySelectorAll(".example .zh").forEach((zh) => {
    const text = zh.textContent;
    if (!HAN.test(text)) return; // чистая латиница уже записана пиньинем
    const py = document.createElement("div");
    py.className = "py";
    py.textContent = pinyinOf(text);
    zh.insertAdjacentElement("afterend", py);
  });

  // Китайские фразы внутри списков: пиньинь в скобках сразу после них
  document.querySelectorAll(".zh-inline").forEach((zh) => {
    const py = document.createElement("span");
    py.className = "py-inline";
    py.textContent = `(${pinyinOf(zh.textContent)})`;
    zh.insertAdjacentElement("afterend", py);
  });
})();
