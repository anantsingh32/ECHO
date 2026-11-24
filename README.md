# HEAR ME — Communication Bridge MVP

A React + FastAPI accessibility communication demo.

## Features
- Browser-based live speech captions (Web Speech API; best supported in Chrome)
- Typed replies spoken aloud using browser speech synthesis
- Quick communication cards
- Context suggestions for hospital, bank, shopping and general situations
- FastAPI backend with SQLite interaction logging
- Optional ElevenLabs text-to-speech endpoint

## Requirements
- Windows 10/11
- Python 3.10+
- Node.js 20+
- Google Chrome recommended

## 1. Start the backend (PowerShell)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```
Backend: http://127.0.0.1:8000  
API docs: http://127.0.0.1:8000/docs

If PowerShell blocks activation, run:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

## 2. Start the frontend (a second PowerShell window)
```powershell
cd frontend
npm install
npm run dev
```
Open the URL printed by Vite, usually http://localhost:5173.

## 3. Use the app
1. Allow microphone access when Chrome asks.
2. Choose the spoken language and press **Start listening**.
3. Speak; recognized words appear in the live caption panel.
4. Type a reply and press **Speak reply**.
5. Choose a quick card or a context (Hospital / Bank / Shopping) to load suggested phrases.

## 4. Optional ElevenLabs
Add these values to `backend/.env`:
```env
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=your_voice_id
```
Restart FastAPI. The app will use ElevenLabs for typed replies when configured; otherwise it uses browser speech synthesis.
Never put API keys in the React frontend or commit `.env`.

## Important MVP limitations
- Browser speech recognition availability and accuracy depend on browser, operating system, microphone, network and language.
- The context selector is a demo trigger, not background geofencing. Real geofencing needs explicit location permission and careful privacy controls.
- Call proxy is not implemented; use a clearly labelled simulated call in a later demo.
- No sign-language recognition or translation is claimed.
- Test with deaf, hard-of-hearing and non-speaking users before real-world deployment.
