import { useState } from "react";
import { joinCall, leaveCall } from "./agoraClient.js";
import {
  getToken,
  startTranscript,
  queryTranscript,
  stopTranscript,
  generateSummary,
} from "./api.js";
import "./App.css";

function generateUid() {
  return Math.floor(Math.random() * 1000000) + 1;
}

export default function App() {
  const [channelName, setChannelName] = useState("demo-channel");
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState("");

  const [rtcUid, setRtcUid] = useState(null);
  const [agentId, setAgentId] = useState("");
  const [transcriptData, setTranscriptData] = useState(null);
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [transcriptError, setTranscriptError] = useState("");
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const [summaryData, setSummaryData] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const handleJoin = async () => {
    setError("");

    try {
      const uid = generateUid();
      setRtcUid(uid);

      setStatus("Fetching token from server...");
      const tokenResponse = await getToken(channelName, uid);

      await joinCall({
        appId: tokenResponse.appId,
        channel: tokenResponse.channel,
        token: tokenResponse.token,
        uid: tokenResponse.uid,
        localContainerId: "local-video",
        remoteContainerId: "remote-video",
        onStatusChange: setStatus,
        onTranscriptLine: ({ line, raw }) => {
          setTranscriptLines((prev) => {
            const trimmed = line?.trim();
            if (!trimmed) return prev;
            if (prev.includes(trimmed)) return prev;
            return [...prev, trimmed];
          });
          setTranscriptData(raw);
        },
      });

      setJoined(true);
      setStatus("Joined successfully");
    } catch (err) {
      console.error("Join failed:", err);
      setError(err?.message || "Failed to join");
      setStatus("Join failed");
    }
  };

  const handleLeave = async () => {
    setError("");

    try {
      await leaveCall(setStatus);
      setJoined(false);
      setRtcUid(null);
      setAgentId("");
      setTranscriptData(null);
      setTranscriptLines([]);
      setTranscriptError("");
      setTranscriptLoading(false);
      setSummaryData(null);
      setSummaryError("");
      setSummaryLoading(false);
    } catch (err) {
      console.error("Leave failed:", err);
      setError(err?.message || "Failed to leave");
    }
  };

  const handleStartTranscript = async () => {
    setTranscriptError("");
    setTranscriptLoading(true);

    try {
      if (!joined) throw new Error("Join the call before starting transcript.");
      if (!rtcUid) throw new Error("Missing RTC UID.");
      if (agentId) throw new Error("Transcript already running.");

      const result = await startTranscript(channelName, rtcUid);
      const returnedAgentId =
        result?.agent_id || result?.agentId || result?.data?.agent_id || "";

      if (!returnedAgentId) {
        throw new Error("Transcript started but no agent_id was returned.");
      }

      setAgentId(returnedAgentId);
      setTranscriptData(result);
      setTranscriptLines([]);
      setSummaryData(null);
      setSummaryError("");
      setStatus("Transcript started");
    } catch (err) {
      console.error("Start transcript failed:", err);
      setTranscriptError(err?.message || "Failed to start transcript");
      setStatus("Transcript start failed");
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleQueryTranscript = async () => {
    setTranscriptError("");
    setTranscriptLoading(true);

    try {
      if (!agentId) throw new Error("No agentId found. Start transcript first.");

      const result = await queryTranscript(agentId);
      setTranscriptData({
        queriedAt: new Date().toISOString(),
        result,
      });
      setStatus("Transcript status queried");
    } catch (err) {
      console.error("Query transcript failed:", err);
      setTranscriptError(err?.message || "Failed to query transcript");
      setStatus("Transcript query failed");
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleStopTranscript = async () => {
    setTranscriptError("");
    setTranscriptLoading(true);

    try {
      if (!agentId) throw new Error("No agentId found. Start transcript first.");

      const result = await stopTranscript(agentId);
      setTranscriptData(result);
      setStatus("Transcript stopped");
      setAgentId("");
    } catch (err) {
      console.error("Stop transcript failed:", err);
      setTranscriptError(err?.message || "Failed to stop transcript");
      setStatus("Transcript stop failed");
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setSummaryError("");
    setSummaryLoading(true);

    try {
      if (transcriptLines.length === 0) {
        throw new Error("No transcript lines available yet.");
      }

      const result = await generateSummary(transcriptLines);
      setSummaryData(result);
      setStatus("Summary generated");
    } catch (err) {
      console.error("Generate summary failed:", err);
      setSummaryError(err?.message || "Failed to generate summary");
      setStatus("Summary generation failed");
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="app">
      <h1>Agora RTC + STT Demo</h1>
      <p className="subtitle">
        Video calling with live transcript parsing and AI meeting notes
      </p>

      <section className="panel">
        <h2>Video Call</h2>

        <div className="controls">
          <input
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            disabled={joined}
            placeholder="Channel name"
          />

          {!joined ? (
            <button onClick={handleJoin}>Join Call</button>
          ) : (
            <button onClick={handleLeave}>Leave Call</button>
          )}
        </div>

        <p>
          <strong>Status:</strong> {status}
        </p>
        <p>
          <strong>RTC UID:</strong> {rtcUid || "Not joined"}
        </p>

        {error && <div className="error-box">{error}</div>}

        <div className="video-grid">
          <div>
            <h3>Local Video</h3>
            <div id="local-video" className="video-box" />
          </div>

          <div>
            <h3>Remote Video</h3>
            <div id="remote-video" className="video-box" />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Transcript Controls</h2>

        <div className="controls">
          <button
            onClick={handleStartTranscript}
            disabled={!joined || transcriptLoading || !!agentId}
          >
            {transcriptLoading ? "Working..." : "Start Transcript"}
          </button>

          <button
            onClick={handleQueryTranscript}
            disabled={transcriptLoading || !agentId}
          >
            {transcriptLoading ? "Working..." : "Query STT Status"}
          </button>

          <button
            onClick={handleStopTranscript}
            disabled={transcriptLoading || !agentId}
          >
            {transcriptLoading ? "Working..." : "Stop Transcript"}
          </button>
        </div>

        <p>
          <strong>Agent ID:</strong> {agentId || "Not started"}
        </p>

        {transcriptError && (
          <div className="error-box">
            <strong>Transcript Error:</strong> {transcriptError}
          </div>
        )}

        <div className="transcript-box">
          <h3>Transcript Lines</h3>
          {transcriptLines.length > 0 ? (
            <ul className="transcript-list">
              {transcriptLines.map((line, idx) => (
                <li key={`${idx}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : (
            <p>No transcript lines received yet.</p>
          )}
        </div>

        <div className="transcript-box">
          <h3>Combined Transcript</h3>
          {transcriptLines.length > 0 ? (
            <p>{transcriptLines.join(" ")}</p>
          ) : (
            <p>No transcript text yet.</p>
          )}
        </div>

        <div className="transcript-box">
          <h3>Raw STT Payload</h3>
          <pre>
            {transcriptData
              ? JSON.stringify(transcriptData, null, 2)
              : "No STT data yet."}
          </pre>
        </div>
      </section>

      <section className="panel">
        <h2>Meeting Notes</h2>
        <p>Generate concise meeting notes from the transcript collected above.</p>

        <div className="controls">
          <button
            onClick={handleGenerateSummary}
            disabled={summaryLoading || transcriptLines.length === 0}
          >
            {summaryLoading ? "Generating..." : "Generate Summary"}
          </button>
        </div>

        {summaryError && (
          <div className="error-box">
            <strong>Summary Error:</strong> {summaryError}
          </div>
        )}

        {summaryData ? (
          <div className="summary-grid">
            <div className="summary-box">
              <h3>Summary</h3>
              <p>{summaryData.summary}</p>
            </div>

            <div className="summary-box">
              <h3>Key Points</h3>
              {summaryData.keyPoints?.length > 0 ? (
                <ul className="transcript-list">
                  {summaryData.keyPoints.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No key points.</p>
              )}
            </div>

            <div className="summary-box">
              <h3>Action Items</h3>
              {summaryData.actionItems?.length > 0 ? (
                <ul className="transcript-list">
                  {summaryData.actionItems.map((item, idx) => (
                    <li key={`${idx}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>No action items.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="summary-box">
            <p>No summary generated yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}