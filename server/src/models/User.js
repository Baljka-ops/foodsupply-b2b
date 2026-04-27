const mongoose = require("mongoose");

const verificationHistorySchema = new mongoose.Schema(
  {
    action: { type: String, default: "" },
    fromStatus: { type: String, default: "" },
    toStatus: { type: String, default: "" },
    status: { type: String, default: "" },
    note: { type: String, default: "" },
    changedBy: { type: String, default: "" },
    changedAt: { type: String, default: "" },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, index: true },
    role: { type: String, required: true, default: "buyer" },
    company: { type: String, required: true, default: "" },
    companyName: { type: String, default: "" },
    registerNumber: { type: String, default: "" },
    email: { type: String, required: true, default: "", lowercase: true, trim: true },
    password: { type: String, required: true, default: "" },
    contactName: { type: String, default: "" },
    contactPersonName: { type: String, default: "" },
    phone: { type: String, default: "" },
    contactPersonPhone: { type: String, default: "" },
    contactPersonEmail: { type: String, default: "" },
    address: { type: String, default: "" },
    locationNote: { type: String, default: "" },
    contactPhone: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    mapUrl: { type: String, default: "" },
    businessType: { type: String, default: "" },
    bankName: { type: String, default: "" },
    bankAccountName: { type: String, default: "" },
    bankAccountNumber: { type: String, default: "" },
    bankAccount: { type: String, default: "" },
    qpayReceiverCode: { type: String, default: "" },
    supplierAgreementAccepted: { type: Boolean, default: false },
    supplierAgreementAcceptedAt: { type: String, default: "" },
    verificationStatus: { type: String, default: "pending" },
    verificationNote: { type: String, default: "" },
    verifiedAt: { type: String, default: "" },
    verifiedBy: { type: String, default: "" },
    verificationHistory: { type: [verificationHistorySchema], default: [] },
    rewardPoints: { type: Number, default: 0 },
    totalEarnedPoints: { type: Number, default: 0 },
    totalUsedPoints: { type: Number, default: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  {
    collection: "users",
  }
);

userSchema.index({ email: 1, role: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

module.exports = { User };
