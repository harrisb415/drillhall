import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { AttemptAnswer, QuizQuestionPublic } from "@comptia/shared-types";
import type { AnswerRecord } from "@/stores/quiz";

export function TerminalQuestionView({
  question,
  answer,
  busy,
  onSubmit,
}: {
  question: Extract<QuizQuestionPublic, { type: "terminal" }>;
  answer: AnswerRecord | undefined;
  busy: boolean;
  onSubmit: (answer: AttemptAnswer) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const bufferRef = useRef("");
  const lockedRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  lockedRef.current = !!answer || busy;

  useEffect(() => {
    const term = new Terminal({
      rows: 8,
      cols: 64,
      fontSize: 14,
      cursorBlink: true,
      fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
      theme: { background: "#0d1117", foreground: "#e6edf3", cursor: "#e6edf3" },
    });
    term.open(containerRef.current!);
    term.write("C:\\> ");
    term.focus();
    termRef.current = term;
    bufferRef.current = "";

    const sub = term.onData((data) => {
      if (lockedRef.current) return;
      for (const ch of data) {
        if (ch === "\r") {
          const command = bufferRef.current.trim();
          if (command) {
            term.write("\r\n");
            onSubmitRef.current({ type: "terminal", command });
          }
        } else if (ch === "\x7f") {
          if (bufferRef.current.length > 0) {
            bufferRef.current = bufferRef.current.slice(0, -1);
            term.write("\b \b");
          }
        } else if (ch >= " " && ch <= "~") {
          bufferRef.current += ch;
          term.write(ch);
        }
      }
    });

    return () => {
      sub.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [question.id]);

  const resultShownRef = useRef(false);
  useEffect(() => {
    if (!answer) {
      resultShownRef.current = false;
      return;
    }
    if (termRef.current && !resultShownRef.current) {
      resultShownRef.current = true;
      termRef.current.write(
        answer.correct
          ? "\x1b[32mCommand accepted.\x1b[0m\r\n"
          : "\x1b[31mThat's not the expected command.\x1b[0m\r\n",
      );
    }
  }, [answer]);

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-border bg-[#0d1117] p-2">
        <div ref={containerRef} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Type the command and press Enter to submit. Case and extra spaces don't matter.
      </p>
    </div>
  );
}
