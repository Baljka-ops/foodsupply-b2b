const clients = new Set();
let eventId = 0;

function writeEvent(res, eventName, payload) {
  const id = ++eventId;
  const data = JSON.stringify(payload || {});
  res.write(`id: ${id}\n`);
  if (eventName) {
    res.write(`event: ${eventName}\n`);
  }
  res.write(`data: ${data}\n\n`);
}

function registerStateStreamClient(res) {
  clients.add(res);
  writeEvent(res, "connected", { ok: true, ts: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    writeEvent(res, "ping", { ts: new Date().toISOString() });
  }, 25_000);

  return () => {
    clearInterval(heartbeat);
    clients.delete(res);
  };
}

function broadcastStateChanged(meta = {}) {
  if (clients.size === 0) return;
  const payload = {
    ts: new Date().toISOString(),
    ...meta,
  };

  clients.forEach((res) => {
    try {
      writeEvent(res, "state-changed", payload);
    } catch {
      clients.delete(res);
    }
  });
}

module.exports = {
  registerStateStreamClient,
  broadcastStateChanged,
};

