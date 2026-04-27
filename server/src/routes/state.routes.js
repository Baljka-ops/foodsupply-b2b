const express = require("express");
const { AppState } = require("../models/AppState");
const { User } = require("../models/User");
const { sanitizeStateInput } = require("../utils/sanitizeState");
const { config } = require("../config");
const {
  mergeStateByRole,
  mergeUsersByRole,
  buildCurrentState,
  recomputeStateMeta,
} = require("../utils/roleStateAccess");
const { requireAuth } = require("../utils/accessControl");
const { ApiError, sendSuccess } = require("../utils/http");
const { registerStateStreamClient, broadcastStateChanged } = require("../utils/stateEvents");

const router = express.Router();

router.get("/state/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write("retry: 2500\n\n");

  const unregister = registerStateStreamClient(res);
  req.on("close", unregister);
});

router.get("/state", async (_req, res, next) => {
  try {
    const [stateDoc, users] = await Promise.all([
      AppState.findOne({ key: "primary" }).lean(),
      User.find({}).sort({ id: 1 }).lean(),
    ]);

    const state = buildCurrentState(stateDoc, users);

    return sendSuccess(res, {
      message: "State амжилттай уншигдлаа.",
      data: { state },
      extra: { state },
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/state",
  requireAuth({ allowLegacyHeaders: config.allowLegacyRoleHeaders }),
  async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== "object" || !req.body.state || typeof req.body.state !== "object") {
      throw new ApiError(400, "State payload буруу байна.", [
        { field: "state", message: "state object шаардлагатай." },
      ]);
    }

    const incomingState = sanitizeStateInput(req.body.state);
    const actor = req.actor;

    const [stateDoc, users] = await Promise.all([
      AppState.findOne({ key: "primary" }).lean(),
      User.find({}).sort({ id: 1 }).lean(),
    ]);

    const currentState = buildCurrentState(stateDoc, users, { includeSensitiveUsers: true });
    const roleScopedState = mergeStateByRole(currentState, incomingState, actor);
    const roleScopedUsers = mergeUsersByRole(currentState.users, incomingState.users, actor);

    const stateToPersist = sanitizeStateInput(
      recomputeStateMeta({
        ...roleScopedState,
        users: roleScopedUsers,
      })
    );

    await AppState.updateOne(
      { key: "primary" },
      {
        $set: {
          key: "primary",
          state: stateToPersist,
        },
      },
      { upsert: true }
    );

    await User.deleteMany({});
    if (stateToPersist.users.length > 0) {
      await User.insertMany(stateToPersist.users, { ordered: true });
    }

    broadcastStateChanged({
      actor: actor.role,
      company: actor.company,
      updatedAt: new Date().toISOString(),
    });

    const updatedAt = new Date().toISOString();
    return sendSuccess(res, {
      message: "State амжилттай хадгалагдлаа.",
      data: {
        saved: true,
        actor: actor.role,
        updatedAt,
      },
      extra: {
        saved: true,
        actor: actor.role,
        updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = { stateRouter: router };
