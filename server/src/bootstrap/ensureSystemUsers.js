const { User } = require("../models/User");
const { config } = require("../config");
const { hashPassword } = require("../utils/auth");
const { readCurrentState, writeCurrentState } = require("../utils/stateStore");

function normalizeSeed(seed = {}) {
  return {
    role: String(seed.role || "").trim().toLowerCase(),
    email: String(seed.email || "").trim().toLowerCase(),
    password: String(seed.password || "").trim(),
    company: String(seed.company || "").trim(),
    companyName: String(seed.companyName || seed.company || "").trim(),
    registerNumber: String(seed.registerNumber || "").trim(),
    contactName: String(seed.contactName || "").trim(),
    contactPersonName: String(seed.contactPersonName || seed.contactName || "").trim(),
    phone: String(seed.phone || "").trim(),
    contactPersonPhone: String(seed.contactPersonPhone || seed.phone || "").trim(),
    contactPersonEmail: String(seed.contactPersonEmail || seed.email || "").trim().toLowerCase(),
    address: String(seed.address || "").trim(),
    businessType: String(seed.businessType || "").trim(),
    bankName: String(seed.bankName || "").trim(),
    bankAccountName: String(seed.bankAccountName || "").trim(),
    bankAccountNumber: String(seed.bankAccountNumber || "").trim(),
    bankAccount: String(seed.bankAccount || "").trim(),
    qpayReceiverCode: String(seed.qpayReceiverCode || "").trim(),
    supplierAgreementAccepted: Boolean(seed.supplierAgreementAccepted || false),
    verificationStatus: String(seed.verificationStatus || "").trim().toLowerCase(),
    verificationNote: String(seed.verificationNote || "").trim(),
    verifiedAt: String(seed.verifiedAt || "").trim(),
    verifiedBy: String(seed.verifiedBy || "").trim(),
    verificationHistory: Array.isArray(seed.verificationHistory) ? seed.verificationHistory : [],
  };
}

