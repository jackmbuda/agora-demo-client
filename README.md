# Agora RTC + STT + AI Summary Demo

This project is a small end-to-end demo that shows how to:

1. join a real-time video call with **Agora RTC**
2. turn spoken audio into a live transcript with **Agora STT**
3. generate structured meeting notes with an **LLM**

It is designed as a take-home prototype, not a production-ready application.

---

## What this repo does

The app has three main pieces:

- **Video calling**
  - Users join the same Agora channel from the browser
  - Local and remote audio/video are rendered in the UI

- **Speech-to-text**
  - The frontend asks the backend to start an Agora STT agent
  - The STT agent joins the same channel
  - Transcript messages are received in the browser through Agora stream messages
  - The UI displays transcript lines live

- **Meeting notes**
  - The frontend sends collected transcript lines to the backend
  - The backend calls the OpenAI API
  - The app displays:
    - a short summary
    - key points
    - action items

---

## Why the repo works

The app works because the responsibilities are split cleanly between the browser and the backend.

### Frontend (`client/`)
The React app is responsible for:

- rendering the UI
- joining and leaving Agora RTC channels
- displaying local and remote video
- receiving live STT stream messages from Agora
- showing transcript lines as they arrive
- calling the backend for token generation and summary generation

### Backend (`server/`)
The Go server is responsible for:

- generating Agora RTC tokens securely
- starting, querying, and stopping the Agora STT agent
- keeping Agora secrets off the frontend
- calling the OpenAI API for meeting-note generation

### Why this architecture is useful
This split is important because:

- **Agora App Certificate** should stay on the server
- **OpenAI API key** should stay on the server
- RTC media rendering is best handled in the browser
- STT setup and LLM calls are easier and safer to coordinate from a backend

---

## Project structure

```text
agora-demo/
  client/
    package.json
    vite.config.js
    .env
    src/
      App.jsx
      App.css
      api.js
      agoraClient.js
      main.jsx
      index.css
      SttMessage.proto
      SttMessage_es6.js

  server/
    go.mod
    .env
    main.go
```

---

## Tech stack

### Frontend
- React
- Vite
- `agora-rtc-sdk-ng`
- `protobufjs`

### Backend
- Go
- Agora Go token builder
- Agora Real-Time STT REST API
- OpenAI Chat Completions API

---

## Prerequisites

You need:

- Node.js and npm
- Go
- an Agora project
- an OpenAI API key

---

## Agora credentials you need

### From your Agora project
- **App ID**
- **App Certificate**

### From Agora RESTful API credentials
- **Customer ID**
- **Customer Secret**

These are used for:
- RTC token generation
- STT REST API authentication

---

## Environment variables

## `client/.env`

```env
VITE_API_BASE_URL=http://localhost:8080
```

## `server/.env`

```env
AGORA_APP_ID=your_agora_app_id
AGORA_APP_CERTIFICATE=your_agora_app_certificate
AGORA_CUSTOMER_ID=your_agora_customer_id
AGORA_CUSTOMER_SECRET=your_agora_customer_secret
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini
PORT=8080
```

---

## Important Agora setup notes

Before running the app, make sure:

1. your Agora project is created and active
2. Real-Time STT is enabled for that project
3. your App ID / App Certificate are from the same project
4. your Customer ID / Customer Secret are valid for Agora REST APIs

---

## Install dependencies

## Frontend

From the `client/` directory:

```bash
npm install
```

If needed, install protobuf tooling:

```bash
npm install protobufjs@^7.5.4
npm install -D protobufjs-cli@2.0.0
```

If you ever need to regenerate the STT protobuf JSON module:

```bash
./node_modules/.bin/pbjs -t json-module -w es6 ./src/SttMessage.proto > ./src/SttMessage_es6.js
```

## Backend

From the `server/` directory:

```bash
go mod tidy
```

---

## How to run the app

You need **two terminals**.

## Terminal 1: backend

```bash
cd server
go run main.go
```

Expected output:

```text
Server listening on http://localhost:8080
```

## Terminal 2: frontend

```bash
cd client
npm run dev
```

Open the local Vite URL in your browser.

---

## How to use the app

### Make a video call

1. Enter a channel name
2. Click **Join Call**
3. Allow camera and microphone access
4. Open the app in a second browser window or second device
5. Join the same channel name there

You should now see:
- local video
- remote video
- working audio

### Start live transcript

1. Click **Start Transcript**
2. Speak into the call
3. Watch transcript lines appear in the **Transcript Lines** section

### Generate meeting notes

1. Let transcript lines accumulate
2. Click **Generate Summary**
3. Review:
   - summary
   - key points
   - action items

---

## Current workflow

1. React requests an RTC token from the Go backend
2. React joins Agora RTC
3. Backend starts the Agora STT agent
4. STT sends transcript data back through Agora stream messages
5. React parses those stream messages with protobuf
6. React accumulates transcript lines
7. React sends transcript lines to the backend
8. Backend generates structured notes with OpenAI

---

## What is working

- joining and leaving a video call
- local and remote video/audio
- backend token generation
- starting and stopping Agora STT
- live transcript lines displayed in the browser
- AI-generated meeting notes from transcript text

---

## What is not production-ready

This is a prototype. A production version would need:

- persistent transcript/session storage
- stronger error handling and retries
- better auth and access control
- token refresh handling
- more robust transcript deduplication
- better speaker separation
- stronger frontend state management
- tests and CI
- deployment configuration

---

## Troubleshooting

### Invalid vendor key / cannot find appid
Usually means:
- wrong App ID
- wrong token
- App ID and token do not belong to the same project

### Start Transcript succeeds but no transcript lines appear
Check:
- browser console for `stream-message` logs
- STT bot UID matches the client expectation
- the app is using the stream-message parsing version of `agoraClient.js`

### Summary generation fails
Check:
- `OPENAI_API_KEY`
- backend logs
- model name in `OPENAI_MODEL`

### No video appears
Check:
- browser camera/mic permissions
- channel names match
- both users joined the same channel
- RTC token is valid

---

## Suggested demo flow

A clean 3–5 minute demo could be:

1. show the app layout
2. join a call from two browser windows
3. start transcript
4. speak and show transcript lines appearing live
5. generate summary
6. explain the architecture briefly:
   - React frontend
   - Go backend
   - Agora RTC + STT
   - OpenAI summary endpoint

---

## Notes for reviewers

This project intentionally prioritizes:
- speed of execution
- clear architecture
- functional demo flow
- readable implementation

It does not try to solve every edge case.

---

## License

This project is for demonstration / take-home exercise purposes.
