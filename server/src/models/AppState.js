const mongoose = require("mongoose");

const appStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "primary",
    },
    state: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: "app_states",
  }
);

const AppState = mongoose.model("AppState", appStateSchema);

module.exports = { AppState };
