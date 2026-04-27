const { AppState } = require("../models/AppState");
const { User } = require("../models/User");
const { sanitizeStateInput } = require("./sanitizeState");
const { buildCurrentState, recomputeStateMeta } = require("./roleStateAccess");

async function readCurrentState() {
  const [stateDoc, users] = await Promise.all([
    AppState.findOne({ key: "primary" }).lean(),
    User.find({}).sort({ id: 1 }).lean(),
  ]);
  return buildCurrentState(stateDoc, users, { includeSensitiveUsers: true });
}

async function writeCurrentState(nextState) {
  const stateToPersist = sanitizeStateInput(recomputeStateMeta(nextState));
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
  return stateToPersist;
}

module.exports = {
  readCurrentState,
  writeCurrentState,
};
