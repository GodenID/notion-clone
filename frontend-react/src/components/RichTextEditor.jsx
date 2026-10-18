import { useEffect, useRef, useState } from "react";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { toggleMark, setBlockType, wrapIn } from "prosemirror-commands";
import { history, undo, redo } from "prosemirror-history";
import { schema as basicSchema } from "prosemirror-schema-basic";

const schema = basicSchema;

const menuButton = (label, title, onClick) => (
  <button type="button" className="rte__btn" title={title} onClick={onClick}>
    {label}
  </button>
);

export default function RichTextEditor({ initialContent = "", onChange, readOnly = false }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: initialContent
        ? schema.node("doc", null, [schema.node("paragraph", null, [schema.text(initialContent)])])
        : undefined,
      plugins: [
        history(),
        keymap({ "Mod-z": undo, "Mod-y": redo, "Mod-Shift-z": redo }),
        keymap(baseKeymap),
      ],
    });

    const view = new EditorView(editorRef.current, {
      state,
      editable: () => !readOnly,
      dispatchTransaction(tr) {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        if (tr.docChanged && onChange) {
          onChange(view.state.doc.textContent);
        }
      },
    });

    viewRef.current = view;
    setReady(true);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = (command) => {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch, view);
    view.focus();
  };

  const toggleBold = () => run((state, dispatch) => toggleMark(schema.marks.strong)(state, dispatch));
  const toggleItalic = () => run((state, dispatch) => toggleMark(schema.marks.em)(state, dispatch));
  const toggleCode = () => run((state, dispatch) => toggleMark(schema.marks.code)(state, dispatch));
  const makeHeading = (level) =>
    run((state, dispatch) => setBlockType(schema.nodes.heading, { level })(state, dispatch));
  const makeParagraph = () => run((state, dispatch) => setBlockType(schema.nodes.paragraph)(state, dispatch));
  const toggleBulletList = () =>
    run((state, dispatch) => wrapIn(schema.nodes.bullet_list)(state, dispatch));
  const toggleOrderedList = () =>
    run((state, dispatch) => wrapIn(schema.nodes.ordered_list)(state, dispatch));
  const toggleBlockquote = () =>
    run((state, dispatch) => wrapIn(schema.nodes.blockquote)(state, dispatch));

  return (
    <div className={`rte ${readOnly ? "rte--readonly" : ""}`}>
      {!readOnly && (
        <div className="rte__toolbar">
          {menuButton("B", "Bold", toggleBold)}
          {menuButton("I", "Italic", toggleItalic)}
          {menuButton("</>", "Code", toggleCode)}
          <span className="rte__sep" />
          {menuButton("H1", "Heading 1", () => makeHeading(1))}
          {menuButton("H2", "Heading 2", () => makeHeading(2))}
          {menuButton("H3", "Heading 3", () => makeHeading(3))}
          {menuButton("¶", "Paragraph", makeParagraph)}
          <span className="rte__sep" />
          {menuButton("•", "Bullet list", toggleBulletList)}
          {menuButton("1.", "Numbered list", toggleOrderedList)}
          {menuButton("❝", "Quote", toggleBlockquote)}
          <span className="rte__sep" />
          {menuButton("↶", "Undo", () => run((s, d) => undo(s, d)))}
          {menuButton("↷", "Redo", () => run((s, d) => redo(s, d)))}
        </div>
      )}
      <div ref={editorRef} className="rte__editor" />
      {!ready && <div className="rte__loading">Loading editor…</div>}
    </div>
  );
}
