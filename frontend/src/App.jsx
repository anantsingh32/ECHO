
import React, { useEffect, useRef, useState } from "react";

const API = "http://127.0.0.1:8000";

const languages = [
  { name: "English", code: "en-IN" },
  { name: "Hindi", code: "hi-IN" },
  { name: "Kannada", code: "kn-IN" },
];

const defaultCards = [
  { title: "I am deaf. Please type.", icon: "✍️" },
  { title: "Please speak slowly.", icon: "🐢" },
  { title: "Please repeat that.", icon: "🔁" },
  { title: "I need help.", icon: "🆘" },
  { title: "Thank you!", icon: "🙏" },
  { title: "Please write it down.", icon: "📝" },
];

const contexts = [
  { name: "General", icon: "💬" },
  { name: "Hospital", icon: "🏥" },
  { name: "Bank", icon: "🏦" },
  { name: "Shopping", icon: "🛍️" },
];

export default function App() {
  const [language, setLanguage] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [captions, setCaptions] = useState("");
  const [reply, setReply] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [context, setContext] = useState("General");
  const [cards, setCards] = useState(defaultCards);
  const [serverStatus, setServerStatus] = useState("Checking...");
  const [error, setError] = useState("");
  const [usingAI, setUsingAI] = useState(false);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);

  // Check backend connection
  useEffect(() => {
    checkBackend();
    loadCards();

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  async function checkBackend() {
    try {
      const response = await fetch(`${API}/api/health`);
      if (!response.ok) throw new Error("Backend unavailable");
      setServerStatus("Connected");
    } catch {
      setServerStatus("Offline");
    }
  }

  async function loadCards() {
    try {
      const response = await fetch(`${API}/api/cards`);
      if (!response.ok) return;

      const data = await response.json();
      const received = Array.isArray(data)
        ? data
        : data.cards || [];

      if (received.length) {
        setCards(
          received.map((card, index) => ({
            title:
              typeof card === "string"
                ? card
                : card.title || card.text || card.message || "Help",
            icon: card.icon || defaultCards[index % defaultCards.length].icon,
          }))
        );
      }
    } catch {
      console.log("Using default communication cards");
    }
  }

  // Log communication interactions
  async function logInteraction(kind, content) {
    try {
      await fetch(`${API}/api/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, content }),
      });
    } catch {
      console.log("Interaction logging unavailable");
    }
  }

  // Speech to text
  function startListening() {
    setError("");

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(
        "Speech recognition is not supported. Please use Chrome or Edge."
      );
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();

    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setListening(true);
    };

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalText += transcript + " ";
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        setCaptions((previous) => previous + finalText);
        logInteraction("speech_caption", finalText);
      }

      if (interimText) {
        setError("");
      }
    };

    recognition.onerror = (event) => {
      setListening(false);

      if (event.error === "not-allowed") {
        setError("Microphone permission denied. Allow microphone access.");
      } else if (event.error !== "no-speech") {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setListening(false);
      setError("Unable to start microphone. Please try again.");
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  }

  function clearCaptions() {
    setCaptions("");
    setError("");
  }

  // Text to speech with ElevenLabs and browser fallback
  async function speakText(text) {
    if (!text || !text.trim()) {
      setError("Please enter a message first.");
      return;
    }

    setError("");
    setSpeaking(true);
    setUsingAI(false);

    window.speechSynthesis.cancel();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    try {
      const response = await fetch(`${API}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          voice_id: null,
        }),
      });

      if (!response.ok) {
        throw new Error("AI voice unavailable");
      }

      const blob = await response.blob();

      if (!blob.type.startsWith("audio/")) {
        throw new Error("Invalid audio response");
      }

      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
        setUsingAI(false);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
        setUsingAI(false);
        setError("AI audio playback failed.");
      };

      await audio.play();

      setUsingAI(true);
      logInteraction("spoken_reply", text);
      return;
    } catch (err) {
      console.warn("Using browser voice:", err);
    }

    // Browser voice fallback
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setError("Unable to play speech.");
    };

    window.speechSynthesis.speak(utterance);
    logInteraction("spoken_reply", text);
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setSpeaking(false);
    setUsingAI(false);
  }

  // Quick card action
  function useCard(message) {
    setReply(message);
    logInteraction("communication_card", message);
  }

  // Context selection
  async function selectContext(name) {
    setContext(name);

    if (name === "General") {
      setCards(defaultCards);
      return;
    }

    try {
      const response = await fetch(
        `${API}/api/context/${encodeURIComponent(name.toLowerCase())}`
      );

      if (!response.ok) return;

      const data = await response.json();
      const received = Array.isArray(data)
        ? data
        : data.cards || data.messages || [];

      if (received.length) {
        setCards(
          received.map((item, index) => ({
            title:
              typeof item === "string"
                ? item
                : item.title || item.text || item.message || "Help",
            icon: item.icon || "💬",
          }))
        );
      }
    } catch {
      setError("Context service unavailable. Using existing cards.");
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#f4f7fb",
      color: "#172033",
      fontFamily: "Inter, Arial, sans-serif",
    },
    header: {
      background: "#ffffff",
      padding: "17px 6%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      borderBottom: "1px solid #e6eaf0",
      flexWrap: "wrap",
      gap: "12px",
    },
    logo: {
      fontSize: "27px",
      fontWeight: 800,
      color: "#2864db",
      letterSpacing: "-1px",
    },
    main: {
      maxWidth: "1150px",
      margin: "auto",
      padding: "35px 20px",
    },
    card: {
      background: "#ffffff",
      borderRadius: "17px",
      padding: "23px",
      boxShadow: "0 4px 18px rgba(20,40,80,0.045)",
      border: "1px solid #e9edf3",
    },
    button: {
      padding: "12px 18px",
      borderRadius: "10px",
      border: "none",
      cursor: "pointer",
      fontWeight: 700,
      fontSize: "14px",
    },
    primary: {
      background: "#2864db",
      color: "#ffffff",
    },
    secondary: {
      background: "#edf3ff",
      color: "#2864db",
    },
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>◉ ECHO</div>
          <div style={{ fontSize: "11px", color: "#778195" }}>
            Communication without barriers
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span
            style={{
              color: serverStatus === "Connected" ? "#16834a" : "#d97706",
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            ● {serverStatus}
          </span>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{
              padding: "10px",
              borderRadius: "9px",
              border: "1px solid #dce2eb",
              background: "#fff",
            }}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main style={styles.main}>
        <section style={{ textAlign: "center", marginBottom: "30px" }}>
          <div
            style={{
              display: "inline-block",
              background: "#e5efff",
              color: "#2864db",
              padding: "7px 14px",
              borderRadius: "30px",
              fontSize: "12px",
              fontWeight: 700,
              marginBottom: "12px",
            }}
          >
            AI-POWERED ACCESSIBILITY
          </div>

          <h1 style={{ fontSize: "36px", margin: "5px 0" }}>
            Every Voice Matters.
          </h1>

          <p style={{ color: "#758095", fontSize: "15px" }}>
            Different ways of communicating. One world that understands.
          </p>
        </section>

        {error && (
          <div
            role="alert"
            style={{
              background: "#fff0f0",
              color: "#b42318",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {/* Communication context */}
        <section style={{ ...styles.card, marginBottom: "22px" }}>
          <h3 style={{ marginTop: 0 }}>Choose your situation</h3>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {contexts.map((item) => (
              <button
                key={item.name}
                onClick={() => selectContext(item.name)}
                style={{
                  ...styles.button,
                  background:
                    context === item.name ? "#2864db" : "#edf2f8",
                  color: context === item.name ? "#fff" : "#344054",
                }}
              >
                {item.icon} {item.name}
              </button>
            ))}
          </div>
        </section>

        {/* Two-way communication */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "20px",
            marginBottom: "22px",
          }}
        >
          {/* Live captions */}
          <section style={styles.card}>
            <div style={{ fontSize: "28px" }}>🎤</div>

            <h2 style={{ fontSize: "20px" }}>Live Captions</h2>

            <p style={{ color: "#7a8496", fontSize: "13px" }}>
              Convert another person's speech into readable text.
            </p>

            <div
              aria-live="polite"
              style={{
                background: "#f4f7fc",
                borderRadius: "12px",
                padding: "17px",
                minHeight: "125px",
                lineHeight: 1.7,
                fontSize: "16px",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                marginBottom: "15px",
              }}
            >
              {captions || "Your live captions will appear here..."}
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {!listening ? (
                <button
                  style={{ ...styles.button, ...styles.primary }}
                  onClick={startListening}
                >
                  🎙 Start Listening
                </button>
              ) : (
                <button
                  style={{
                    ...styles.button,
                    background: "#dc3545",
                    color: "#fff",
                  }}
                  onClick={stopListening}
                >
                  ■ Stop Listening
                </button>
              )}

              <button
                style={{ ...styles.button, ...styles.secondary }}
                onClick={clearCaptions}
              >
                Clear
              </button>
            </div>

            {listening && (
              <p style={{ color: "#16834a", fontSize: "13px" }}>
                ● Listening... Speak now.
              </p>
            )}
          </section>

          {/* Text to speech */}
          <section style={styles.card}>
            <div style={{ fontSize: "28px" }}>🔊</div>

            <h2 style={{ fontSize: "20px" }}>Your Voice</h2>

            <p style={{ color: "#7a8496", fontSize: "13px" }}>
              Type your message and let ECHO speak for you.
            </p>

            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type what you want to communicate..."
              rows={6}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                padding: "15px",
                borderRadius: "12px",
                border: "1px solid #dce2eb",
                fontSize: "15px",
                fontFamily: "inherit",
                outlineColor: "#2864db",
                marginBottom: "15px",
              }}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                style={{ ...styles.button, ...styles.primary }}
                onClick={() => speakText(reply)}
                disabled={speaking}
              >
                🔊 Speak Reply
              </button>

              {speaking && (
                <button
                  style={{
                    ...styles.button,
                    background: "#dc3545",
                    color: "#fff",
                  }}
                  onClick={stopSpeaking}
                >
                  ■ Stop
                </button>
              )}

              <button
                style={{ ...styles.button, ...styles.secondary }}
                onClick={() => setReply("")}
              >
                Clear
              </button>
            </div>

            {speaking && (
              <p style={{ color: "#16834a", fontSize: "13px" }}>
                {usingAI
                  ? "● Playing AI-generated voice..."
                  : "● Speaking..."}
              </p>
            )}
          </section>
        </div>

        {/* Quick communication cards */}
        <section style={styles.card}>
          <h2 style={{ marginTop: 0 }}>⚡ Quick Communication Cards</h2>

          <p style={{ color: "#7a8496", fontSize: "13px" }}>
            Tap any message to prepare it for speaking.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
              gap: "12px",
            }}
          >
            {cards.map((item, index) => (
              <button
                key={index}
                onClick={() => useCard(item.title)}
                style={{
                  background: "#f3f6fc",
                  border: "1px solid #e4eaf3",
                  borderRadius: "13px",
                  padding: "18px 12px",
                  cursor: "pointer",
                  textAlign: "center",
                  color: "#27364c",
                  minHeight: "105px",
                }}
              >
                <div style={{ fontSize: "26px", marginBottom: "9px" }}>
                  {item.icon}
                </div>
                <div style={{ fontWeight: 600, fontSize: "13px" }}>
                  {item.title}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer
          style={{
            textAlign: "center",
            padding: "35px 10px",
            color: "#8590a2",
            fontSize: "13px",
          }}
        >
          <div style={{ fontSize: "20px", fontWeight: 800, color: "#2864db" }}>
            ECHO
          </div>
          Communication should be a shared responsibility.
          <p>Designed for a more accessible world.</p>
        </footer>
      </main>
    </div>
  );
}
