import AgoraRTC from "agora-rtc-sdk-ng";
import protobuf from "protobufjs/light";
import sttJson from "./SttMessage_es6.js";

let client = null;
let localTracks = {
  audioTrack: null,
  videoTrack: null,
};

const root = protobuf.Root.fromJSON(sttJson);
const TextMessage = root.lookupType("Agora.SpeechToText.Text");

// Must match pubBotUid in your Go STT start handler.
const STT_BOT_UID = 88222;

function decodeSttMessage(data) {
  try {
    const uint8 =
      data instanceof Uint8Array ? data : new Uint8Array(data);
    const decoded = TextMessage.decode(uint8);
    return TextMessage.toObject(decoded, {
      longs: String,
      enums: String,
      defaults: true,
    });
  } catch (err) {
    console.error("Failed to decode STT protobuf:", err);
    return null;
  }
}

function textFromDecodedMessage(msg) {
  if (!msg) return "";

  if (Array.isArray(msg.words) && msg.words.length > 0) {
    return msg.words.map((w) => w?.text || "").filter(Boolean).join(" ").trim();
  }

  if (
    msg.original_transcript &&
    Array.isArray(msg.original_transcript.words) &&
    msg.original_transcript.words.length > 0
  ) {
    return msg.original_transcript.words
      .map((w) => w?.text || "")
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  return "";
}

export async function joinCall({
  appId,
  channel,
  token,
  uid = null,
  localContainerId,
  remoteContainerId,
  onStatusChange,
  onTranscriptLine,
}) {
  try {
    onStatusChange?.("Creating Agora client...");
    client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

    client.on("user-published", async (user, mediaType) => {
      await client.subscribe(user, mediaType);

      if (mediaType === "video") {
        const remoteContainer = document.getElementById(remoteContainerId);
        if (remoteContainer) {
          remoteContainer.innerHTML = "";
          const remotePlayer = document.createElement("div");
          remotePlayer.style.width = "100%";
          remotePlayer.style.height = "100%";
          remoteContainer.appendChild(remotePlayer);
          user.videoTrack.play(remotePlayer);
        }
      }

      if (mediaType === "audio") {
        user.audioTrack.play();
      }

      onStatusChange?.("Remote user connected");
    });

    client.on("user-left", () => {
      onStatusChange?.("Remote user left");
    });

    client.on("stream-message", (uidFromStream, data) => {
      console.log("stream-message", { uidFromStream, data });

      if (Number(uidFromStream) !== STT_BOT_UID) {
        return;
      }

      const decoded = decodeSttMessage(data);
      console.log("Decoded STT message:", decoded);

      const line = textFromDecodedMessage(decoded);
      if (line) {
        onTranscriptLine?.({
          uid: uidFromStream,
          line,
          raw: decoded,
        });
      }
    });

    onStatusChange?.("Requesting camera and microphone...");
    const [audioTrack, videoTrack] =
      await AgoraRTC.createMicrophoneAndCameraTracks();

    localTracks.audioTrack = audioTrack;
    localTracks.videoTrack = videoTrack;

    onStatusChange?.("Joining channel...");
    await client.join(appId, channel, token, uid);

    onStatusChange?.("Publishing local tracks...");
    await client.publish([audioTrack, videoTrack]);

    const localContainer = document.getElementById(localContainerId);
    if (localContainer) {
      localContainer.innerHTML = "";
      const localPlayer = document.createElement("div");
      localPlayer.style.width = "100%";
      localPlayer.style.height = "100%";
      localContainer.appendChild(localPlayer);
      videoTrack.play(localPlayer);
    }

    onStatusChange?.("Joined successfully");
  } catch (error) {
    console.error("joinCall error:", error);
    onStatusChange?.("Join failed");
    throw error;
  }
}

export async function leaveCall(onStatusChange) {
  try {
    Object.values(localTracks).forEach((track) => {
      if (track) {
        track.stop();
        track.close();
      }
    });

    localTracks.audioTrack = null;
    localTracks.videoTrack = null;

    if (client) {
      await client.leave();
      client.removeAllListeners();
      client = null;
    }

    onStatusChange?.("Left call");
  } catch (error) {
    console.error("leaveCall error:", error);
    throw error;
  }
}