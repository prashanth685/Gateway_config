import { useState, useEffect, useRef, useCallback } from "react";

export function useGatewaySSE(prefix) {
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef(null);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    if (!prefix) {
      setConnected(false);
      return;
    }

    const es = new EventSource(`/api/events?gateway=${encodeURIComponent(prefix)}`);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setMessages((prev) => [...prev, data]);
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [prefix]);

  return { messages, connected, clearMessages };
}
