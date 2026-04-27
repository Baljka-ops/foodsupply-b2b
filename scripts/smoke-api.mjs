const base = String(process.env.API_BASE || "http://localhost:5000").replace(/\/+$/, "");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function run() {
  const emailSuffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `smoke-${emailSuffix}@example.test`;
  const password = "smokeTest123";

  console.log(`[smoke] API base: ${base}`);

  const healthRes = await fetch(`${base}/api/health`);
  const healthJson = await readJson(healthRes);
  assert(healthRes.ok, `[health] expected 200, got ${healthRes.status}`);
  assert(healthJson?.ok === true, "[health] ok flag is not true");
  console.log("[smoke] health ok");

  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "buyer",
      company: "Smoke Buyer LLC",
      email,
      password,
      contactName: "Smoke Test",
      phone: "99112233",
      address: "Ulaanbaatar",
      businessType: "store",
    }),
  });
  const registerJson = await readJson(registerRes);
  assert(registerRes.status === 201, `[register] expected 201, got ${registerRes.status}`);
  assert(registerJson?.ok === true, "[register] ok flag is not true");
  assert(typeof registerJson?.token === "string" && registerJson.token.length > 20, "[register] token missing");
  console.log("[smoke] register ok");

  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: "buyer",
      email,
      password,
    }),
  });
  const loginJson = await readJson(loginRes);
  assert(loginRes.ok, `[login] expected 200, got ${loginRes.status}`);
  assert(loginJson?.ok === true, "[login] ok flag is not true");
  assert(typeof loginJson?.token === "string" && loginJson.token.length > 20, "[login] token missing");
  console.log("[smoke] login ok");

  const token = loginJson.token;

  const meRes = await fetch(`${base}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const meJson = await readJson(meRes);
  assert(meRes.ok, `[me] expected 200, got ${meRes.status}`);
  assert(meJson?.ok === true, "[me] ok flag is not true");
  assert(meJson?.user?.email === email, "[me] returned email mismatch");
  console.log("[smoke] me ok");

  const stateRes = await fetch(`${base}/api/state`);
  const stateJson = await readJson(stateRes);
  assert(stateRes.ok, `[state get] expected 200, got ${stateRes.status}`);
  assert(stateJson?.ok === true && stateJson?.state && typeof stateJson.state === "object", "[state get] invalid state payload");
  console.log("[smoke] state get ok");

  const saveRes = await fetch(`${base}/api/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      state: stateJson.state,
    }),
  });
  const saveJson = await readJson(saveRes);
  assert(saveRes.ok, `[state post] expected 200, got ${saveRes.status}`);
  assert(saveJson?.ok === true, "[state post] ok flag is not true");
  console.log("[smoke] state post ok");

  console.log("[smoke] SUCCESS");
}

run().catch((error) => {
  console.error("[smoke] FAILED:", error.message);
  process.exit(1);
});

