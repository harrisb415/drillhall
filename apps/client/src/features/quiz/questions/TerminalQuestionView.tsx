import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { QuizQuestionPublic } from "@comptia/shared-types";
import { currentAnswer, type QuestionViewProps } from "./types";

const PROMPT = "C:\\> ";

export function TerminalQuestionView({
  question,
  answer,
  given,
  busy,
  onSubmit,
}: QuestionViewProps<Extract<QuizQuestionPublic, { type: "terminal" }>>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const bufferRef = useRef("");
  const lockedRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  // Grading locks the terminal; an exam leaves it open so the command can be
  // retyped right up until submission.
  const graded = !!answer;
  lockedRef.current = graded || busy;

  const picked = currentAnswer({ answer, given });
  const priorCommand = picked?.type === "terminal" ? picked.command : null;

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
    term.write(PROMPT);
    // Restore what was typed before, so revisiting a question in an exam shows it.
    if (priorCommand) term.write(priorCommand);
    bufferRef.current = priorCommand ?? "";
    term.focus();
    termRef.current = term;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  // Report the verdict only once grading actually exists.
  const shownRef = useRef(false);
  useEffect(() => {
    if (!answer) {
      shownRef.current = false;
      return;
    }
    if (termRef.current && !shownRef.current) {
      shownRef.current = true;
      termRef.current.write(
        answer.correct
          ? "\x1b[32mCommand accepted.\x1b[0m\r\n"
          : "\x1b[31mThat's not the expected command.\x1b[0m\r\n",
      );
    }
  }, [answer]);

  // In an exam, acknowledge the save and re-prompt so it can be changed.
  const lastRecorded = useRef<string | null>(null);
  useEffect(() => {
    if (graded || !priorCommand || !termRef.current) return;
    if (lastRecorded.current === priorCommand) return;
    lastRecorded.current = priorCommand;
    bufferRef.current = "";
    termRef.current.write(`\x1b[90mrecorded\x1b[0m\r\n${PROMPT}`);
  }, [priorCommand, graded]);

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-border bg-[#0d1117] p-2">
        <div ref={containerRef} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Type the command and press Enter{graded ? "." : " — you can retype to change it."} Case and
        extra spaces don't matter.
      </p>
    </div>
  );
}
