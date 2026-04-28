const BASE_URL = (process.env.EVOLUTION_API_URL || "").trim().replace(/\/$/, "");
const API_KEY = (process.env.EVOLUTION_API_KEY || "").trim();

const headers = {
  "Content-Type": "application/json",
  apikey: API_KEY,
};

export async function createInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
  return res.json();
}

export async function getQR(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connect/${instanceName}`, {
    method: "GET",
    headers,
  });
  return res.json();
}

export async function getInstanceStatus(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/connectionState/${instanceName}`, {
    method: "GET",
    headers,
  });
  return res.json();
}

export async function sendMessage(instanceName: string, to: string, text: string) {
  const res = await fetch(`${BASE_URL}/message/sendText/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      number: to,
      text,
    }),
  });
  return res.json();
}

export async function setWebhook(instanceName: string, webhookUrl: string) {
  const res = await fetch(`${BASE_URL}/webhook/set/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
  return res.json();
}

export async function deleteInstance(instanceName: string) {
  const res = await fetch(`${BASE_URL}/instance/delete/${instanceName}`, {
    method: "DELETE",
    headers,
  });
  return res.json();
}

export async function getMediaBase64(instanceName: string, message: unknown) {
  const res = await fetch(`${BASE_URL}/chat/getBase64FromMediaMessage/${instanceName}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message }),
  });
  return res.json();
}
