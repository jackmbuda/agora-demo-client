const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function handleResponse(response, defaultMessage) {
  const text = await response.text();

  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.detail ||
      data?.reason ||
      data?.raw ||
      defaultMessage ||
      "Request failed";
    throw new Error(message);
  }

  return data;
}

export async function getToken(channel, uid) {
  const response = await fetch(
    `${API_BASE_URL}/token?channel=${encodeURIComponent(channel)}&uid=${uid}`
  );

  return handleResponse(response, "Failed to fetch token");
}

export async function startTranscript(channel, uid) {
  const response = await fetch(`${API_BASE_URL}/stt/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, uid }),
  });

  return handleResponse(response, "Failed to start transcript");
}

export async function queryTranscript(agentId) {
  const response = await fetch(
    `${API_BASE_URL}/stt/query?agentId=${encodeURIComponent(agentId)}`
  );

  return handleResponse(response, "Failed to query transcript");
}

export async function stopTranscript(agentId) {
  const response = await fetch(`${API_BASE_URL}/stt/stop`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agentId }),
  });

  return handleResponse(response, "Failed to stop transcript");
}

export async function fetchTranscript(agentId) {
  const response = await fetch(
    `${API_BASE_URL}/transcript?agentId=${encodeURIComponent(agentId)}`
  );

  return handleResponse(response, "Failed to fetch transcript");
}

export async function generateSummary(transcriptLines) {
  const response = await fetch(`${API_BASE_URL}/summary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transcript: transcriptLines }),
  });

  return handleResponse(response, "Failed to generate summary");
}