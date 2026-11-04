"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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

/**
 * Dictation for Lander's composers (owner: "some people may need to dictate"): press the mic and
 * speak; the words arrive in the field as you talk (`interim`, shown grey) and settle when a phrase
 * ends (`onFinal`). Press again, or Escape, to stop. The browser does the listening (Chrome sends
 * the audio to its own service); nothing is recorded by LP.
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

  const stop = useCallback(() => {
    recognition.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Class = recognitionClass();
    if (!Class || recognition.current) return;
    const r = new Class();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) finalRef.current(result[0].transcript.trim());
        else pending += result[0].transcript;
      }
      setInterim(pending.trim());
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
    };
    r.onerror = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
    };
    recognition.current = r;
    setListening(true);
    r.start();
  }, []);

  useEffect(() => () => recognition.current?.abort(), []);

  return { supported, listening, interim, start, stop };
}
