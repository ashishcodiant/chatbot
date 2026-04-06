"use client";

import { defaultMarkdownSerializer } from "prosemirror-markdown";
import { DOMParser, type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";
import { renderToString } from "react-dom/server";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";

import { documentSchema } from "./config";
import type { UISuggestion } from "./suggestions";

const editorPlugins = { cjk, code, mermaid };

export const buildDocumentFromContent = (content: string) => {
  const parser = DOMParser.fromSchema(documentSchema);
  const stringFromMarkdown = renderToString(
    <Streamdown plugins={editorPlugins}>{content}</Streamdown>
  );
  const tempContainer = document.createElement("div");
  tempContainer.innerHTML = stringFromMarkdown;
  return parser.parse(tempContainer);
};

export const buildContentFromDocument = (document: Node) => {
  return defaultMarkdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  _view: EditorView
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
          "data-suggestion-id": suggestion.id,
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        }
      )
    );
  }

  return DecorationSet.create(_view.state.doc, decorations);
};