function getSystemSeeds() {
  const seeds = [
    normalizeSeed({
      role: "buyer",
      email: config.seedBuyerEmail,
      password: config.seedBuyerPassword,
      company: config.seedBuyerCompany,
      contactName: config.seedBuyerContactName,
      phone: config.seedBuyerPhone,
      address: config.seedBuyerAddress,
      businessType: "store",
    }),
    normalizeSeed({
      role: "supplier",
      email: config.seedSupplierEmail,
      password: config.seedSupplierPassword,
      company: config.seedSupplierCompany,
      contactName: config.seedSupplierContactName,
      phone: config.seedSupplierPhone,
      registerNumber: "9000001",
      contactPersonPhone: config.seedSupplierPhone,
      contactPersonEmail: config.seedSupplierEmail,
      address: config.seedSupplierAddress,
      businessType: "wholesaler",
      bankName: "Хаан Банк",
      bankAccountName: config.seedSupplierCompany,
      bankAccountNumber: "5000004321",
      bankAccount: config.seedSupplierBankAccount,
      qpayReceiverCode: config.seedSupplierQPayReceiverCode,
      supplierAgreementAccepted: true,
      verificationStatus: "verified",
      verifiedAt: new Date().toISOString(),
      verifiedBy: "system",
      verificationHistory: [
        {
          action: "verify",
          fromStatus: "pending",
          toStatus: "verified",
          status: "verified",
          note: "",
          changedBy: "system",
          changedAt: new Date().toISOString(),
        },
      ],
    }),
    normalizeSeed({
      role: "admin",
      email: config.seedAdminEmail,
      password: config.seedAdminPassword,
      company: config.seedAdminCompany,
      contactName: config.seedAdminContactName,
      phone: config.seedAdminPhone,
      address: config.seedAdminAddress,
      businessType: "admin",
    }),
    normalizeSeed({
      role: "admin",
      email: config.seedAdmin2Email,
      password: config.seedAdmin2Password,
      company: config.seedAdmin2Company,
      contactName: config.seedAdmin2ContactName,
      phone: config.seedAdmin2Phone,
      address: config.seedAdmin2Address,
      businessType: "admin",
    }),
  ].filter((seed) => seed.role && seed.email && seed.password && seed.company);

  const unique = [];
  const seen = new Set();
  for (const seed of seeds) {
    const key = `${seed.role}:${seed.email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(seed);
  }
  return unique;
}

function getStateMeta(source = {}) {
  return source && typeof source.meta === "object" && source.meta ? source.meta : {};
}

function getOrderTimestamp(order) {
  const value = order?.statusUpdatedAt || order?.paymentConfirmedAt || order?.createdAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortOrdersByRecency(orders = []) {
  return [...orders]
    .filter((row) => row && typeof row === "object")
    .sort((left, right) => {
      const timeDelta = getOrderTimestamp(right) - getOrderTimestamp(left);
      if (timeDelta !== 0) return timeDelta;
      return Number(right?.id || 0) - Number(left?.id || 0);
    });
}

async function ensureSystemUsers() {
  if (!config.seedSystemUsers) return;

  const seeds = getSystemSeeds();
  if (seeds.length === 0) return;

  const last = await User.findOne({}).sort({ id: -1 }).lean();
  let nextId = Math.max(1, Number(last?.id || 0) + 1);

  for (const seed of seeds) {
    let user = await User.findOne({ email: seed.email, role: seed.role });

    if (!user) {
      await User.create({
        id: nextId,
        role: seed.role,
        email: seed.email,
        password: hashPassword(seed.password),
        company: seed.company,
        companyName: seed.companyName,
        registerNumber: seed.registerNumber,
        contactName: seed.contactName,
        contactPersonName: seed.contactPersonName,
        phone: seed.phone,
        contactPersonPhone: seed.contactPersonPhone,
        contactPersonEmail: seed.contactPersonEmail,
        address: seed.address,
        businessType: seed.businessType,
        bankName: seed.bankName,
        bankAccountName: seed.bankAccountName,
        bankAccountNumber: seed.bankAccountNumber,
        bankAccount: seed.bankAccount,
        qpayReceiverCode: seed.qpayReceiverCode,
        supplierAgreementAccepted: seed.supplierAgreementAccepted,
        supplierAgreementAcceptedAt: seed.supplierAgreementAccepted ? new Date().toISOString() : "",
        verificationStatus: seed.verificationStatus || (seed.role === "supplier" ? "verified" : ""),
        verificationNote: seed.verificationNote,
        verifiedAt: seed.verifiedAt || "",
        verifiedBy: seed.verifiedBy || "",
        verificationHistory: seed.verificationHistory || [],
        createdAt: new Date().toISOString(),
      });
      // eslint-disable-next-line no-console
      console.log(`[foodsupply-api] system user seeded (${seed.role}: ${seed.email})`);
      nextId += 1;
      continue;
    }

    user.email = seed.email;
    user.company = seed.company;
    user.companyName = seed.companyName;
    user.registerNumber = seed.registerNumber;
    user.contactName = seed.contactName;
    user.contactPersonName = seed.contactPersonName;
    user.phone = seed.phone;
    user.contactPersonPhone = seed.contactPersonPhone;
    user.contactPersonEmail = seed.contactPersonEmail;
    user.address = seed.address;
    user.businessType = seed.businessType;
    user.bankName = seed.bankName;
    user.bankAccountName = seed.bankAccountName;
    user.bankAccountNumber = seed.bankAccountNumber;
    user.bankAccount = seed.bankAccount;
    user.qpayReceiverCode = seed.qpayReceiverCode;
    user.supplierAgreementAccepted = seed.supplierAgreementAccepted;
    user.supplierAgreementAcceptedAt = seed.supplierAgreementAccepted ? new Date().toISOString() : "";
    user.verificationStatus = seed.verificationStatus || (seed.role === "supplier" ? "verified" : "");
    user.verificationNote = seed.verificationNote || "";
    user.verifiedAt = seed.verifiedAt || "";
    user.verifiedBy = seed.verifiedBy || "";
    user.verificationHistory = seed.verificationHistory || [];
    user.password = hashPassword(seed.password);
    await user.save();
    // eslint-disable-next-line no-console
    console.log(`[foodsupply-api] system user synced (${seed.role}: ${seed.email})`);
  }
}

async function pruneLegacyOrdersToFive() {
  const state = await readCurrentState();
  const meta = getStateMeta(state);
  if (meta.orderCleanupDoneV1) return;

  const orders = Array.isArray(state.orders) ? state.orders : [];
  const nextState = {
    ...state,
    orders: orders.length > 5 ? sortOrdersByRecency(orders).slice(0, 5) : orders,
    meta: {
      ...meta,
      orderCleanupDoneV1: true,
      orderCleanupDoneAt: new Date().toISOString(),
    },
  };

  await writeCurrentState(nextState);
}

module.exports = { ensureSystemUsers, pruneLegacyOrdersToFive };
