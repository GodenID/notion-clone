import { useState } from "react";
import RichTextEditor from "../components/RichTextEditor.jsx";

export default function RichTextDemo() {
  const [text, setText] = useState("Type something rich here…");
  return (
    <div className="rte-demo">
      <h2>Rich text editor (ProseMirror)</h2>
      <p className="rte-demo__note">
        This is the Phase 3 rich-text editor, built on ProseMirror. Bold, italic,
        code, headings, lists, quotes, and undo/redo are live. Yjs collaboration
        is wired in next.
      </p>
      <RichTextEditor initialContent={text} onChange={setText} />
      <details className="rte-demo__out">
        <summary>Plain text output</summary>
        <pre>{text}</pre>
      </details>
    </div>
  );
}
