const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

test("o carregador injeta o realce compartilhado do titulo do documento", () => {
  const source = fs.readFileSync("index.html", "utf8");
  assert.match(source, /document-title-ui\.js/);
});

test("o realce normaliza texto e encontra o primeiro texto util apos Preencher dados", () => {
  const { normalizeText, findTitleParent } = require("./document-title-ui.js");

  const headingText = { nodeValue: "  Preencher   dados  " };
  const heading = {
    contains(node) {
      return node === headingText;
    },
  };

  const labelParent = {
    tagName: "LABEL",
    closest() {
      return null;
    },
  };
  const titleParent = {
    tagName: "P",
    closest() {
      return null;
    },
  };

  const labelText = { nodeValue: "Campo auxiliar", parentElement: labelParent };
  const titleText = {
    nodeValue: "Contrato de Prestação de Serviços",
    parentElement: titleParent,
  };

  assert.equal(normalizeText(headingText.nodeValue), "Preencher dados");
  assert.equal(
    findTitleParent([headingText, labelText, titleText], heading),
    titleParent,
  );
});

test("o destaque visual usa 22px, peso 600 e nao redefine a cor", () => {
  const source = fs.readFileSync("document-title-ui.js", "utf8");
  assert.match(source, /font-size:\s*22px/);
  assert.match(source, /font-weight:\s*600/);
  assert.match(source, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(source, /\bcolor\s*:/);
});
