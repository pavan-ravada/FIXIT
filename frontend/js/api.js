import { BASE_URL } from "./config.js";

async function request(url, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(BASE_URL + url, options);
  const data = await res.json().catch(() => ({}));

  // ❌ Backend error → throw readable message
  if (!res.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data;
}

export const apiPost = (url, body) => request(url, "POST", body);
export const apiGet = (url) => request(url, "GET");
