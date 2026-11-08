"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { toast } from "@/components/app/toaster";

/** The browser's speech recognition (Chrome, Edge, Safari); Firefox has none, so the mic hides. */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
};
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscribe = () => () => {};

/** Why dictation stopped, for the errors that won't fix themselves (B3.1i). */
const PROBLEMS: Record<string, string> = {
  "not-allowed":
    "Your browser blocked the microphone. Allow it for this site (the address bar), then try again.",
  "service-not-allowed":
    "Your browser blocked the microphone. Allow it for this site (the address bar), then try again.",
  "audio-capture":
    "No microphone was found. Check one is connected and allowed, then try again.",
  network:
    "Dictation couldn't reach your browser's speech service. Check your connection and try again.",
  "language-not-supported":
    "Dictation doesn't support your browser's language yet.",
};
/** Times in a row the browser may end listening with nothing heard before it stops for good. */
const QUIET_RESTARTS = 5;

/**
 * Dictation for Lander's composers (owner: "some people may need to dictate"): press the mic and
 * speak; the words arrive in the field as you talk (`interim`, shown grey) and settle when a phrase
 * ends (`onFinal`). Press again, or Escape, to stop. The browser does the listening (Chrome sends
 * the audio to its own service); nothing is recorded by LP.
 *
 * B3.1i (owner: "check that the recorder actually picks up well"): it keeps listening until you
 * stop it, though the browser ends a session after a pause or about a minute (it starts a new one
 * at once; five quiet ends in a row and it stops); words still being heard when a session ends are
 * kept; and when it can't listen (the microphone blocked or missing, the speech service out of
 * reach) it says why rather than going quiet.
 */
export function useDictation(onFinal: (text: string) => void) {
  const supported = useSyncExternalStore(
    noSubscribe,
    () => recognitionClass() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });
  // Listening is wanted until Stop, Escape or an error that won't fix itself.
  const wanted = useRef(false);
  const quiet = useRef(0);
  const pending = useRef("");
  // The next session starts through this, so a session can start the next one.
  const again = useRef<() => void>(() => {});

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
  }, []);

  const begin = useCallback(() => {
    const Class = recognitionClass();
    if (!Class || recognition.current) return;
    const r = new Class();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      quiet.current = 0;
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) finalRef.current(result[0].transcript.trim());
        else heard += result[0].transcript;
      }
      pending.current = heard.trim();
      setInterim(pending.current);
    };
    r.onend = () => {
      recognition.current = null;
      // A phrase still being heard when the session ended is kept.
      if (pending.current) {
        finalRef.current(pending.current);
        pending.current = "";
        setInterim("");
      }
      if (wanted.current && quiet.current < QUIET_RESTARTS) {
        // The browser ended it (a pause, its time limit): listen again at once.
        quiet.current += 1;
        window.setTimeout(() => {
          if (wanted.current) again.current();
        }, 120);
        return;
      }
      wanted.current = false;
      setListening(false);
      setInterim("");
    };
    r.onerror = (event) => {
      const problem = PROBLEMS[event.error];
      if (problem) {
        // It won't fix itself: stop, and say why.
        wanted.current = false;
        toast.error("Dictation stopped", { description: problem });
      }
      // "no-speech" and "aborted" end the session; onend decides whether to listen again.
    };
    recognition.current = r;
    r.start();
  }, []);

  useEffect(() => {
    again.current = begin;
  }, [begin]);

  const start = useCallback(() => {
    if (recognition.current || wanted.current) return;
    wanted.current = true;
    quiet.current = 0;
    pending.current = "";
    setListening(true);
    begin();
  }, [begin]);

  useEffect(
    () => () => {
      wanted.current = false;
      recognition.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, start, stop };
}
