const mongoose = require("mongoose");

const commissionInvoiceSchema = new mongoose.Schema(
  {
    invoiceId: { type: String, default: "" },
    invoiceNo: { type: String, default: "" },
    qrText: { type: String, default: "" },
    qrImage: { type: String, default: "" },
    deepLink: { type: String, default: "" },
    webUrl: { type: String, default: "" },
    status: { type: String, default: "unpaid" },
    issuedAt: { type: String, default: "" },
    paidAt: { type: String, default: "" },
    receiverCode: { type: String, default: "" },
    mode: { type: String, default: "mock" },
  },
  { _id: false }
);

const commissionStatementSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      index: true,
    },
    supplierCompany: {
      type: String,
      required: true,
      index: true,
    },
    currency: {
      type: String,
      default: "MNT",
    },
    grossAmount: {
      type: Number,
      default: 0,
    },
    commissionRate: {
      type: Number,
      default: 0,
    },
    commissionAmount: {
      type: Number,
      default: 0,
    },
    netAmount: {
      type: Number,
      default: 0,
    },
    orderCount: {
      type: Number,
      default: 0,
    },
    orderIds: {
      type: [Number],
      default: [],
    },
    status: {
      type: String,
      default: "draft",
    },
    generatedBy: {
      type: String,
      default: "",
    },
    generatedAt: {
      type: String,
      default: "",
    },
    commissionInvoice: {
      type: commissionInvoiceSchema,
      default: () => ({}),
    },
  },
  {
    collection: "commission_statements",
    timestamps: true,
  }
);

commissionStatementSchema.index({ month: 1, supplierCompany: 1 }, { unique: true });

const CommissionStatement = mongoose.model("CommissionStatement", commissionStatementSchema);

module.exports = { CommissionStatement };
